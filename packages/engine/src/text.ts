import type { OutputBlock } from "./types.ts";

/** Render output blocks as plain text (terminal, logs, LLM playtesting). */
export function renderPlain(_blocks: OutputBlock[]): string {
  throw new Error("not implemented: renderPlain");
}
