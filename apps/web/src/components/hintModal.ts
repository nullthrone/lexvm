/** Progressive hints: one step at a time, from a gentle nudge to the solution. */
import type { HintView } from "@lexvm/engine";
import { h } from "../dom.ts";
import { t } from "../i18n.ts";
import { openSheet } from "./sheet.ts";

export interface HintModalOptions {
  hint: HintView | null;
  /** Steps already revealed for this hint (from the save metadata). */
  revealed: number;
  /** Pack language. */
  lang: string;
  /** Render a step as plain text (resolves inline markup). */
  stepText(step: string): string;
  /** Persist a new revealed count. */
  onReveal(id: string, count: number): void;
}

export function openHintModal(options: HintModalOptions): void {
  const sheet = openSheet({ title: t("hint.title"), variant: "center", className: "hint-sheet" });
  const { hint } = options;
  if (!hint || hint.steps.length === 0) {
    sheet.setBody(h("p", { class: "hint__none", text: t("hint.none") }));
    sheet.focusFirst();
    return;
  }
  let count = Math.min(hint.steps.length, Math.max(1, options.revealed));
  if (count !== options.revealed) options.onReveal(hint.id, count);

  const render = (focusNew: boolean) => {
    const items = hint.steps
      .slice(0, count)
      .map((step, index) =>
        h(
          "li",
          { class: "hint__step", attrs: { tabindex: -1 } },
          h("span", { class: "hint__count", text: t("hint.step", { n: index + 1, total: hint.steps.length }) }),
          h("span", { class: "hint__text", lang: options.lang, text: options.stepText(step) }),
        ),
      );
    const more =
      count < hint.steps.length
        ? h("button", {
            class: "button button--primary",
            type: "button",
            text: t("hint.more"),
            on: {
              click: () => {
                count += 1;
                options.onReveal(hint.id, count);
                render(true);
              },
            },
          })
        : h("p", { class: "hint__all", text: t("hint.allShown") });
    sheet.setBody(h("ol", { class: "hint__steps" }, ...items), h("div", { class: "hint__actions" }, more));
    if (focusNew) {
      const next = sheet.body.querySelector<HTMLButtonElement>(".hint__actions button");
      (next ?? items[items.length - 1])?.focus();
    } else {
      sheet.focusFirst();
    }
  };
  render(false);
}
