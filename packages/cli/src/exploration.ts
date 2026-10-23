/**
 * The exploration step of `lexvm check` and of the `lexvm generate` gate.
 *
 * 1. The main exploration (spec section 14) without `drop`, unless the caller
 *    asks for drop to be included.
 * 2. When that one is complete and clean, a second exploration that also drops
 *    every carried item. The action sheets offer `drop`, so a tap player can
 *    leave a needed item behind a one-way exit; the main exploration leaves
 *    drop out because it multiplies the state space. The second pass gets a
 *    smaller state budget; when it cannot finish, an info says so.
 * 3. An incomplete main exploration proves nothing and is an error, unless
 *    `allowIncomplete` downgrades it to a warning.
 *
 * The result's diagnostics include the fallbacks of fallbacks.ts.
 */
import { type Diagnostic, type ExploreReport, explore, type Pack } from "@lexvm/engine";
import { exploreFallbacks } from "./fallbacks.ts";

export interface ExplorationOptions {
  maxStates?: number;
  /** Explore `drop` in the main exploration already (no second pass). */
  includeDrop?: boolean;
  /** Report an incomplete exploration as a warning instead of an error. */
  allowIncomplete?: boolean;
}

/** The engine's default state limit. */
const DEFAULT_MAX_STATES = 200_000;
/** State budget of the drop pass: this many times the main exploration's states, at least DROP_MIN_STATES. */
const DROP_FACTOR = 20;
const DROP_MIN_STATES = 20_000;

/** Dead ends and losing endings found by the drop pass; the main pass found none. */
const DROP_CODES = new Set(["explore.dead-end", "explore.losing-ending"]);

export function verifyExploration(pack: Pack, options: ExplorationOptions = {}): ExploreReport {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const main = explore(pack, { maxStates, includeDrop: options.includeDrop === true });
  let report: ExploreReport = { ...main, diagnostics: [...main.diagnostics] };

  const clean = main.complete && main.winnable && main.deadEnds.length === 0 && main.losingEndings.length === 0;
  if (options.includeDrop !== true && clean) {
    const limit = Math.min(maxStates, Math.max(DROP_MIN_STATES, main.states * DROP_FACTOR));
    const drop = explore(pack, { maxStates: limit, includeDrop: true });
    if (drop.complete) {
      report = {
        ...report,
        deadEnds: drop.deadEnds,
        losingEndings: drop.losingEndings,
        diagnostics: [...report.diagnostics, ...drop.diagnostics.filter((d) => DROP_CODES.has(d.code))],
      };
    } else {
      report.diagnostics.push({
        severity: "info",
        code: "explore.drop-incomplete",
        path: "",
        message:
          `Dropping items was explored only up to ${limit} states, so dead ends that come from leaving an item behind ` +
          "were not ruled out. A rule on 'drop' for the items the solution needs (e.g. on: { verb: drop, object: key } " +
          "with a say) keeps them with the player.",
      });
    }
  }

  const allow = options.allowIncomplete === true;
  const diagnostics: Diagnostic[] = [...report.diagnostics, ...exploreFallbacks(report)].map((d) =>
    allow && d.code === "explore.incomplete" ? { ...d, severity: "warning" } : d,
  );
  return { ...report, diagnostics };
}
