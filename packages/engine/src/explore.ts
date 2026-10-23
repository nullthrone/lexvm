import type { Pack } from "./schema.ts";
import type { ExploreOptions, ExploreReport } from "./types.ts";

/** Breadth-first search over the logical state space to verify winnability and the forgiving policy. */
export function explore(_pack: Pack, _options?: ExploreOptions): ExploreReport {
  throw new Error("not implemented: explore");
}
