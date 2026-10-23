/** Small pure text helpers for pack strings and engine output. */
import type { OutputBlock } from "@lexvm/engine";

/**
 * Turn pack inline markup into plain text: `{id|shown text}` becomes "shown text",
 * `{id}` becomes the object's name (or the id if unknown). Used for hint steps.
 */
export function stripMarkup(text: string, nameOf: (id: string) => string | undefined): string {
  return text.replace(/\{([a-z][a-z0-9_]*)(?:\|([^{}]*))?\}/g, (_whole, id: string, shown: string | undefined) =>
    shown !== undefined ? shown : (nameOf(id) ?? id),
  );
}

/** Plain text of one output block. */
export function blockText(block: OutputBlock): string {
  return block.spans.map((s) => s.text).join("");
}

/**
 * For an ambiguous typed command, rewrite the input so it names one candidate
 * explicitly: the first input word that is part of the candidate's name is
 * replaced by the full name ("take book" + "red book" -> "take red book").
 * Returns null if no word matches.
 */
export function disambiguate(input: string, candidateName: string): string | null {
  const words = input.trim().split(/\s+/);
  const nameWords = new Set(candidateName.toLowerCase().split(/\s+/));
  const index = words.findIndex((w) => nameWords.has(w.toLowerCase()));
  if (index < 0) return null;
  // Drop neighbouring words that are also part of the name to avoid "red red book".
  let start = index;
  while (start > 0 && nameWords.has((words[start - 1] ?? "").toLowerCase())) start -= 1;
  let end = index;
  while (end + 1 < words.length && nameWords.has((words[end + 1] ?? "").toLowerCase())) end += 1;
  return [...words.slice(0, start), candidateName, ...words.slice(end + 1)].join(" ");
}

/** Human-readable size, e.g. "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
