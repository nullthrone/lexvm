import {
  type Diagnostic,
  type ExploreReport,
  estimatePlaytime,
  type Pack,
  type PlaytimeOptions,
  type PlaytimeReport,
  runWalkthrough,
  type WalkthroughReport,
} from "@lexvm/engine";
import { flag, intOption, parseArgs, UsageError } from "../args.ts";
import { type ExplorationOptions, verifyExploration } from "../exploration.ts";
import { walkthroughFallbacks } from "../fallbacks.ts";
import { compileSource, expandTargets, readPackSource } from "../sources.ts";
import { clean, color, countDiagnostics, formatDiagnostic, out, plural, summarizeCounts } from "../term.ts";

export const CHECK_HELP = `Usage: lexvm check <packDir|packsDir|file>... [options]

Full verification of content packs: schema and semantic checks, replay of the
walkthrough, a play time estimate, and exploration of the reachable state
space (winnable from every state, no dead ends, no losing endings, unreached
content).

Options:
  --json                 Machine-readable output
  --max-states <n>       Exploration limit (default: engine default, 200000)
  --include-drop         Explore 'drop' commands in the main exploration (by default a
                         second, smaller exploration covers them)
  --allow-incomplete     Accept an exploration that hits the state limit (warning, not error)
  --no-explore           Skip the state-space exploration
  --wpm <n>              Reading speed for the play time estimate (default by language: de 200, en 230, other 220)
  --target-minutes <n>   Target play time; overrides the pack's playtime
  -h, --help             Show this help

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
  /** Play time estimate; its diagnostics are part of `diagnostics`. */
  playtime: null | Omit<PlaytimeReport, "diagnostics">;
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

function summarizeWalkthrough(
  pack: Pack,
  report: WalkthroughReport,
  diagnostics: Diagnostic[],
): CheckReport["walkthrough"] {
  diagnostics.push(...report.diagnostics, ...walkthroughFallbacks(pack, report, diagnostics));
  const failedIndex = report.steps.findIndex((s) => s.status !== "ok");
  const failed = failedIndex >= 0 ? report.steps[failedIndex]! : null;
  return {
    ok: report.ok,
    steps: report.steps.length,
    ending: report.ending,
    score: report.score,
    maxScore: pack.maxScore ?? null,
    failedStep: failed && { index: failedIndex, command: failed.command, status: failed.status, output: failed.output },
  };
}

function summarizePlaytime(report: PlaytimeReport, diagnostics: Diagnostic[]): CheckReport["playtime"] {
  diagnostics.push(...report.diagnostics);
  const { diagnostics: _omitted, ...summary } = report;
  return summary;
}

function summarizeExplore(report: ExploreReport, diagnostics: Diagnostic[]): CheckReport["explore"] {
  diagnostics.push(...report.diagnostics);
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
  options: ExplorationOptions,
  playtimeOptions: PlaytimeOptions,
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
    playtime: null,
    explore: null,
  };
  const pack = result.pack;
  if (pack !== null) {
    try {
      report.walkthrough = summarizeWalkthrough(pack, runWalkthrough(pack), diagnostics);
    } catch (e) {
      diagnostics.push(engineFailure("check.walkthrough-crashed", "Walkthrough replay", e));
    }
    try {
      report.playtime = summarizePlaytime(estimatePlaytime(pack, playtimeOptions), diagnostics);
    } catch (e) {
      diagnostics.push(engineFailure("check.playtime-crashed", "Play time estimate", e));
    }
    if (!noExplore) {
      try {
        report.explore = summarizeExplore(verifyExploration(pack, options), diagnostics);
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
  const shown = clean(items.slice(0, 8).join(", "));
  return items.length > 8 ? `${items.length} (${shown}, …)` : `${items.length} (${shown})`;
}

function printReport(report: CheckReport, baseDir: string): void {
  out(color.bold(`== ${clean(report.pack ?? "(invalid pack)")}  ${color.dim(clean(report.target))}`));
  for (const d of report.diagnostics) out(formatDiagnostic(d, baseDir, report.target));
  out(`  diagnostics   ${summarizeCounts(report.diagnostics)}`);
  const w = report.walkthrough;
  if (w !== null) {
    const score = w.maxScore === null ? `score ${w.score}` : `score ${w.score}/${w.maxScore}`;
    out(
      `  walkthrough   ${w.ok ? color.green("ok") : color.red("FAILED")}, ${plural(w.steps, "step")}, ending ${clean(w.ending ?? "none")}, ${score}`,
    );
    if (w.failedStep !== null) {
      out(
        `                step ${w.failedStep.index + 1} "${clean(w.failedStep.command)}" was ${w.failedStep.status}:`,
      );
      for (const line of w.failedStep.output.trim().split("\n").slice(0, 8)) out(`                  ${clean(line)}`);
    }
  }
  const p = report.playtime;
  if (p !== null) {
    const expected = Math.max(1, Math.round(p.minutes.expected));
    const speedrun = Math.max(1, Math.round(p.minutes.min));
    let target = "no target (set playtime)";
    if (p.target !== null && p.deviation !== null) {
      const pct = Math.round(p.deviation * 100);
      const text = `target ${p.target} min (${pct > 0 ? "+" : ""}${pct}%)`;
      const off = report.diagnostics.some((d) => d.code === "playtime.too-short" || d.code === "playtime.too-long");
      target = off ? color.yellow(text) : text;
    }
    out(
      `  playtime      ≈ ${expected} min expected, speedrun ${speedrun} min, ${target}; ${p.words.path + p.words.optional} words, ${p.wordsPerMinute} wpm, reading ${Math.round(p.readingShare * 100)}%${p.pacing === null ? "" : ` (pacing ${p.pacing})`}`,
    );
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
    for (const d of x.deadEnds.slice(0, 3))
      out(`                dead end after: ${clean(d.path.join("; ")) || "(start)"}`);
    for (const l of x.losingEndings.slice(0, 3))
      out(`                losing ending ${clean(l.ending)} after: ${clean(l.path.join("; "))}`);
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
    "allow-incomplete": { type: "boolean" },
    "no-explore": { type: "boolean" },
    wpm: { type: "string" },
    "target-minutes": { type: "string" },
    help: { type: "boolean", short: "h" },
  });
  if (flag(args, "help")) {
    out(CHECK_HELP);
    return 0;
  }
  if (args.positionals.length === 0) throw new UsageError("check needs at least one pack, packs directory or file");
  const options: ExplorationOptions = {};
  const maxStates = intOption(args, "max-states");
  if (maxStates !== undefined) options.maxStates = maxStates;
  if (flag(args, "include-drop")) options.includeDrop = true;
  if (flag(args, "allow-incomplete")) options.allowIncomplete = true;
  const playtimeOptions: PlaytimeOptions = {};
  const wpm = intOption(args, "wpm");
  if (wpm !== undefined) playtimeOptions.wordsPerMinute = wpm;
  const targetMinutes = intOption(args, "target-minutes");
  if (targetMinutes !== undefined) playtimeOptions.targetMinutes = targetMinutes;

  const reports: CheckReport[] = [];
  for (const target of expandTargets(args.positionals)) {
    const { report, baseDir } = checkTarget(target, options, playtimeOptions, flag(args, "no-explore"));
    reports.push(report);
    if (!flag(args, "json")) printReport(report, baseDir);
  }
  if (flag(args, "json")) out(JSON.stringify(reports, null, 2));
  return reports.every((r) => r.ok) ? 0 : 1;
}
