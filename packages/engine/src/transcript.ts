/**
 * The walkthrough as a reader sees it: the whole game text of one winning
 * play, in order, as Markdown. It is the artifact for reviewing the story
 * (authoring guide, "Story and scenes"): verification proves that a pack can
 * be won, the transcript shows whether it can be followed.
 */

import { parseCanonical } from "./commands.ts";
import { newGame, step } from "./runtime.ts";
import type { Pack } from "./schema.ts";
import type { OutputBlock } from "./types.ts";

export interface Transcript {
  /** Markdown: room titles as headings, the player's commands as quotes, system lines left out. */
  markdown: string;
  /** Accepted walkthrough steps. */
  steps: number;
  /** Every step accepted and a winning ending reached. */
  ok: boolean;
}

function blocksToMarkdown(blocks: OutputBlock[], out: string[]): void {
  let prev: OutputBlock["kind"] | null = null;
  for (const block of blocks) {
    const text = block.spans
      .map((s) => s.text)
      .join("")
      .trim();
    if (text === "") continue;
    switch (block.kind) {
      case "echo":
        out.push(`> ${text}`);
        break;
      case "room-title":
        out.push(`## ${text}`);
        break;
      case "system":
        break;
      case "ending":
        out.push(prev === "ending" ? text : `### ${text}`);
        break;
      default:
        out.push(text);
    }
    prev = block.kind;
  }
}

/** Replay pack.walkthrough from a new game and render everything the player reads. Stops at the first problem. */
export function walkthroughTranscript(pack: Pack): Transcript {
  const out: string[] = [`# ${pack.title}`];
  if (pack.subtitle !== undefined) out.push(`*${pack.subtitle}*`);
  const game = newGame(pack);
  blocksToMarkdown(game.output, out);
  let state = game.state;
  let steps = 0;
  let failed = false;
  for (const text of pack.walkthrough) {
    const cmd = state.ended === null ? parseCanonical(text) : null;
    if (cmd === null) {
      failed = true;
      break;
    }
    const result = step(pack, state, cmd);
    if (result.status !== "ok") {
      failed = true;
      break;
    }
    steps++;
    blocksToMarkdown(result.output, out);
    state = result.state;
  }
  const ok = !failed && state.ended !== null && pack.endings[state.ended]?.win === true;
  if (!ok) out.push(`*(The walkthrough stops here after ${steps} accepted steps without a winning ending.)*`);
  return { markdown: `${out.join("\n\n")}\n`, steps, ok };
}
