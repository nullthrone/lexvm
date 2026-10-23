/** Header for page-like screens (settings, about, create): back button and title. */
import { goBack } from "../app.ts";
import { h } from "../dom.ts";
import { t } from "../i18n.ts";
import { icon } from "../icons.ts";

export function pageHeader(title: string): { el: HTMLElement; heading: HTMLHeadingElement } {
  const heading = h("h1", { class: "page-header__title", text: title, attrs: { tabindex: -1 } });
  const el = h(
    "header",
    { class: "page-header" },
    h(
      "button",
      {
        class: "icon-button page-header__back",
        type: "button",
        attrs: { "aria-label": t("common.back") },
        on: { click: () => goBack() },
      },
      icon("back"),
    ),
    heading,
  );
  return { el, heading };
}

/** Format a date in the UI language, e.g. "23. Okt. 2026, 15:30". */
export function formatDate(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Language name in the UI language, e.g. "de" -> "Deutsch". */
export function languageName(code: string, uiLang: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
