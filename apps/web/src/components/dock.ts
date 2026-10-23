/**
 * The bottom dock in the thumb zone: object chips ("Here"), exit chips, the
 * dialogue options while a conversation runs, the optional text input and
 * the toolbar (inventory, notebook, hint, keyboard, undo).
 */
import type { View } from "@lexvm/engine";
import { focusables, h, replaceChildren, uid } from "../dom.ts";
import { t } from "../i18n.ts";
import { exitIcon, type IconName, icon } from "../icons.ts";
import { inventoryCounts } from "../logic/actions.ts";

export interface DockHandlers {
  onObject(id: string, origin: HTMLElement): void;
  onExit(id: string): void;
  onChoose(optionId: string): void;
  onInventory(): void;
  onNotebook(): void;
  onHint(): void;
  onToggleKeyboard(): void;
  onUndo(): void;
  onSubmit(text: string): void;
  onLibrary(): void;
  onPlayAgain(): void;
}

export interface DockModel {
  view: View;
  /** Pack language for object names and option texts. */
  lang: string;
  canUndo: boolean;
  notebook: boolean;
  newClues: boolean;
  keyboard: boolean;
}

const KIND_ICON: Record<string, IconName> = {
  npc: "npc",
  container: "container",
  item: "item",
  clue: "clue",
  scenery: "scenery",
};

function toolButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
  return h(
    "button",
    { class: "tool", type: "button", on: { click: onClick } },
    icon(name),
    h("span", { class: "tool__label", text: label }),
  );
}

export class Dock {
  readonly el: HTMLElement;
  readonly input: HTMLInputElement;
  private readonly form: HTMLFormElement;
  private readonly candidates: HTMLElement;
  private readonly main: HTMLElement;
  private readonly tools: {
    inventory: HTMLButtonElement;
    notebook: HTMLButtonElement;
    hint: HTMLButtonElement;
    keyboard: HTMLButtonElement;
    undo: HTMLButtonElement;
  };
  private readonly handlers: DockHandlers;
  private history: string[] = [];
  private historyIndex = -1;

  constructor(handlers: DockHandlers) {
    this.handlers = handlers;
    const inputId = uid("cmd");
    this.input = h("input", {
      class: "cmdline__input",
      id: inputId,
      attrs: {
        type: "text",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "send",
        placeholder: t("game.commandPlaceholder"),
      },
      on: { keydown: (event) => this.onInputKey(event) },
    });
    this.form = h(
      "form",
      {
        class: "cmdline",
        hidden: true,
        on: {
          submit: (event) => {
            event.preventDefault();
            const value = this.input.value.trim();
            if (!value) return;
            this.history.push(value);
            this.historyIndex = -1;
            this.input.value = "";
            handlers.onSubmit(value);
          },
        },
      },
      h("label", { class: "visually-hidden", attrs: { for: inputId }, text: t("game.commandLabel") }),
      this.input,
      h(
        "button",
        { class: "icon-button cmdline__send", type: "submit", attrs: { "aria-label": t("game.send") } },
        icon("chevron"),
      ),
    );
    this.candidates = h("div", { class: "dock__candidates", hidden: true });
    this.main = h("div", { class: "dock__main" });
    this.tools = {
      inventory: toolButton("bag", t("game.inventory"), handlers.onInventory),
      notebook: toolButton("notebook", t("game.notebook"), handlers.onNotebook),
      hint: toolButton("bulb", t("game.hint"), handlers.onHint),
      keyboard: toolButton("keyboard", t("game.keyboard"), handlers.onToggleKeyboard),
      undo: toolButton("undo", t("game.undo"), handlers.onUndo),
    };
    const toolbar = h(
      "nav",
      { class: "toolbar", attrs: { "aria-label": t("game.tools") } },
      this.tools.inventory,
      this.tools.notebook,
      this.tools.hint,
      this.tools.keyboard,
      this.tools.undo,
    );
    this.el = h(
      "footer",
      { class: "dock" },
      h("div", { class: "dock__inner" }, this.main, this.candidates, this.form, toolbar),
    );
  }

