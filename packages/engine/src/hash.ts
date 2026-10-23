import type { Pack } from "./schema.ts";
import type { GameState } from "./types.ts";

/** Stable content hash of a pack (hex), used to bind save games to pack contents. */
export function packHash(_pack: Pack): string {
  throw new Error("not implemented: packHash");
}

/** Canonical key of the logical state (excludes `turn`), used for deduplication in explore. */
export function stateKey(_state: GameState): string {
  throw new Error("not implemented: stateKey");
}
