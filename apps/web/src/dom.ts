/**
 * Minimal DOM builder.
 *
 * Security rule: pack text and imported files are untrusted. This helper only
 * ever creates text nodes for string children (never parses HTML), and the
 * code base must not use innerHTML/outerHTML/insertAdjacentHTML or any other
 * HTML or script sink at all (asserted by the "no HTML injection" test in
 * test/styles.test.ts; the Content-Security-Policy enforces Trusted Types).
 */

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string | undefined;
  id?: string | undefined;
  /** Attributes set with setAttribute; `false`/`null`/`undefined` skips the attribute, `true` sets it empty. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  /** Event listeners, e.g. { click: (e) => … }. */
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
  text?: string;
  hidden?: boolean;
  type?: string;
  lang?: string | undefined;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, ...children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.lang) el.lang = props.lang;
  if (props.hidden) el.hidden = true;
  if (props.type) el.setAttribute("type", props.type);
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      el.setAttribute(name, value === true ? "" : String(value));
    }
  }
  if (props.dataset) {
    for (const [name, value] of Object.entries(props.dataset)) el.dataset[name] = value;
  }
  if (props.on) {
    for (const [name, handler] of Object.entries(props.on)) {
      if (handler) el.addEventListener(name, handler as EventListener);
    }
  }
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number" ? text(String(child)) : child);
  }
}

export function text(value: string): Text {
  return document.createTextNode(value);
}

/** Remove all children. */
export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Replace all children. */
export function replaceChildren(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, ...children);
}

let idCounter = 0;
/** Unique DOM id for aria-labelledby wiring. */
export function uid(prefix = "lx"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Elements that can receive keyboard focus inside `root`. */
export function focusables(root: Element): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !el.hasAttribute("inert") && el.closest("[hidden]") === null,
  );
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
