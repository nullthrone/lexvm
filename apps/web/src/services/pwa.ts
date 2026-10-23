/**
 * Service worker registration, offline readiness, update flow and install
 * prompts. The single-file build never registers a service worker.
 */
import { createStore } from "../state/store.ts";

export type PwaMode = "sw" | "singlefile" | "unsupported";

export interface PwaState {
  mode: PwaMode;
  /** Service worker / precache status. */
  offline: "pending" | "ready" | "error" | "none";
  /** A new version is installed and waiting. */
  updateReady: boolean;
  /** The browser offered an install prompt (beforeinstallprompt). */
  canInstall: boolean;
  /** iOS/iPadOS browser, not yet installed: show "Add to Home Screen" instructions. */
  iosInstallHint: boolean;
  standalone: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const pwa = createStore<PwaState>({
  mode: "unsupported",
  offline: "none",
  updateReady: false,
  canInstall: false,
  iosInstallHint: false,
  standalone: false,
});

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;
let lastUpdateCheck = 0;

function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // ignore
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function swAllowed(): boolean {
  if (__LEXVM_SINGLEFILE__ || !import.meta.env.PROD) return false;
  if (!("serviceWorker" in navigator)) return false;
  const host = location.hostname;
  return location.protocol === "https:" || host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

async function markReadyWhenCached(): Promise<void> {
  try {
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    pwa.update({ offline: keys.some((k) => k.startsWith("lexvm-")) ? "ready" : "error" });
  } catch {
    pwa.update({ offline: "error" });
  }
}

function watchForUpdates(reg: ServiceWorkerRegistration): void {
  const track = (worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // "installed" with an existing controller means: a new version is waiting.
      if (worker.state === "installed" && navigator.serviceWorker.controller) pwa.update({ updateReady: true });
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) pwa.update({ updateReady: true });
  track(reg.installing);
  reg.addEventListener("updatefound", () => track(reg.installing));
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only reload when the player asked for the update (the first install also changes the controller).
    if (reloadRequested) window.location.reload();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - lastUpdateCheck < 30 * 60_000) return;
    lastUpdateCheck = Date.now();
    reg.update().catch(() => undefined);
  });
}

const SW_URL = "./sw.js";

/** The parts of the Trusted Types API used here (not in every TypeScript DOM library). */
interface TrustedTypesLike {
  createPolicy(
    name: string,
    rules: { createScriptURL(input: string): string },
  ): { createScriptURL(input: string): unknown };
}

/**
 * The service worker URL. The page's Content-Security-Policy requires Trusted
 * Types for script URLs; the "lexvm" policy allows exactly this one.
 */
let trustedSwUrl: string | null = null;

function serviceWorkerUrl(): string {
  if (trustedSwUrl !== null) return trustedSwUrl;
  const trustedTypes = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes;
  if (!trustedTypes) return SW_URL;
  // A policy name can be created once per page.
  const policy = trustedTypes.createPolicy("lexvm", {
    createScriptURL(input) {
      if (input !== SW_URL) throw new TypeError(`LexVM: script URL not allowed: ${input}`);
      return input;
    },
  });
  // A TrustedScriptURL; register() accepts it where a string is typed.
  trustedSwUrl = policy.createScriptURL(SW_URL) as string;
  return trustedSwUrl;
}

async function register(): Promise<void> {
  try {
    registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: "./", updateViaCache: "none" });
    lastUpdateCheck = Date.now();
    watchForUpdates(registration);
    await markReadyWhenCached();
  } catch (error) {
    console.warn("LexVM: service worker registration failed", error);
    pwa.update({ offline: "error" });
  }
}

export function initPwa(): void {
  const standalone = isStandalone();
  const mode: PwaMode = __LEXVM_SINGLEFILE__ ? "singlefile" : swAllowed() ? "sw" : "unsupported";
  pwa.update({
    mode,
    standalone,
    offline: mode === "sw" ? "pending" : "none",
    iosInstallHint: mode === "sw" && isIos() && !standalone,
  });
  if (mode !== "sw") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    pwa.update({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    pwa.update({ canInstall: false, iosInstallHint: false });
  });
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });
}

export async function promptInstall(): Promise<void> {
  const prompt = deferredPrompt;
  if (!prompt) return;
  deferredPrompt = null;
  pwa.update({ canInstall: false });
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    // The prompt can only be shown once; ignore failures.
  }
}

/** Activate the waiting service worker and reload once it controls the page. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloadRequested = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
}
