/**
 * The story transcript: a scrollable log of output blocks, newest at the
 * bottom. Pack text is rendered with text nodes only; object references
 * become inline buttons.
 */
import type { OutputBlock, OutputKind } from "@lexvm/engine";
import { h, prefersReducedMotion } from "../dom.ts";
import { getLanguage } from "../i18n.ts";
import { blockText } from "../logic/text.ts";

/** Turns kept in the DOM; older ones are dropped to keep long games fast. */
const MAX_TURNS = 400;

const TAG: Record<OutputKind, "p" | "h2"> = {
  echo: "p",
  "room-title": "h2",
  text: "p",
  npc: "p",
  player: "p",
  system: "p",
  ending: "p",
};

export interface TranscriptOptions {
  /** Language of the story text (the pack language). */
  lang: string;
  label: string;
  /** Called when an active object reference is tapped. */
  onRef: (id: string, button: HTMLButtonElement) => void;
}

export class Transcript {
  readonly el: HTMLElement;
  private readonly column: HTMLElement;
  private readonly options: TranscriptOptions;

  constructor(options: TranscriptOptions) {
    this.options = options;
    this.column = h("div", { class: "transcript__column" });
    this.el = h(
      "div",
      {
        class: "transcript",
        lang: options.lang,
        attrs: { role: "log", "aria-live": "polite", "aria-label": options.label, tabindex: -1 },
        on: { click: (event) => this.handleClick(event) },
      },
      this.column,
    );
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button.ref") : null;
    if (!target || target.getAttribute("aria-disabled") === "true") return;
    const id = target.dataset.ref;
    if (id) this.options.onRef(id, target);
  }

  private renderBlock(block: OutputBlock, endingTitle: string | undefined): HTMLElement {
    const el = h(TAG[block.kind], { class: `b b-${block.kind}` });
    for (const span of block.spans) {
      if (span.ref) {
        el.appendChild(h("button", { class: "ref", type: "button", dataset: { ref: span.ref }, text: span.text }));
      } else {
        el.appendChild(document.createTextNode(span.text));
      }
    }
    if (block.kind === "ending" && endingTitle !== undefined && blockText(block).trim() === endingTitle.trim()) {
      el.classList.add("b-ending-title");
    }
    return el;
  }

  /** Render blocks, grouping consecutive ending blocks into one card. */
  private renderBlocks(blocks: readonly OutputBlock[], endingTitle: string | undefined): HTMLElement[] {
    const out: HTMLElement[] = [];
    let endingCard: HTMLElement | null = null;
    for (const block of blocks) {
      if (block.kind === "ending") {
        if (!endingCard) {
          endingCard = h("div", { class: "b-ending-card" });
          out.push(endingCard);
        }
        endingCard.appendChild(this.renderBlock(block, endingTitle));
        continue;
      }
      endingCard = null;
      out.push(this.renderBlock(block, endingTitle));
    }
    return out;
  }

  /** Append one turn's output. Returns the turn element. */
  appendTurn(
    blocks: readonly OutputBlock[],
    options: { endingTitle?: string | undefined; scroll?: boolean } = {},
  ): HTMLElement {
    const turn = h("section", { class: "turn" }, ...this.renderBlocks(blocks, options.endingTitle));
    this.column.appendChild(turn);
    this.trim();
    if (options.scroll !== false) this.scrollToTurn(turn);
    return turn;
  }

  /** A line produced by the UI (not the engine); in the UI language unless `lang` is given. */
  appendUiLine(
    kind: "system" | "echo",
    message: string,
    options: { scroll?: boolean; extra?: HTMLElement; lang?: string } = {},
  ): HTMLElement {
    const line = h("p", { class: `b b-${kind}`, lang: options.lang ?? getLanguage(), text: message });
    const turn = h("section", { class: "turn turn--ui" }, line, options.extra ?? null);
    this.column.appendChild(turn);
    this.trim();
    if (options.scroll !== false) this.scrollToTurn(turn);
    return turn;
  }

  /** Bulk render (e.g. a replayed transcript) without announcing every line to screen readers. */
  renderAll(turns: readonly OutputBlock[][], endingTitle?: string): void {
    this.el.setAttribute("aria-busy", "true");
    this.clear();
    const start = Math.max(0, turns.length - MAX_TURNS);
    for (let i = start; i < turns.length; i += 1) {
      this.column.appendChild(h("section", { class: "turn" }, ...this.renderBlocks(turns[i] ?? [], endingTitle)));
    }
    this.el.removeAttribute("aria-busy");
    requestAnimationFrame(() => {
      const last = this.column.lastElementChild;
      if (last instanceof HTMLElement) this.scrollToTurn(last, true);
    });
  }

  clear(): void {
    this.column.replaceChildren();
  }

  private trim(): void {
    while (this.column.childElementCount > MAX_TURNS) this.column.firstElementChild?.remove();
  }

  /**
   * Scroll to a new turn: all of it when it fits (a little space above if there is room), otherwise
   * its start at the top. As far as possible when the transcript ends sooner.
   */
  scrollToTurn(turn: HTMLElement, instant = false): void {
    const start = turn.getBoundingClientRect().top - this.el.getBoundingClientRect().top + this.el.scrollTop;
    const height = turn.getBoundingClientRect().height;
    const view = this.el.clientHeight;
    const top = Math.max(0, height <= view ? Math.max(start - 12, start + height - view) : start - 12);
    const behavior: ScrollBehavior = instant || prefersReducedMotion() ? "auto" : "smooth";
    try {
      this.el.scrollTo({ top, behavior });
    } catch {
      this.el.scrollTop = top;
    }
  }

  /** Enable or disable reference buttons, e.g. after the room changed. */
  updateRefs(isActive: (id: string) => boolean): void {
    const cache = new Map<string, boolean>();
    for (const button of this.column.querySelectorAll<HTMLButtonElement>("button.ref")) {
      const id = button.dataset.ref ?? "";
      let active = cache.get(id);
      if (active === undefined) {
        active = isActive(id);
        cache.set(id, active);
      }
      if (active) {
        button.removeAttribute("aria-disabled");
        button.removeAttribute("tabindex");
      } else {
        // Inactive references read as plain text and are skipped by Tab.
        button.setAttribute("aria-disabled", "true");
        button.tabIndex = -1;
      }
    }
  }
}
