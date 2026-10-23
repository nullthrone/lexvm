/** User preferences: theme, text size, UI language, haptics. Persisted in localStorage. */
import { detectLanguage, type Lang, setLanguage } from "../i18n.ts";
import { createStore } from "../state/store.ts";
import { prefs } from "./storage.ts";

export type ThemeSetting = "system" | "light" | "sepia" | "dark";
export type Theme = "light" | "sepia" | "dark";
export type TextSize = 1 | 2 | 3 | 4;
export type LanguageSetting = "auto" | Lang;

export interface Settings {
  theme: ThemeSetting;
  textSize: TextSize;
  language: LanguageSetting;
  haptics: boolean;
  /** Show the text input in games. */
  keyboard: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  textSize: 2,
  language: "auto",
  haptics: true,
  keyboard: false,
};

const KEY = "lexvm:settings";

/** Parse stored settings; unknown or invalid fields fall back to defaults. */
export function parseSettings(raw: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof value !== "object" || value === null) return out;
  const v = value as Record<string, unknown>;
  if (v.theme === "system" || v.theme === "light" || v.theme === "sepia" || v.theme === "dark") out.theme = v.theme;
  if (v.textSize === 1 || v.textSize === 2 || v.textSize === 3 || v.textSize === 4) out.textSize = v.textSize;
  if (v.language === "auto" || v.language === "de" || v.language === "en") out.language = v.language;
  if (typeof v.haptics === "boolean") out.haptics = v.haptics;
  if (typeof v.keyboard === "boolean") out.keyboard = v.keyboard;
  return out;
}

/** "system" means Sepia, unless the system prefers a dark scheme. */
export function resolveTheme(setting: ThemeSetting, systemPrefersDark: boolean): Theme {
  if (setting !== "system") return setting;
  return systemPrefersDark ? "dark" : "sepia";
}

/** Browser chrome colour per theme (matches --bg in the CSS). */
export const THEME_COLORS: Record<Theme, string> = {
  light: "#fbfaf6",
  sepia: "#f3ead7",
  dark: "#15120e",
};

export const settings = createStore<Settings>(parseSettings(prefs.get(KEY)));

export function updateSettings(patch: Partial<Settings>): void {
  settings.update(patch);
  prefs.set(KEY, JSON.stringify(settings.get()));
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function uiLanguage(s: Settings = settings.get()): Lang {
  return s.language === "auto" ? detectLanguage(navigator.languages ?? [navigator.language]) : s.language;
}

/** Apply settings to the document: theme, text size, UI language. */
export function applySettings(s: Settings = settings.get()): void {
  const root = document.documentElement;
  const theme = resolveTheme(s.theme, systemPrefersDark());
  root.dataset.theme = theme;
  root.dataset.textSize = String(s.textSize);
  const lang = uiLanguage(s);
  setLanguage(lang);
  root.lang = lang;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", THEME_COLORS[theme]);
}

/** Apply now and keep in sync with settings and the system colour scheme. */
export function initSettings(): void {
  applySettings();
  settings.subscribe((s) => applySettings(s));
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applySettings());
  } catch {
    // Old browsers: theme follows the setting only.
  }
}
