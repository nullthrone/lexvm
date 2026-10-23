import type { Pack } from "./schema.ts";
import type { Diagnostic } from "./types.ts";

/**
 * Static semantic checks on a schema-valid pack: references, declarations,
 * reserved ids, exits, dialogues, walkthrough syntax, mobile text budgets.
 * Does not execute the game (see runWalkthrough and explore).
 */
export function analyze(_pack: Pack): Diagnostic[] {
  throw new Error("not implemented: analyze");
}
