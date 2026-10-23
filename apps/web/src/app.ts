/** App shell: hash router, screen lifecycle, focus management. */

import { closeAllSheets } from "./components/sheet.ts";
import { h } from "./dom.ts";
import { t } from "./i18n.ts";
import { parseRoute, type Route, routeHash } from "./logic/routes.ts";
import { createAboutScreen } from "./screens/about.ts";
import { createGameScreen } from "./screens/game.ts";
import { createLibraryScreen } from "./screens/library.ts";
import { createSettingsScreen } from "./screens/settings.ts";
import { settings } from "./services/settings.ts";

export interface Screen {
  el: HTMLElement;
  /** Document title (without the app name). Empty for the library. */
  title: string;
  /** Element focused after in-app navigation (usually the h1). */
  focus?: HTMLElement | null;
  destroy?(): void;
}

let root: HTMLElement | null = null;
let current: Screen | null = null;
let renderToken = 0;
let firstRender = true;

interface HistoryState {
  lexvmDepth?: number;
}

function depth(): number {
  const state = history.state as HistoryState | null;
  return typeof state?.lexvmDepth === "number" ? state.lexvmDepth : 0;
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeHash(route);
  if (options.replace) history.replaceState({ lexvmDepth: depth() } satisfies HistoryState, "", hash);
  else history.pushState({ lexvmDepth: depth() + 1 } satisfies HistoryState, "", hash);
  void render();
}

/** Go back within the app if possible, otherwise to `fallback`. */
export function goBack(fallback: Route = { name: "library" }): void {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Replace the current URL without re-rendering (e.g. "#/play/x/new" -> "#/play/x" after starting). */
export function replaceRouteSilently(route: Route): void {
  history.replaceState({ lexvmDepth: depth() } satisfies HistoryState, "", routeHash(route));
}

async function createScreen(route: Route): Promise<Screen> {
  switch (route.name) {
    case "play":
      return createGameScreen(route.key, route.fresh);
    case "create": {
      const { createCreateScreen } = await import("./screens/create.ts");
      return createCreateScreen();
    }
    case "settings":
      return createSettingsScreen();
    case "about":
      return createAboutScreen();
    default:
      return createLibraryScreen();
  }
}

export async function render(): Promise<void> {
  if (!root) return;
  const token = ++renderToken;
  const route = parseRoute(location.hash);
  let screen: Screen;
  try {
    screen = await createScreen(route);
  } catch (error) {
    console.error(error);
    screen = {
      el: h("div", { class: "screen" }, h("p", { class: "notice notice--error", text: String(error) })),
      title: "",
    };
  }
  if (token !== renderToken) {
    screen.destroy?.();
    return;
  }
  closeAllSheets();
  current?.destroy?.();
  current = screen;
  root.replaceChildren(screen.el);
  document.title = screen.title ? `${screen.title} – ${t("app.name")}` : t("app.name");
  if (!firstRender) screen.focus?.focus({ preventScroll: true });
  firstRender = false;
}

export function startApp(container: HTMLElement): void {
  root = container;
  window.addEventListener("hashchange", () => void render());
  let language = settings.get().language;
  settings.subscribe((s) => {
    if (s.language === language) return;
    language = s.language;
    void render();
  });
  if (!history.state) history.replaceState({ lexvmDepth: 0 } satisfies HistoryState, "", location.hash || "#/");
  void render();
}
