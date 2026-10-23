/**
 * Diagnostics derived from the engine's walkthrough and exploration results,
 * shared by `lexvm check` and the verification gates of `lexvm generate`.
 *
 * The engine reports problems itself (walkthrough.rejected, walkthrough.not-won,
 * explore.not-winnable, explore.dead-end, explore.losing-ending,
 * explore.incomplete). The fallbacks below use the same codes and are added
 * only when the engine's own diagnostics lack that code, so a problem is never
 * reported twice. explore.not-winnable is only meaningful for a complete
 * exploration: an incomplete one that found no win proves nothing, and the
 * engine's explore.incomplete warning covers it.
 */
import type { Diagnostic, ExploreReport, Pack, WalkthroughReport } from "@lexvm/engine";

function missing(diagnostics: readonly Diagnostic[], code: string): boolean {
  return !diagnostics.some((d) => d.code === code);
}

/** Fallbacks for a walkthrough replay, plus the score check (walkthrough.score-mismatch). */
export function walkthroughFallbacks(pack: Pack, report: WalkthroughReport): Diagnostic[] {
  const out: Diagnostic[] = [];
  const known = report.diagnostics;
  if (!report.ok && !known.some((d) => d.severity === "error")) {
    const index = report.steps.findIndex((s) => s.status !== "ok");
    const failed = index >= 0 ? report.steps[index]! : null;
    if (failed && missing(known, "walkthrough.rejected")) {
      out.push({
        severity: "error",
        code: "walkthrough.rejected",
        path: `walkthrough[${index}]`,
        message: `Walkthrough step ${index + 1} "${failed.command}" was rejected: ${failed.output.trim()}`,
      });
    } else if (!failed && missing(known, "walkthrough.not-won")) {
      out.push({
        severity: "error",
        code: "walkthrough.not-won",
        path: "walkthrough",
        message: `The walkthrough does not end in a winning ending (ending: ${report.ending ?? "none"}). Add the missing steps up to an \`end\` effect with a winning ending.`,
      });
    }
  }
  if (report.ok && pack.maxScore !== undefined && report.score !== pack.maxScore) {
    out.push({
      severity: "warning",
      code: "walkthrough.score-mismatch",
      path: "maxScore",
      message: `The walkthrough ends with score ${report.score}, but maxScore is ${pack.maxScore}. Set maxScore to ${report.score} or add the missing score effects.`,
    });
  }
  return out;
}

/** Fallbacks for an exploration whose problems appear only in its result fields. */
export function exploreFallbacks(report: ExploreReport): Diagnostic[] {
  const out: Diagnostic[] = [];
  const known = report.diagnostics;
  if (report.complete && !report.winnable && missing(known, "explore.not-winnable")) {
    out.push({
      severity: "error",
      code: "explore.not-winnable",
      path: "endings",
      message: "No winning ending is reachable from the start with the actions the action sheets offer.",
    });
  }
  const dead = report.deadEnds[0];
  if (dead && missing(known, "explore.dead-end")) {
    out.push({
      severity: "error",
      code: "explore.dead-end",
      path: "",
      message: `${report.deadEnds.length} dead end(s): states from which no winning ending is reachable. First after: ${dead.path.join("; ") || "(start)"}.`,
    });
  }
  const losing = report.losingEndings[0];
  if (losing && missing(known, "explore.losing-ending")) {
    out.push({
      severity: "error",
      code: "explore.losing-ending",
      path: `endings.${losing.ending}`,
      message: `Losing ending '${losing.ending}' is reachable via: ${losing.path.join("; ")}. Every ending must be a win.`,
    });
  }
  if (!report.complete && missing(known, "explore.incomplete")) {
    out.push({
      severity: "warning",
      code: "explore.incomplete",
      path: "",
      message: `The state space was not fully explored (${report.states} states). Raise the state limit or bound counters and flags.`,
    });
  }
  return out;
}
