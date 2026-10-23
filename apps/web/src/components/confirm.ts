/** Confirmation and multiple-choice dialogs that resolve to the player's answer. */
import { h } from "../dom.ts";
import { t } from "../i18n.ts";
import { openSheet } from "./sheet.ts";

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** Visually primary (the recommended action). */
  primary?: boolean;
  /** Destructive action. */
  danger?: boolean;
}

/** Ask the player to choose; resolves with the choice id, or null if dismissed. */
export function choiceDialog<T extends string>(options: {
  title: string;
  message: string;
  choices: Choice<T>[];
}): Promise<T | null> {
  return new Promise((resolve) => {
    let answer: T | null = null;
    const sheet = openSheet({
      title: options.title,
      variant: "center",
      className: "sheet--dialog",
      onClose: () => resolve(answer),
    });
    const buttons = options.choices.map((choice) =>
      h("button", {
        type: "button",
        class: `button${choice.primary ? " button--primary" : ""}${choice.danger ? " button--danger" : ""}`,
        text: choice.label,
        on: {
          click: () => {
            answer = choice.id;
            sheet.close();
          },
        },
      }),
    );
    sheet.setBody(
      h("p", { class: "dialog__message", text: options.message }),
      h("div", { class: "dialog__actions" }, ...buttons),
    );
    // Focus the safest option first: the first non-danger, non-primary choice, else the first.
    const safe = buttons.find((_, i) => !options.choices[i]?.danger && !options.choices[i]?.primary) ?? buttons[0];
    safe?.focus();
  });
}

export async function confirmDialog(options: {
  title: string;
  message: string;
  confirm: string;
  danger?: boolean;
}): Promise<boolean> {
  const answer = await choiceDialog({
    title: options.title,
    message: options.message,
    choices: [
      { id: "cancel", label: t("common.cancel") },
      { id: "ok", label: options.confirm, primary: !options.danger, danger: options.danger ?? false },
    ],
  });
  return answer === "ok";
}
