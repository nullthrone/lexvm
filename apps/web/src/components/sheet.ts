/**
 * Modal sheets on top of the native <dialog> element (top layer, inert
 * background). Adds: focus trap, Escape and backdrop close, focus restore,
 * bottom-sheet or centred card layout.
 */
import { type Child, focusables, h, replaceChildren, uid } from "../dom.ts";
import { t } from "../i18n.ts";
import { icon } from "../icons.ts";

export interface SheetOptions {
  title: string;
  /** Language of the title (e.g. the pack language for object names). */
  titleLang?: string | undefined;
  /** Small line above the title, e.g. the kind of object. */
  eyebrow?: string | undefined;
  variant?: "bottom" | "center";
  className?: string;
  /** Called once after the sheet closed (by any means). */
  onClose?: () => void;
  /** Hide the close button (e.g. for confirmation dialogs with explicit buttons). */
  hideClose?: boolean;
  /** Escape/backdrop do not close (e.g. the ending card). */
  modalLock?: boolean;
}

export interface SheetHandle {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close(): void;
  setTitle(title: string, lang?: string): void;
  setEyebrow(text: string | undefined): void;
  setBody(...children: Child[]): void;
  /** Focus the first focusable element in the body (or the close button). */
  focusFirst(): void;
  readonly closed: boolean;
}

const openSheets: SheetHandle[] = [];

export function closeAllSheets(): void {
  for (const sheet of [...openSheets].reverse()) sheet.close();
}

export function openSheet(options: SheetOptions): SheetHandle {
  const titleId = uid("sheet-title");
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const title = h("h2", { class: "sheet__title", id: titleId, text: options.title, lang: options.titleLang });
  const eyebrow = h("p", { class: "sheet__eyebrow", text: options.eyebrow ?? "", hidden: !options.eyebrow });
  const body = h("div", { class: "sheet__body" });
  const closeButton = options.hideClose
    ? null
    : h(
        "button",
        {
          class: "icon-button sheet__close",
          type: "button",
          attrs: { "aria-label": t("common.close") },
          on: { click: () => handle.close() },
        },
        icon("close"),
      );
  const panel = h(
    "div",
    { class: "sheet__panel" },
    h("div", { class: "sheet__head" }, h("div", { class: "sheet__heading" }, eyebrow, title), closeButton),
    body,
  );
  const dialog = h(
    "dialog",
    {
      class: `sheet sheet--${options.variant ?? "bottom"}${options.className ? ` ${options.className}` : ""}`,
      attrs: { "aria-labelledby": titleId },
    },
    panel,
  );

  let closed = false;
  const handle: SheetHandle = {
    dialog,
    body,
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      const index = openSheets.indexOf(handle);
      if (index >= 0) openSheets.splice(index, 1);
      try {
        dialog.close();
      } catch {
        // already closed
      }
      dialog.remove();
      if (previousFocus?.isConnected && openSheets.length === 0) previousFocus.focus({ preventScroll: true });
      else openSheets.at(-1)?.focusFirst();
      options.onClose?.();
    },
    setTitle(text, lang) {
      title.textContent = text;
      if (lang) title.lang = lang;
      else title.removeAttribute("lang");
    },
    setEyebrow(text) {
      eyebrow.textContent = text ?? "";
      eyebrow.hidden = !text;
    },
    setBody(...children) {
      replaceChildren(body, ...children);
    },
    focusFirst() {
      const target = focusables(body)[0] ?? closeButton ?? panel;
      target.focus({ preventScroll: true });
    },
  };

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (!options.modalLock) handle.close();
  });
  dialog.addEventListener("click", (event) => {
    // Clicks on the dialog element itself (outside the panel) are backdrop clicks.
    if (event.target === dialog && !options.modalLock) handle.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = focusables(dialog);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  panel.tabIndex = -1;
  document.body.appendChild(dialog);
  openSheets.push(handle);
  dialog.showModal();
  return handle;
}
