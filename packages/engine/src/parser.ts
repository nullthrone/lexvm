import type { Pack } from "./schema.ts";
import type { GameState, ParseResult } from "./types.ts";

/** Parse free text input in the pack's language into a Command (or a meta command). */
export function parseCommand(_pack: Pack, _state: GameState, _input: string): ParseResult {
  throw new Error("not implemented: parseCommand");
}
