/** The ending card shown over the transcript when the game ends. */
import { h } from "../dom.ts";
import { t } from "../i18n.ts";
import { openSheet, type SheetHandle } from "./sheet.ts";

export interface EndingCardOptions {
  title: string;
  /** Ending text paragraphs (plain text, pack language). */
  paragraphs: string[];
  lang: string;
  score: { value: number; max: number } | null;
  onLibrary(): void;
  onPlayAgain(): void;
}

export function openEndingCard(options: EndingCardOptions): SheetHandle {
  const sheet = openSheet({
    title: options.title,
    titleLang: options.lang,
    eyebrow: t("game.theEnd"),
    variant: "center",
    className: "ending-sheet",
  });
  sheet.setBody(
    h(
      "div",
      { class: "ending", lang: options.lang },
      ...options.paragraphs.map((p) => h("p", { class: "ending__text", text: p })),
    ),
    options.score
      ? h("p", {
          class: "ending__score",
          text: t("game.finalScore", { value: options.score.value, max: options.score.max }),
        })
      : null,
    h(
      "div",
      { class: "ending__actions" },
      h("button", {
        class: "button",
        type: "button",
        text: t("game.toLibrary"),
        on: {
          click: () => {
            sheet.close();
            options.onLibrary();
          },
        },
      }),
      h("button", {
        class: "button button--primary",
        type: "button",
        text: t("game.playAgain"),
        on: {
          click: () => {
            sheet.close();
            options.onPlayAgain();
          },
        },
      }),
    ),
  );
  // Focus the card itself so screen readers start with the ending text; Tab reaches the buttons.
  sheet.dialog.querySelector<HTMLElement>(".sheet__panel")?.focus({ preventScroll: true });
  return sheet;
}
