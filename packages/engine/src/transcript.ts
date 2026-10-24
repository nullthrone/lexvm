/**
 * The walkthrough as a reader sees it: the whole game text of one winning
 * play, in order, as Markdown. It is the artifact for reviewing the story
 * (authoring guide, "Story and scenes"): verification proves that a pack can
 * be won, the transcript shows whether it can be followed. New notebook
 * entries are shown where they are learned, with their text, because the
 * player can read them there: an entry must not be ahead of the story.
 */

import { parseCanonical } from "./commands.ts";
import { newGame, step } from "./runtime.ts";
import { INVENTORY, type Pack } from "./schema.ts";
import { objectDescription } from "./text.ts";
import type { GameState, OutputBlock } from "./types.ts";

export interface Transcript {
  /** Markdown: room titles as headings, the player's commands as quotes, new notebook entries with their text, other system lines left out. */
  markdown: string;
  /** Accepted walkthrough steps. */
  steps: number;
  /** Every step accepted and a winning ending reached. */
  ok: boolean;
}

/** Clues that are in the notebook in `after` but were not in `before`. */
function newClues(pack: Pack, before: GameState | null, after: GameState): Set<string> {
  const known = (st: GameState | null, id: string) => {
    const os = st?.objects[id];
    return os !== undefined && os.location === INVENTORY && !os.hidden;
  };
  const ids = new Set<string>();
  for (const [id, def] of Object.entries(pack.objects))
    if (def.clue && known(after, id) && !known(before, id)) ids.add(id);
  return ids;
}

/**
 * Render the blocks of one step. A system block naming a clue learned in this
 * step becomes a notebook line with the clue's text (resolved against the state
 * after the step); every other system block is left out.
 */
function blocksToMarkdown(
  pack: Pack,
  state: GameState,
  learned: Set<string>,
  blocks: OutputBlock[],
  out: string[],
): void {
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
      case "system": {
        const id = block.spans.find((s) => s.ref !== undefined && learned.has(s.ref))?.ref;
        if (id === undefined) break;
        learned.delete(id);
        const name = pack.objects[id]?.name ?? id;
        out.push(`*Notebook: ${name}.* ${objectDescription(pack, state, id).join(" ")}`.trim());
        break;
      }
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
  blocksToMarkdown(pack, game.state, newClues(pack, null, game.state), game.output, out);
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
    blocksToMarkdown(pack, result.state, newClues(pack, state, result.state), result.output, out);
    state = result.state;
  }
  const ok = !failed && state.ended !== null && pack.endings[state.ended]?.win === true;
  if (!ok) out.push(`*(The walkthrough stops here after ${steps} accepted steps without a winning ending.)*`);
  return { markdown: `${out.join("\n\n")}\n`, steps, ok };
}
