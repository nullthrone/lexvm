/**
 * Text resolution, inline markup and plain-text rendering (spec section 4).
 *
 * - A `Text` is a string or a list of variants; the first variant whose `when`
 *   holds is used.
 * - `{id}` becomes a span with the object's name and `ref: id`;
 *   `{id|custom}` a span with the custom text and `ref: id`. References to
 *   unknown objects are left as raw text so the mistake stays visible.
 * - A blank line separates paragraphs (one OutputBlock each); single newlines
 *   stay inside the span text.
 */
import { evalConditions } from "./conditions.ts";
import type { Pack, Text } from "./schema.ts";
import type { GameState, OutputBlock, OutputKind, Span } from "./types.ts";

/** The string of the first applicable variant, or null when no variant applies. */
export function resolveText(pack: Pack, state: GameState, text: Text | undefined): string | null {
  if (text === undefined) return null;
  if (typeof text === "string") return text;
  for (const variant of text) {
    if (evalConditions(pack, state, variant.when)) return variant.text;
  }
  return null;
}

/** Split a string into paragraphs (blank-line separated), trimmed, empty ones dropped. */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const MARKUP = /\{([a-z][a-z0-9_]*)(?:\|([^{}]*))?\}/g;

/** Convert one paragraph with inline references into spans. */
export function markup(pack: Pack, text: string): Span[] {
  const spans: Span[] = [];
  let plain = "";
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    const id = m[1] ?? "";
    const obj = pack.objects[id];
    if (!obj) continue;
    plain += text.slice(last, m.index);
    if (plain) spans.push({ text: plain });
    plain = "";
    spans.push({ text: m[2] ?? obj.name, ref: id });
    last = m.index + m[0].length;
  }
  plain += text.slice(last);
  if (plain) spans.push({ text: plain });
  return spans;
}

/** Text → one block per paragraph. */
export function textBlocks(pack: Pack, kind: OutputKind, text: string): OutputBlock[] {
  return paragraphs(text).map((p) => ({ kind, spans: markup(pack, p) }));
}

/** Text → spans of a single paragraph (paragraph breaks become spaces). Used for roomText. */
export function inlineSpans(pack: Pack, text: string): Span[] {
  return markup(pack, paragraphs(text).join(" "));
}

/** A tappable reference to an object, showing its name. */
export function objectSpan(pack: Pack, id: string): Span[] {
  return [{ text: pack.objects[id]?.name ?? id, ref: id }];
}

/**
 * Render output blocks as plain text for terminals, logs and LLM playtesters.
 *
 * echo → "> Take key"; room-title → "== Library =="; system → "(Exits: east.)";
 * the first block of an ending → "*** The End ***". Blocks are separated by a
 * blank line.
 */
export function renderPlain(blocks: OutputBlock[]): string {
  const out: string[] = [];
  let prev: OutputKind | null = null;
  for (const block of blocks) {
    const text = block.spans.map((s) => s.text).join("");
    switch (block.kind) {
      case "echo":
        out.push(`> ${text}`);
        break;
      case "room-title":
        out.push(`== ${text} ==`);
        break;
      case "system":
        out.push(`(${text})`);
        break;
      case "ending":
        out.push(prev === "ending" ? text : `*** ${text} ***`);
        break;
      default:
        out.push(text);
    }
    prev = block.kind;
  }
  return out.join("\n\n");
}
