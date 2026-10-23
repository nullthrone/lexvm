import type { Pack } from "./schema.ts";
import type { WalkthroughReport } from "./types.ts";

/** Replay pack.walkthrough from a new game. ok = all steps accepted and a winning ending reached at the last step. */
export function runWalkthrough(_pack: Pack): WalkthroughReport {
  throw new Error("not implemented: runWalkthrough");
}
