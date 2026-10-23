import type { Pack } from "./schema.ts";
import type { Command, GameState, HintView, OutputBlock, StepResult, View } from "./types.ts";

/** Start a new game: initial state plus intro and first room description. Fires `start` and `enter` rules. */
export function newGame(_pack: Pack): { state: GameState; output: OutputBlock[] } {
  throw new Error("not implemented: newGame");
}

/** Execute one command. Pure: never mutates `state`. */
export function step(_pack: Pack, _state: GameState, _command: Command): StepResult {
  throw new Error("not implemented: step");
}

/** Affordances for the UI: present objects with their verbs, inventory, exits, dialogue options, ending. */
export function view(_pack: Pack, _state: GameState): View {
  throw new Error("not implemented: view");
}

/** The currently relevant hint, or null. */
export function hint(_pack: Pack, _state: GameState): HintView | null {
  throw new Error("not implemented: hint");
}
