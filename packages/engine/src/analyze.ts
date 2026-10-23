import {
  checkDialogues,
  checkEndingsScoreHints,
  checkFlagsAndCounters,
  checkRoomReachability,
  checkRules,
} from "./analyze-logic.ts";
import { checkReferences, Refs } from "./analyze-refs.ts";
import { checkText } from "./analyze-text.ts";
import { indexPack } from "./analyze-walk.ts";
import { checkWalkthrough } from "./analyze-walkthrough.ts";
import { DiagnosticList, sortDiagnostics } from "./diagnostics.ts";
import type { Pack } from "./schema.ts";
import type { Diagnostic } from "./types.ts";

/**
 * Static semantic checks on a schema-valid pack: references, declarations,
 * reserved ids, exits, dialogues, walkthrough syntax, mobile text budgets.
 * Does not execute the game (see runWalkthrough and explore).
 *
 * Every diagnostic has a stable code (e.g. "ref.unknown-object") and a path
 * into the normalised pack; the result is sorted by path. Deterministic and
 * linear in the size of the pack.
 */
export function analyze(pack: Pack): Diagnostic[] {
  const ix = indexPack(pack);
  const out = new DiagnosticList();
  checkReferences(new Refs(ix, out));
  checkRules(ix, out);
  checkFlagsAndCounters(ix, out);
  checkEndingsScoreHints(ix, out);
  checkRoomReachability(ix, out);
  checkDialogues(ix, out);
  checkText(ix, out);
  checkWalkthrough(ix, out);
  return sortDiagnostics(out.items);
}
