/** Library: the list of adventures, plus entry points and offline/install status. */
import { navigate, type Screen } from "../app.ts";
import { confirmDialog } from "../components/confirm.ts";
import { formatDate, languageName } from "../components/header.ts";
import { h, replaceChildren, uid } from "../dom.ts";
import { getLanguage, t } from "../i18n.ts";
import { icon } from "../icons.ts";
import type { StoredSave } from "../logic/saves.ts";
import { deleteImportedPack, type LibraryEntry, loadLibrary } from "../services/packs.ts";
import { promptInstall, pwa } from "../services/pwa.ts";
import { listSaves } from "../services/saves.ts";
import { storageKind } from "../services/storage.ts";

export const OFFLINE_FILE = "lexvm-offline.html";

function offlineDownloadLink(): HTMLElement | null {
  if (__LEXVM_SINGLEFILE__ || !import.meta.env.PROD) return null;
  return h(
    "a",
    { class: "link-row", attrs: { href: OFFLINE_FILE, download: OFFLINE_FILE } },
    icon("download"),
    h("span", { text: t("library.downloadOffline") }),
  );
}

export function renderPwaStatus(container: HTMLElement): () => void {
  const update = () => {
    const state = pwa.get();
    let status: HTMLElement | null = null;
    if (state.mode === "singlefile") {
      status = h("p", { class: "status__line", text: t("library.singlefile") });
    } else if (state.mode === "unsupported" && import.meta.env.PROD) {
      status = h("p", { class: "status__line", text: t("library.offlineUnavailable") });
    } else if (state.mode === "sw") {
      const key =
        state.offline === "ready"
          ? "library.offlineReady"
          : state.offline === "error"
            ? "library.offlineError"
            : "library.offlinePreparing";
      status = h("p", {
        class: `status__line${state.offline === "ready" ? " status__line--ok" : ""}`,
        dataset: { offline: state.offline },
        text: t(key),
      });
    }
    replaceChildren(
      container,
      status,
      state.canInstall
        ? h(
            "button",
            { class: "button button--primary", type: "button", on: { click: () => void promptInstall() } },
            icon("download"),
            h("span", { text: t("library.install") }),
          )
        : null,
      state.iosInstallHint ? h("p", { class: "status__hint", text: t("library.iosInstall") }) : null,
      offlineDownloadLink(),
    );
  };
  update();
  return pwa.subscribe(update);
}

function card(entry: LibraryEntry, save: StoredSave | undefined, refresh: () => void): HTMLElement {
  const titleId = uid("pack");
  const ui = getLanguage();
  const start = async () => {
    if (save) {
      const ok = await confirmDialog({
        title: t("library.confirmNewTitle"),
        message: t("library.confirmNewText", { title: entry.title }),
        confirm: t("library.confirmNewOk"),
        danger: true,
      });
      if (!ok) return;
    }
    navigate({ name: "play", key: entry.key, fresh: true });
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: t("library.deleteTitle"),
      message: t("library.deleteText", { title: entry.title }),
      confirm: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await deleteImportedPack(entry.id);
    refresh();
  };
  const language = languageName(entry.language, ui);
  return h(
    "article",
    { class: "card", attrs: { "aria-labelledby": titleId }, dataset: { pack: entry.key } },
    h(
      "p",
      { class: "card__tags" },
      h("span", {
        class: "tag",
        attrs: {
          title: t("library.languageBadge", { language }),
          "aria-label": t("library.languageBadge", { language }),
        },
        text: entry.language.toUpperCase(),
      }),
      entry.playtime
        ? h("span", { class: "tag tag--plain", text: t("library.playtime", { n: entry.playtime }) })
        : null,
      entry.source === "imported" ? h("span", { class: "tag tag--accent", text: t("library.imported") }) : null,
    ),
    h("h3", { class: "card__title", id: titleId, lang: entry.language, text: entry.title }),
    entry.subtitle ? h("p", { class: "card__subtitle", lang: entry.language, text: entry.subtitle }) : null,
    entry.description ? h("p", { class: "card__description", lang: entry.language, text: entry.description }) : null,
    save
      ? h("p", {
          class: "card__save",
          text: save.save.state.ended
            ? `${t("library.finished")} · ${formatDate(save.save.savedAt, ui)}`
            : t("library.savedAt", { date: formatDate(save.save.savedAt, ui) }),
        })
      : null,
    h(
      "div",
      { class: "card__actions" },
      save
        ? h(
            "button",
            {
              class: "button button--primary",
              type: "button",
              on: { click: () => navigate({ name: "play", key: entry.key, fresh: false }) },
            },
            icon("play"),
            h("span", { text: t("library.continue") }),
          )
        : null,
      h(
        "button",
        { class: `button${save ? "" : " button--primary"}`, type: "button", on: { click: () => void start() } },
        save ? null : icon("play"),
        h("span", { text: t("library.newGame") }),
      ),
      entry.source === "imported"
        ? h(
            "button",
            {
              class: "icon-button card__delete",
              type: "button",
              attrs: { "aria-label": `${t("common.delete")}: ${entry.title}` },
              on: { click: () => void remove() },
            },
            icon("trash"),
          )
        : null,
    ),
    h("p", {
      class: "card__credits",
      text: t("library.meta", { author: entry.author || "?", license: entry.license || "?", version: entry.version }),
    }),
  );
}

