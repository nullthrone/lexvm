/**
 * Text resolution, inline markup and plain-text rendering (spec section 4).
 *
 * - A `Text` is a string or a list of variants; the first variant whose `when`
 *   holds is used.
 * - `{id}` becomes a span with the object's name and `ref: id`;
 *   `{id|custom}` a span with the custom text and `ref: id`. References to
 *   unknown objects are left as raw text so the mistake stays visible.
 * - An object's name is a Text too (a character is "Wächter" until the player
 *   knows he is "Tadeusz"). Functions that render names take the state to
 *   resolve it against; `null` means no state, and the first variant is used.
 * - A blank line separates paragraphs (one OutputBlock each); single newlines
 *   stay inside the span text.
 */
import { evalConditions } from "./conditions.ts";
import type { GameObject, Pack, Text } from "./schema.ts";
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

/** The object with this id; undefined for unknown ids (own properties only, so e.g. "constructor" is unknown). */
export function objectDef(pack: Pack, id: string): GameObject | undefined {
  return Object.hasOwn(pack.objects, id) ? pack.objects[id] : undefined;
}

/**
 * An object's display name in this state: the first name variant whose `when`
 * holds. Without a state (null), or when no variant holds, the first variant.
 * The id for unknown objects.
 */
export function objectName(pack: Pack, state: GameState | null, id: string): string {
  const name = objectDef(pack, id)?.name;
  if (name === undefined) return id;
  if (typeof name === "string") return name;
  return (state !== null ? resolveText(pack, state, name) : null) ?? name[0]?.text ?? id;
}

/** Every text an object's name can show, first variant first. */
export function nameVariants(name: Text): string[] {
  return typeof name === "string" ? [name] : name.map((v) => v.text);
}

/** Convert one paragraph with inline references into spans; names are resolved against the state. */
export function markup(pack: Pack, state: GameState | null, text: string): Span[] {
  const spans: Span[] = [];
  let plain = "";
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    const id = m[1] ?? "";
    if (!objectDef(pack, id)) continue;
    plain += text.slice(last, m.index);
    if (plain) spans.push({ text: plain });
    plain = "";
    spans.push({ text: m[2] ?? objectName(pack, state, id), ref: id });
    last = m.index + m[0].length;
  }
  plain += text.slice(last);
  if (plain) spans.push({ text: plain });
  return spans;
}

/** Text → one block per paragraph. */
export function textBlocks(pack: Pack, state: GameState | null, kind: OutputKind, text: string): OutputBlock[] {
  return paragraphs(text).map((p) => ({ kind, spans: markup(pack, state, p) }));
}

/** Text → spans of a single paragraph (paragraph breaks become spaces). Used for roomText. */
export function inlineSpans(pack: Pack, state: GameState | null, text: string): Span[] {
  return markup(pack, state, paragraphs(text).join(" "));
}

/**
 * A one-line string as plain text, markup resolved (`{id}` → the object's
 * name, `{id|text}` → text). For buttons and hints, which show no references.
 */
export function plainText(pack: Pack, state: GameState | null, text: string): string {
  return inlineSpans(pack, state, text)
    .map((s) => s.text)
    .join("");
}

/**
 * The paragraphs of an object's current description as plain text (markup
 * resolved to names), without running a turn; [] for unknown objects and when
 * no variant applies. For UIs that show a description outside the
 * transcript, such as a clue in the notebook.
 */
export function objectDescription(pack: Pack, state: GameState, id: string): string[] {
  const text = resolveText(pack, state, objectDef(pack, id)?.description);
  return text === null ? [] : paragraphs(text).map((p) => plainText(pack, state, p));
}

/** A tappable reference to an object, showing its name in this state. */
export function objectSpan(pack: Pack, state: GameState | null, id: string): Span[] {
  return [{ text: objectName(pack, state, id), ref: id }];
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
