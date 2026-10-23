import {
  type Diagnostic,
  type ExploreOptions,
  type ExploreReport,
  explore,
  type Pack,
  runWalkthrough,
  type WalkthroughReport,
} from "@lexvm/engine";
import { flag, intOption, parseArgs, UsageError } from "../args.ts";
import { compileSource, expandTargets, readPackSource } from "../sources.ts";
import { color, countDiagnostics, formatDiagnostic, out, plural, summarizeCounts } from "../term.ts";

export const CHECK_HELP = `Usage: lexvm check <packDir|packsDir|file>... [options]

Full verification of content packs: schema and semantic checks, replay of the
walkthrough, and exploration of the reachable state space (winnable from
every state, no dead ends, no losing endings, unreached content).

Options:
  --json             Machine-readable output
  --max-states <n>   Exploration limit (default: engine default, 200000)
  --include-drop     Also explore 'drop' commands (much larger state space)
  --no-explore       Skip the state-space exploration
  -h, --help         Show this help

Exit codes: 0 no errors, 1 errors found, 2 usage error.`;

export interface CheckReport {
  target: string;
  pack: string | null;
  ok: boolean;
  diagnostics: Diagnostic[];
  walkthrough: null | {
    ok: boolean;
    steps: number;
    ending: string | null;
    score: number;
    maxScore: number | null;
    /** First step that was not accepted, with its output. */
    failedStep: null | { index: number; command: string; status: string; output: string };
  };
  explore: null | {
    complete: boolean;
    states: number;
    winnable: boolean;
    shortestWin: string[] | null;
    deadEnds: ExploreReport["deadEnds"];
    losingEndings: ExploreReport["losingEndings"];
    unreached: ExploreReport["unreached"];
  };
}

function engineFailure(code: string, what: string, e: unknown): Diagnostic {
  return {
    severity: "error",
    code,
    path: "",
    message: `${what} failed with an internal error: ${e instanceof Error ? e.message : String(e)}`,
  };
}

function addUnlessPresent(diagnostics: Diagnostic[], d: Diagnostic): void {
  if (!diagnostics.some((x) => x.code === d.code)) diagnostics.push(d);
}

function summarizeWalkthrough(
  pack: Pack,
  report: WalkthroughReport,
  diagnostics: Diagnostic[],
): CheckReport["walkthrough"] {
  diagnostics.push(...report.diagnostics);
  const failedIndex = report.steps.findIndex((s) => s.status !== "ok");
  const failed = failedIndex >= 0 ? report.steps[failedIndex]! : null;
  if (!report.ok && !report.diagnostics.some((d) => d.severity === "error")) {
    diagnostics.push({
      severity: "error",
      code: "walkthrough.failed",
      path: failed ? `walkthrough[${failedIndex}]` : "walkthrough",
      message: failed
        ? `Walkthrough step ${failedIndex + 1} "${failed.command}" was rejected: ${failed.output.trim()}`
        : `The walkthrough does not end in a winning ending (ending: ${report.ending ?? "none"}). Add the missing steps.`,
    });
  }
  if (pack.maxScore !== undefined && report.score !== pack.maxScore) {
    diagnostics.push({
      severity: "warning",
      code: "walkthrough.score-mismatch",
      path: "maxScore",
      message: `The walkthrough ends with score ${report.score}, but maxScore is ${pack.maxScore}. Set maxScore to ${report.score} or add the missing score effects.`,
    });
  }
  return {
    ok: report.ok,
    steps: report.steps.length,
    ending: report.ending,
    score: report.score,
    maxScore: pack.maxScore ?? null,
    failedStep: failed && { index: failedIndex, command: failed.command, status: failed.status, output: failed.output },
  };
}

function summarizeExplore(report: ExploreReport, diagnostics: Diagnostic[]): CheckReport["explore"] {
  diagnostics.push(...report.diagnostics);
  // Fallbacks in case the explorer reports a problem only in its result fields. An incomplete
  // exploration that found no win proves nothing; the explore.incomplete warning covers it.
  if (!report.winnable && report.complete) {
    addUnlessPresent(diagnostics, {
      severity: "error",
      code: "explore.not-winnable",
      path: "",
      message: "No winning ending is reachable from the start.",
    });
  }
  if (report.deadEnds.length > 0) {
    addUnlessPresent(diagnostics, {
      severity: "error",
      code: "explore.dead-end",
      path: "",
      message: `${plural(report.deadEnds.length, "dead end")} found: states from which no winning ending is reachable. First: ${report.deadEnds[0]!.path.join("; ")}`,
    });
  }
  if (report.losingEndings.length > 0) {
    addUnlessPresent(diagnostics, {
      severity: "error",
      code: "explore.losing-ending",
      path: "",
      message: `Losing ending "${report.losingEndings[0]!.ending}" is reachable: ${report.losingEndings[0]!.path.join("; ")}`,
    });
  }
  if (!report.complete) {
    addUnlessPresent(diagnostics, {
      severity: "warning",
      code: "explore.incomplete",
      path: "",
      message: `The state space was not fully explored (${report.states} states). Raise --max-states or bound counters and flags.`,
    });
  }
  return {
    complete: report.complete,
    states: report.states,
    winnable: report.winnable,
    shortestWin: report.shortestWin,
    deadEnds: report.deadEnds,
    losingEndings: report.losingEndings,
    unreached: report.unreached,
  };
}

