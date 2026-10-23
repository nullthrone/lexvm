/** About: version, licenses, source, how to create adventures, offline use, credits. */
import { navigate, type Screen } from "../app.ts";
import { pageHeader } from "../components/header.ts";
import { h } from "../dom.ts";
import { t } from "../i18n.ts";
import { icon } from "../icons.ts";
import { OFFLINE_FILE } from "./library.ts";

export const REPO_URL = "https://github.com/nullthrone/lexvm";

function section(title: string, ...content: Array<HTMLElement | null>): HTMLElement {
  return h("section", { class: "prose-section" }, h("h2", { class: "section-title", text: title }), ...content);
}

export function createAboutScreen(): Screen {
  const header = pageHeader(t("about.heading"));
  const edition = __LEXVM_SINGLEFILE__ ? t("about.edition.singlefile") : t("about.edition.web");
  const el = h(
    "div",
    { class: "screen screen--page" },
    h(
      "main",
      { class: "page prose" },
      header.el,
      h("p", { class: "lead", text: t("about.intro") }),
      h("p", { class: "muted", text: `${t("about.version", { version: __LEXVM_VERSION__ })} · ${edition}` }),
      section(
        t("about.createHeading"),
        h("p", { text: t("about.createText") }),
        h(
          "button",
          { class: "button", type: "button", on: { click: () => navigate({ name: "create" }) } },
          icon("pencil"),
          h("span", { text: t("about.createLink") }),
        ),
      ),
      section(
        t("about.offlineHeading"),
        h("p", { text: t("about.offlineText") }),
        !__LEXVM_SINGLEFILE__ && import.meta.env.PROD
          ? h(
              "a",
              { class: "link-row", attrs: { href: OFFLINE_FILE, download: OFFLINE_FILE } },
              icon("download"),
              h("span", { text: t("library.downloadOffline") }),
            )
          : null,
      ),
      section(
        t("about.licenseHeading"),
        h("p", { text: t("about.license") }),
        h(
          "a",
          { class: "link-row", attrs: { href: REPO_URL, rel: "noopener", target: "_blank" } },
          icon("book"),
          h("span", { text: `${t("about.source")} – github.com/nullthrone/lexvm` }),
        ),
      ),
      section(t("about.privacyHeading"), h("p", { text: t("about.privacy") })),
      section(t("about.creditsHeading"), h("p", { text: t("about.credits") })),
    ),
  );
  return { el, title: t("about.heading"), focus: header.heading };
}
