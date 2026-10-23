/** Short, unobtrusive notifications above the dock. */
import { h } from "../dom.ts";

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (region?.isConnected) return region;
  region = h("div", { class: "toasts", attrs: { role: "status", "aria-live": "polite" } });
  document.body.appendChild(region);
  return region;
}

export interface ToastOptions {
  action?: { label: string; run: () => void };
  /** Milliseconds until it disappears; 0 keeps it until dismissed. Default 4000. */
  duration?: number;
}

/** Show a toast; returns a function that dismisses it. */
export function toast(message: string, options: ToastOptions = {}): () => void {
  const host = ensureRegion();
  const dismiss = () => item.remove();
  const item = h(
    "div",
    { class: "toast" },
    h("span", { class: "toast__text", text: message }),
    options.action
      ? h("button", {
          class: "toast__action",
          type: "button",
          text: options.action.label,
          on: {
            click: () => {
              dismiss();
              options.action?.run();
            },
          },
        })
      : null,
  );
  host.appendChild(item);
  const duration = options.duration ?? 4000;
  if (duration > 0) setTimeout(dismiss, duration);
  return dismiss;
}