  private onInputKey(event: KeyboardEvent): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (this.history.length === 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp") {
      this.historyIndex = this.historyIndex < 0 ? this.history.length - 1 : Math.max(0, this.historyIndex - 1);
    } else if (this.historyIndex >= 0) {
      this.historyIndex += 1;
      if (this.historyIndex >= this.history.length) this.historyIndex = -1;
    }
    this.input.value = this.historyIndex >= 0 ? (this.history[this.historyIndex] ?? "") : "";
  }

  private badge(button: HTMLButtonElement, count: number, label: string, dot = false): void {
    button.querySelector(".tool__badge")?.remove();
    if (count > 0) {
      button.appendChild(
        h("span", {
          class: `tool__badge${dot ? " tool__badge--new" : ""}`,
          attrs: { "aria-hidden": "true" },
          text: String(count),
        }),
      );
      button.setAttribute("aria-label", `${label} (${count}${dot ? `, ${t("game.new")}` : ""})`);
    } else {
      button.setAttribute("aria-label", label);
    }
  }

  update(model: DockModel): void {
    const { view } = model;
    const counts = inventoryCounts(view);
    this.badge(this.tools.inventory, counts.items, t("game.inventory"));
    this.badge(this.tools.notebook, counts.clues, t("game.notebook"), model.newClues);
    this.tools.notebook.hidden = !model.notebook;
    this.tools.keyboard.setAttribute("aria-pressed", String(model.keyboard));
    this.tools.undo.disabled = !model.canUndo;
    const ended = view.ended !== null;
    this.tools.inventory.disabled = ended;
    this.tools.notebook.disabled = ended;
    this.tools.hint.disabled = ended;
    this.form.hidden = !model.keyboard || ended;

    // Re-rendering replaces the chips; keep keyboard focus on the "same" control.
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && this.main.contains(active) ? this.focusKey(active) : null;

    if (ended) {
      this.hideCandidates();
      replaceChildren(this.main, this.renderEnded());
    } else if (view.dialogue) {
      replaceChildren(this.main, this.renderDialogue(view, model.lang));
    } else {
      replaceChildren(this.main, this.renderRows(view, model.lang));
    }
    if (focusKey !== null) this.restoreFocus(focusKey);
  }

  private focusKey(el: HTMLElement): string {
    const keyed = el.closest<HTMLElement>("[data-object],[data-exit],[data-option]");
    if (!keyed) return "";
    for (const name of ["object", "exit", "option"] as const) {
      const value = keyed.dataset[name];
      if (value) return `${name}:${value}`;
    }
    return "";
  }

  private restoreFocus(key: string): void {
    const [name, value] = key.split(":");
    const same =
      name && value
        ? [...this.main.querySelectorAll<HTMLElement>(`[data-${name}]`)].find((el) => el.dataset[name] === value)
        : undefined;
    (same ?? focusables(this.main)[0])?.focus({ preventScroll: true });
  }

  private renderRows(view: View, lang: string): HTMLElement {
    const objects = view.objects.map((o) =>
      h(
        "button",
        {
          class: `chip chip--${o.kind}`,
          type: "button",
          dataset: { object: o.id },
          on: { click: (event) => this.handlers.onObject(o.id, event.currentTarget as HTMLElement) },
        },
        icon(KIND_ICON[o.kind] ?? "item"),
        h("span", { class: "chip__label", lang, text: o.name }),
      ),
    );
    const exits = view.exits.map((x) =>
      h(
        "button",
        {
          class: "chip chip--exit",
          type: "button",
          dataset: { exit: x.id },
          on: { click: () => this.handlers.onExit(x.id) },
        },
        exitIcon(x.id),
        h("span", { class: "chip__label", lang, text: x.label }),
      ),
    );
    const row = (label: string, chips: HTMLElement[], empty: string) =>
      h(
        "section",
        { class: "dock-row", attrs: { "aria-label": label } },
        h("h3", { class: "dock-row__label", attrs: { "aria-hidden": "true" }, text: label }),
        chips.length > 0 ? h("div", { class: "chips" }, ...chips) : h("p", { class: "dock-row__empty", text: empty }),
      );
    return h(
      "div",
      { class: "dock-rows" },
      row(t("game.here"), objects, t("game.nothingHere")),
      row(t("game.exits"), exits, t("game.noExits")),
    );
  }

  private renderDialogue(view: View, lang: string): HTMLElement {
    const dialogue = view.dialogue;
    if (!dialogue) return h("div");
    const heading = dialogue.npc ? t("game.dialogueWith", { npc: dialogue.npc }) : t("game.dialogue");
    return h(
      "section",
      { class: "dialogue", attrs: { "aria-label": heading } },
      h("h3", { class: "dialogue__heading", text: heading }),
      h(
        "ol",
        { class: "dialogue__options" },
        ...dialogue.options.map((option, index) =>
          h(
            "li",
            null,
            h(
              "button",
              {
                class: "option",
                type: "button",
                dataset: { option: option.id },
                on: { click: () => this.handlers.onChoose(option.id) },
              },
              h("span", { class: "option__num", attrs: { "aria-hidden": "true" }, text: String(index + 1) }),
              h("span", { class: "option__text", lang, text: option.text }),
            ),
          ),
        ),
      ),
    );
  }

  private renderEnded(): HTMLElement {
    return h(
      "div",
      { class: "ended" },
      h("button", {
        class: "button",
        type: "button",
        text: t("game.toLibrary"),
        on: { click: () => this.handlers.onLibrary() },
      }),
      h("button", {
        class: "button button--primary",
        type: "button",
        text: t("game.playAgain"),
        on: { click: () => this.handlers.onPlayAgain() },
      }),
    );
  }

  showCandidates(
    candidates: Array<{ id: string; name: string }>,
    lang: string,
    onPick: (id: string, name: string) => void,
  ): void {
    replaceChildren(
      this.candidates,
      h("span", { class: "dock__candidates-label", text: t("game.didYouMean") }),
      h(
        "div",
        { class: "chips" },
        ...candidates.map((c) =>
          h(
            "button",
            {
              class: "chip",
              type: "button",
              on: {
                click: () => {
                  this.hideCandidates();
                  onPick(c.id, c.name);
                },
              },
            },
            h("span", { class: "chip__label", lang, text: c.name }),
          ),
        ),
      ),
    );
    this.candidates.hidden = false;
  }

  hideCandidates(): void {
    this.candidates.hidden = true;
    this.candidates.replaceChildren();
  }

  focusInput(): void {
    if (!this.form.hidden) this.input.focus();
  }
}
