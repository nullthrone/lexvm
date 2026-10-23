/** Settings: theme, text size, UI language, haptics. Changes apply immediately. */
import type { Screen } from "../app.ts";
import { pageHeader } from "../components/header.ts";
import { h, uid } from "../dom.ts";
import { type StringKey, t } from "../i18n.ts";
import { hapticsSupported } from "../services/haptics.ts";
import {
  type LanguageSetting,
  type Settings,
  settings,
  type TextSize,
  type ThemeSetting,
  updateSettings,
} from "../services/settings.ts";

function segmented<T extends string | number>(
  legend: string,
  options: Array<{ value: T; label: string; lang?: string }>,
  current: T,
  onChange: (value: T) => void,
): HTMLElement {
  const name = uid("opt");
  return h(
    "fieldset",
    { class: "field" },
    h("legend", { class: "field__legend", text: legend }),
    h(
      "div",
      { class: "segmented" },
      ...options.map((option) => {
        const id = uid("opt");
        return h(
          "div",
          { class: "segmented__item" },
          h("input", {
            id,
            class: "segmented__input",
            attrs: { type: "radio", name, value: String(option.value), checked: option.value === current },
            on: { change: () => onChange(option.value) },
          }),
          h("label", { class: "segmented__label", attrs: { for: id }, lang: option.lang, text: option.label }),
        );
      }),
    ),
  );
}

export function createSettingsScreen(): Screen {
  const s: Settings = settings.get();
  const header = pageHeader(t("settings.heading"));
  const themes: ThemeSetting[] = ["system", "light", "sepia", "dark"];
  const sizes: TextSize[] = [1, 2, 3, 4];
  const hapticsId = uid("haptics");
  const supported = hapticsSupported();

  const el = h(
    "div",
    { class: "screen screen--page" },
    h(
      "main",
      { class: "page" },
      header.el,
      h(
        "form",
        { class: "settings", on: { submit: (event) => event.preventDefault() } },
        segmented(
          t("settings.theme"),
          themes.map((value) => ({ value, label: t(`settings.theme.${value}` as StringKey) })),
          s.theme,
          (theme) => updateSettings({ theme }),
        ),
        segmented(
          t("settings.textSize"),
          sizes.map((value) => ({ value, label: t(`settings.textSize.${value}` as StringKey) })),
          s.textSize,
          (textSize) => updateSettings({ textSize }),
        ),
        h("p", { class: "settings__sample", text: t("settings.textSample") }),
        segmented<LanguageSetting>(
          t("settings.language"),
          [
            { value: "auto", label: t("settings.language.auto") },
            { value: "de", label: "Deutsch", lang: "de" },
            { value: "en", label: "English", lang: "en" },
          ],
          s.language,
          (language) => updateSettings({ language }),
        ),
        h("p", { class: "field__note", text: t("settings.languageNote") }),
        h(
          "div",
          { class: "field field--switch" },
          h(
            "label",
            { class: "switch", attrs: { for: hapticsId } },
            h("span", { class: "switch__text", text: t("settings.haptics") }),
            h("input", {
              id: hapticsId,
              class: "switch__input",
              attrs: { type: "checkbox", role: "switch", checked: s.haptics && supported, disabled: !supported },
              on: { change: (event) => updateSettings({ haptics: (event.currentTarget as HTMLInputElement).checked }) },
            }),
            h("span", { class: "switch__track", attrs: { "aria-hidden": "true" } }),
          ),
          h("p", {
            class: "field__note",
            text: supported ? t("settings.hapticsNote") : t("settings.hapticsUnsupported"),
          }),
        ),
        h(
          "div",
          { class: "field" },
          h("h2", { class: "field__legend", text: t("settings.motion") }),
          h("p", { class: "field__note", text: t("settings.motionNote") }),
        ),
      ),
    ),
  );
  return { el, title: t("settings.heading"), focus: header.heading };
}
