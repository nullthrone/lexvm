/**
 * Verification gates of the generation pipeline, run in-process with the
 * engine API: compile (schema + semantics), walkthrough replay, state-space
 * exploration. Gates run in order and stop at the first gate with errors, so
 * a repair round focuses on the earliest problems (as `lexvm check` does).
 */
import { analyze, compile, type Diagnostic, explore, runWalkthrough, type SourceFile } from "@lexvm/engine";

export const GATES = ["compile", "walkthrough", "exploration"] as const;
export type Gate = (typeof GATES)[number];

export interface GateResult {
  gate: Gate;
  /** "skipped" when an earlier gate had errors. */
  status: "passed" | "failed" | "skipped";
  errors: number;
  warnings: number;
}

export interface VerifyReport {
  /** True when no gate reported an error. */
  ok: boolean;
  diagnostics: Diagnostic[];
  gates: GateResult[];
}

export interface VerifyOptions {
  maxStates: number;
}

export type VerifyFn = (files: SourceFile[], options: VerifyOptions) => VerifyReport | Promise<VerifyReport>;

export const DEFAULT_MAX_STATES = 200_000;

function count(diags: Diagnostic[], severity: Diagnostic["severity"]): number {
  return diags.filter((d) => d.severity === severity).length;
}

function gateResult(gate: Gate, diags: Diagnostic[]): GateResult {
  const errors = count(diags, "error");
  return { gate, status: errors > 0 ? "failed" : "passed", errors, warnings: count(diags, "warning") };
}

function crash(gate: Gate, err: unknown): Diagnostic {
  const message = err instanceof Error ? err.message : String(err);
  return {
    severity: "error",
    code: `verify.${gate}-crashed`,
    path: "",
    message: `The ${gate} check crashed: ${message}. This is probably an engine bug; simplify the construct the message points at.`,
  };
}

function dedupe(diags: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diags.filter((d) => {
    const key = `${d.severity}|${d.code}|${d.path}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The default verifier, backed by the engine. */
export const engineVerify: VerifyFn = (files, options) => {
  const gates: GateResult[] = [];
  const all: Diagnostic[] = [];
  const skip = (from: number) => {
    for (const gate of GATES.slice(from)) gates.push({ gate, status: "skipped", errors: 0, warnings: 0 });
  };

  // Gate 1: compile (schema + semantics). analyze() is run as well in case
  // compile() leaves semantic checks to it; duplicates are removed.
  let diags: Diagnostic[];
  let pack: ReturnType<typeof compile>["pack"] = null;
  try {
    const result = compile(files);
    pack = result.pack;
    diags = [...result.diagnostics];
    if (pack !== null) diags.push(...analyze(pack));
  } catch (err) {
    diags = [crash("compile", err)];
    pack = null;
  }
  diags = dedupe(diags);
  all.push(...diags);
  gates.push(gateResult("compile", diags));
  if (pack === null || count(diags, "error") > 0) {
    if (pack === null && count(diags, "error") === 0) {
      const d: Diagnostic = {
        severity: "error",
        code: "verify.no-pack",
        path: "",
        message: "The files did not compile to a pack, but no error was reported.",
      };
      all.push(d);
      gates[0] = gateResult("compile", [...diags, d]);
    }
    skip(1);
    return { ok: false, diagnostics: all, gates };
  }

  // Gate 2: walkthrough replay.
  try {
    const report = runWalkthrough(pack);
    diags = [...report.diagnostics];
    if (!report.ok && count(diags, "error") === 0) {
      const last = report.steps.at(-1);
      diags.push({
        severity: "error",
        code: "walkthrough.not-won",
        path: "walkthrough",
        message: `Replaying the walkthrough did not end in a winning ending${
          last ? ` (last command: '${last.command}', ${last.status})` : ""
        }. Make the last command trigger a winning ending.`,
      });
    }
  } catch (err) {
    diags = [crash("walkthrough", err)];
  }
  all.push(...diags);
  gates.push(gateResult("walkthrough", diags));
  if (count(diags, "error") > 0) {
    skip(2);
    return { ok: false, diagnostics: all, gates };
  }

  // Gate 3: exploration (no dead ends, no losing endings, winnable).
  try {
    const report = explore(pack, { maxStates: options.maxStates });
    diags = [...report.diagnostics];
    if (count(diags, "error") === 0) {
      if (!report.winnable) {
        diags.push({
          severity: "error",
          code: "explore.unwinnable",
          path: "endings",
          message: "No winning ending is reachable from the start.",
        });
      }
      const dead = report.deadEnds[0];
      if (dead) {
        diags.push({
          severity: "error",
          code: "explore.dead-end",
          path: "",
          message: `${report.deadEnds.length} reachable state(s) can no longer be won. Example path: ${dead.path.join(", ")}.`,
        });
      }
      const losing = report.losingEndings[0];
      if (losing) {
        diags.push({
          severity: "error",
          code: "explore.losing-ending",
          path: `endings.${losing.ending}`,
          message: `Losing ending '${losing.ending}' is reachable via: ${losing.path.join(", ")}. Every ending must be a win.`,
        });
      }
    }
  } catch (err) {
    diags = [crash("exploration", err)];
  }
  all.push(...diags);
  gates.push(gateResult("exploration", diags));
  return { ok: count(all, "error") === 0, diagnostics: all, gates };
};

// ---------------------------------------------------------------------------
// Diagnostics for prompts and logs
// ---------------------------------------------------------------------------

/** Lower rank = more important. Unknown warning codes sit in the middle. */
function warningRank(code: string): number {
  if (/^explore\./.test(code)) return 0; // incomplete exploration, unreached content
  if (/^walkthrough\./.test(code)) return 1;
  if (/shadow|unreach|unused|unreferenced|score/i.test(code)) return 2;
  if (/^(ref|semantic|dialogue|rule|exit|hint)/.test(code)) return 3;
  if (/text|length|budget|style/i.test(code)) return 5;
  return 4;
}

/**
 * Select and order diagnostics for a repair prompt: all errors first (in
 * report order, capped), then the most important warnings.
 */
export function selectDiagnostics(diags: Diagnostic[], maxErrors = 40, maxWarnings = 20): Diagnostic[] {
  const errors = diags.filter((d) => d.severity === "error").slice(0, maxErrors);
  const warnings = diags
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.severity === "warning")
    .sort((a, b) => warningRank(a.d.code) - warningRank(b.d.code) || a.i - b.i)
    .slice(0, maxWarnings)
    .map(({ d }) => d);
  return [...errors, ...warnings];
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = [d.path ? `@ ${d.path}` : "", d.file ? `(${d.file}${d.line ? `:${d.line}` : ""})` : ""]
    .filter(Boolean)
    .join(" ");
  return `[${d.severity}] ${d.code}${where ? ` ${where}` : ""}: ${d.message}`;
}

/** Diagnostics text for the repair prompt, with a note about omitted entries. */
export function formatDiagnosticsForPrompt(diags: Diagnostic[]): string {
  const selected = selectDiagnostics(diags);
  const lines = selected.map(formatDiagnostic);
  const omitted = diags.filter((d) => d.severity !== "info").length - selected.length;
  if (omitted > 0) lines.push(`(${omitted} further diagnostic(s) omitted; fix the ones above first.)`);
  return lines.join("\n");
}

export function countSeverities(diags: Diagnostic[]): { errors: number; warnings: number; infos: number } {
  return { errors: count(diags, "error"), warnings: count(diags, "warning"), infos: count(diags, "info") };
}