function checkTarget(
  target: string,
  options: ExploreOptions,
  noExplore: boolean,
): { report: CheckReport; baseDir: string } {
  const source = readPackSource(target);
  const result = compileSource(source);
  const diagnostics = [...result.diagnostics];
  const report: CheckReport = {
    target,
    pack: result.pack?.id ?? null,
    ok: false,
    diagnostics,
    walkthrough: null,
    explore: null,
  };
  const pack = result.pack;
  if (pack !== null) {
    try {
      report.walkthrough = summarizeWalkthrough(pack, runWalkthrough(pack), diagnostics);
    } catch (e) {
      diagnostics.push(engineFailure("check.walkthrough-crashed", "Walkthrough replay", e));
    }
    if (!noExplore) {
      try {
        report.explore = summarizeExplore(explore(pack, options), diagnostics);
      } catch (e) {
        diagnostics.push(engineFailure("check.explore-crashed", "Exploration", e));
      }
    }
  }
  report.ok = pack !== null && countDiagnostics(diagnostics).error === 0;
  return { report, baseDir: source.baseDir };
}

function listOrNone(items: readonly string[]): string {
  if (items.length === 0) return "none";
  const shown = items.slice(0, 8).join(", ");
  return items.length > 8 ? `${items.length} (${shown}, …)` : `${items.length} (${shown})`;
}

function printReport(report: CheckReport, baseDir: string): void {
  out(color.bold(`== ${report.pack ?? "(invalid pack)"}  ${color.dim(report.target)}`));
  for (const d of report.diagnostics) out(formatDiagnostic(d, baseDir, report.target));
  out(`  diagnostics   ${summarizeCounts(report.diagnostics)}`);
  const w = report.walkthrough;
  if (w !== null) {
    const score = w.maxScore === null ? `score ${w.score}` : `score ${w.score}/${w.maxScore}`;
    out(
      `  walkthrough   ${w.ok ? color.green("ok") : color.red("FAILED")}, ${plural(w.steps, "step")}, ending ${w.ending ?? "none"}, ${score}`,
    );
    if (w.failedStep !== null) {
      out(`                step ${w.failedStep.index + 1} "${w.failedStep.command}" was ${w.failedStep.status}:`);
      for (const line of w.failedStep.output.trim().split("\n").slice(0, 8)) out(`                  ${line}`);
    }
  }
  const x = report.explore;
  if (x !== null) {
    const parts = [
      x.complete ? "complete" : color.yellow("incomplete"),
      plural(x.states, "state"),
      x.winnable ? "winnable" : color.red("NOT winnable"),
      x.shortestWin === null ? "no win found" : `shortest win ${plural(x.shortestWin.length, "step")}`,
      x.deadEnds.length > 0 ? color.red(plural(x.deadEnds.length, "dead end")) : "0 dead ends",
      x.losingEndings.length > 0 ? color.red(plural(x.losingEndings.length, "losing ending")) : "0 losing endings",
    ];
    out(`  explore       ${parts.join(", ")}`);
    for (const d of x.deadEnds.slice(0, 3)) out(`                dead end after: ${d.path.join("; ") || "(start)"}`);
    for (const l of x.losingEndings.slice(0, 3))
      out(`                losing ending ${l.ending} after: ${l.path.join("; ")}`);
    const u = x.unreached;
    out(
      `  unreached     rooms: ${listOrNone(u.rooms)}; endings: ${listOrNone(u.endings)}; rules: ${listOrNone(u.rules)}; options: ${listOrNone(u.options)}`,
    );
  }
  out(`  result        ${report.ok ? color.green("OK") : color.red("FAILED")}`);
}

export function runCheck(argv: string[]): number {
  const args = parseArgs(argv, {
    json: { type: "boolean" },
    "max-states": { type: "string" },
    "include-drop": { type: "boolean" },
    "no-explore": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    out(CHECK_HELP);
    return 0;
  }
  if (args.positionals.length === 0) throw new UsageError("check needs at least one pack, packs directory or file");
  const options: ExploreOptions = {};
  const maxStates = intOption(args, "max-states");
  if (maxStates !== undefined) options.maxStates = maxStates;
  if (flag(args, "include-drop")) options.includeDrop = true;

  const reports: CheckReport[] = [];
  for (const target of expandTargets(args.positionals)) {
    const { report, baseDir } = checkTarget(target, options, flag(args, "no-explore"));
    reports.push(report);
    if (!flag(args, "json")) printReport(report, baseDir);
  }
  if (flag(args, "json")) out(JSON.stringify(reports, null, 2));
  return reports.every((r) => r.ok) ? 0 : 1;
}