export function createLibraryScreen(): Screen {
  const heading = h("h1", { class: "masthead__title", text: t("app.name"), attrs: { tabindex: -1 } });
  const list = h(
    "div",
    { class: "cards", attrs: { "aria-busy": "true" } },
    h("p", { class: "muted", text: t("common.loading") }),
  );
  const notices = h("div", { class: "notices" });
  const status = h("div", { class: "status", attrs: { "aria-live": "polite" } });
  const unsubscribe = renderPwaStatus(status);

  const load = async (forceCatalog = false) => {
    const [library, saves, storage] = await Promise.all([loadLibrary(forceCatalog), listSaves(), storageKind()]);
    replaceChildren(
      notices,
      storage === "memory" ? h("p", { class: "notice", text: t("library.storageOff") }) : null,
      library.catalogError
        ? h(
            "div",
            { class: "notice notice--error" },
            h("p", { class: "notice__title", text: t("library.loadError") }),
            h("p", { text: t("library.loadErrorText") }),
            h("button", {
              class: "button",
              type: "button",
              text: t("common.retry"),
              on: { click: () => void load(true) },
            }),
          )
        : null,
    );
    list.removeAttribute("aria-busy");
    if (library.entries.length === 0) {
      replaceChildren(
        list,
        h(
          "div",
          { class: "empty" },
          h("p", { class: "empty__title", text: t("library.empty") }),
          h("p", { text: t("library.emptyText") }),
        ),
      );
      return;
    }
    replaceChildren(list, ...library.entries.map((entry) => card(entry, saves.get(entry.key), () => void load())));
  };
  void load();

  const navButton = (iconName: Parameters<typeof icon>[0], label: string, route: Parameters<typeof navigate>[0]) =>
    h(
      "button",
      { class: "nav-item", type: "button", on: { click: () => navigate(route) } },
      icon(iconName),
      h("span", { text: label }),
    );

  const el = h(
    "div",
    { class: "screen screen--page" },
    h(
      "main",
      { class: "page" },
      h("header", { class: "masthead" }, heading, h("p", { class: "masthead__tagline", text: t("app.tagline") })),
      notices,
      h(
        "section",
        { class: "library", attrs: { "aria-label": t("library.packs") } },
        h("h2", { class: "section-title", text: t("library.packs") }),
        list,
      ),
      h(
        "nav",
        { class: "nav-list", attrs: { "aria-label": t("app.name") } },
        navButton("pencil", t("nav.create"), { name: "create" }),
        navButton("sliders", t("nav.settings"), { name: "settings" }),
        navButton("info", t("nav.about"), { name: "about" }),
      ),
      status,
    ),
  );
  return { el, title: "", focus: heading, destroy: unsubscribe };
}
