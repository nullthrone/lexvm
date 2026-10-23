/** Replay of `pack.walkthrough` (spec section 14, step 3). */

import { listedExits, offeredPredicate } from "./affordances.ts";
import { formatCommand, parseCanonical } from "./commands.ts";
import { activeOptions } from "./effects.ts";
import { indexPack } from "./pack-index.ts";
import { isHeld, presentObjects } from "./presence.ts";
import { newGame, step } from "./runtime.ts";
import type { Pack } from "./schema.ts";
import { renderPlain } from "./text.ts";
import type { Command, Diagnostic, GameState, OutputBlock, Span, WalkthroughReport, WalkthroughStep } from "./types.ts";

/**
 * Longest plain-text output kept per walkthrough step. The output is for
 * diagnostics; keeping every step's full text would let a small pack (a long
 * `say` repeated by many steps) fill the heap.
 */
export const STEP_OUTPUT_MAX = 4000;

/**
 * Replay pack.walkthrough from a new game. ok = all steps accepted and a
 * winning ending reached at the last step. Accepted steps that no action
 * sheet offers get a warning: tap players cannot perform them.
 */
export function runWalkthrough(pack: Pack): WalkthroughReport {
  const diagnostics: Diagnostic[] = [];
  const steps: WalkthroughStep[] = [];
  let state = newGame(pack).state;
  let failed = false;

  for (let i = 0; i < pack.walkthrough.length; i++) {
    const text = pack.walkthrough[i] ?? "";
    const path = `walkthrough[${i}]`;
    if (state.ended !== null) {
      diagnostics.push({
        severity: "error",
        code: "walkthrough.ended-early",
        path,
        message:
          `The game already ended with '${state.ended}' before step ${i + 1} ("${text}"); ` +
          `${pack.walkthrough.length - i} step(s) remain. Remove the remaining steps or move the ending later.`,
      });
      failed = true;
      break;
    }
    const cmd = parseCanonical(text);
    if (!cmd) {
      steps.push({ command: text, status: "rejected", output: "" });
      diagnostics.push({
        severity: "error",
        code: "walkthrough.malformed",
        path,
        message:
          `Step ${i + 1} "${text}" is not a canonical command. Use "verb [object [with]]" with ids ` +
          `separated by single spaces, e.g. "take brass_key", "use brass_key study_door", "go north", "choose ask_uncle".`,
      });
      failed = true;
      break;
    }
    const result = step(pack, state, cmd);
    if (result.status === "ok" && !isOffered(pack, state, cmd)) {
      diagnostics.push({
        severity: "warning",
        code: "walkthrough.not-offered",
        path,
        message:
          `Step ${i + 1} "${text}" works only as a typed command: no action sheet offers it, so tap players ` +
          `cannot do it. ${offerHint(pack, state, cmd)}`,
      });
    }
    steps.push({ command: formatCommand(cmd), status: result.status, output: clippedPlain(result.output) });
    if (result.status === "rejected") {
      const reason = result.output.map((b) => b.spans.map((s) => s.text).join("")).join(" ");
      diagnostics.push({
        severity: "error",
        code: "walkthrough.rejected",
        path,
        message: `Step ${i + 1} "${text}" was rejected: ${reason} ${describeSituation(pack, state)}`,
      });
      failed = true;
      break;
    }
    state = result.state;
  }

  const ending = state.ended;
  const won = ending !== null && pack.endings[ending]?.win === true;
  if (!failed && !won) {
    diagnostics.push({
      severity: "error",
      code: "walkthrough.not-won",
      path: "walkthrough",
      message:
        ending === null
          ? `The walkthrough ends without reaching an ending (ending: none). ${describeSituation(pack, state)} ` +
            "Add the missing steps up to an `end` effect with a winning ending."
          : `The walkthrough ends with '${ending}', which is not a winning ending (win: false).`,
    });
  }
  return { ok: !failed && won, steps, ending, score: state.score, diagnostics };
}

/** renderPlain of the first STEP_OUTPUT_MAX characters of span text, with " …" when cut. */
function clippedPlain(blocks: OutputBlock[]): string {
  const kept: OutputBlock[] = [];
  let room = STEP_OUTPUT_MAX;
  let cut = false;
  for (const block of blocks) {
    if (room <= 0) {
      cut = true;
      break;
    }
    const spans: Span[] = [];
    for (const span of block.spans) {
      if (span.text.length > room) {
        spans.push({ text: span.text.slice(0, room) });
        room = 0;
        cut = true;
        break;
      }
      spans.push(span);
      room -= span.text.length;
    }
    kept.push({ kind: block.kind, spans });
  }
  const text = renderPlain(kept);
  return cut ? `${text} …` : text;
}

function isOffered(pack: Pack, state: GameState, cmd: Command): boolean {
  const ix = indexPack(pack);
  return offeredPredicate(pack, ix, state, presentObjects(pack, state, ix.objectIds))(cmd);
}

/** How to offer a command in the action sheet. */
function offerHint(pack: Pack, state: GameState, cmd: Command): string {
  if (cmd.object === undefined || !pack.objects[cmd.object]) return "Use a command the action sheets offer.";
  if (cmd.verb === "give" || cmd.verb === "show") {
    if (cmd.with !== undefined && !pack.objects[cmd.with]?.npc) {
      return `${cmd.verb} needs a character (npc: true) as its second object.`;
    }
    if (!isHeld(pack, state, cmd.object)) {
      return `The action sheet offers ${cmd.verb} only for carried items: take ${cmd.object} first.`;
    }
  }
  return `Add "${cmd.verb}" to objects.${cmd.object}.verbs, or change the rule to a verb its action sheet offers.`;
}

/** Where the player is and what can be referred to, so an author (or an LLM) can fix a step. */
function describeSituation(pack: Pack, state: GameState): string {
  const ix = indexPack(pack);
  const present = presentObjects(pack, state, ix.objectIds);
  const parts = [
    `Current room: ${state.room}.`,
    `Present objects: ${present.room.join(", ") || "none"}.`,
    `Inventory: ${present.inv.join(", ") || "none"}.`,
    `Exits: ${
      listedExits(pack, state)
        .map((e) => e.id)
        .join(", ") || "none"
    }.`,
  ];
  if (state.dialogue) {
    const { id, node } = state.dialogue;
    const options = activeOptions(pack, state);
    parts.push(
      `Active dialogue: ${id}, node ${node}; only "choose <option>" is accepted. Options: ${
        options.map((o) => o.id).join(", ") || "none"
      }.`,
    );
  }
  return parts.join(" ");
}
