/**
 * The staged generation pipeline behind `lexvm generate`:
 *
 *   concept -> puzzles -> world -> logic -> verify/repair loop
 *
 * Every stage's prompt includes the outputs of the previous stages, every
 * artifact is written to the output directory as soon as it exists, and
 * design/run.json records what happened (stages, timestamps, token usage,
 * diagnostics counts; never credentials or model ids). A run can therefore be
 * resumed from any stage and reviewed in a pull request.
 *
 * The LLM and the verifier are injected (`CompleteFn`, `VerifyFn`), so the
 * whole flow is testable without network access or a finished engine.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { Diagnostic, SourceFile } from "@lexvm/engine";
import {
  buildStagePrompt,
  buildSystemPrompt,
  type NamedText,
  type PackLanguage,
  type PromptInputs,
} from "./assemble.ts";
import { checkFileName, type FileExtension, parseFencedFiles } from "./fenced.ts";
import type { PromptKit } from "./kit.ts";
import type { CompleteFn, CompletionResult, TokenUsage } from "./llm.ts";
import {
  countSeverities,
  formatDiagnostic,
  formatDiagnosticsForPrompt,
  type GateResult,
  type VerifyFn,
} from "./verify.ts";

export const STAGES = ["concept", "puzzles", "world", "logic", "verify"] as const;
export type Stage = (typeof STAGES)[number];

export const DESIGN_DIR = "design";
export const RUN_LOG = "run.json";
export const DEFAULT_MAX_REPAIRS = 6;

/** Files each file-producing stage is asked for. */
export const STAGE_FILES = {
  world: ["pack.yaml", "rooms.yaml", "objects.yaml"],
  logic: ["rules.yaml", "dialogues.yaml", "solution.yaml"],
} as const;

export interface GenerateParams {
  /** The user's idea. May be empty when resuming at a stage that does not need it. */
  idea: string;
  lang: PackLanguage | null;
  minutes: number;
  /** Output directory (packs/<id>). */
  outDir: string;
  packId: string;
  author: string | null;
  license: string;
  maxRepairs: number;
  maxStates: number;
  fromStage: Stage;
}

export interface PipelineDeps {
  kit: PromptKit;
  complete: CompleteFn;
  verify: VerifyFn;
  /** Progress output (stderr). */
  log: (line: string) => void;
  now?: () => Date;
}

export interface GenerateResult {
  ok: boolean;
  repairs: number;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
}

/** A pipeline failure that is not a verification failure (bad model output, missing artifacts). */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

// ---------------------------------------------------------------------------
// Run log
// ---------------------------------------------------------------------------

export interface RunEvent {
  stage: Exclude<Stage, "verify"> | "verify" | "repair";
  round?: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  usage?: TokenUsage;
  stopReason?: string | null;
  /** Artifacts written, relative to the output directory. */
  files?: string[];
  diagnostics?: { errors: number; warnings: number; infos: number };
  gates?: GateResult[];
  notes?: string[];
}

export interface RunLog {
  format: "lexvm-generate-run/1";
  pack: string;
  params: {
    idea: string;
    lang: PackLanguage | null;
    minutes: number;
    author: string | null;
    license: string;
    maxRepairs: number;
    maxStates: number;
  };
  runs: Array<{
    startedAt: string;
    fromStage: Stage;
    finishedAt?: string;
    result?: { ok: boolean; repairs: number; errors: number; warnings: number; failure?: string };
  }>;
  events: RunEvent[];
  totals: TokenUsage;
}

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
}

export async function readRunLog(outDir: string): Promise<RunLog | null> {
  try {
    const parsed = JSON.parse(await readFile(join(outDir, DESIGN_DIR, RUN_LOG), "utf8")) as RunLog;
    return parsed.format === "lexvm-generate-run/1" ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** The pack's YAML files in compiler order: pack.yaml first, then by name. */
export async function readPackFiles(outDir: string): Promise<SourceFile[]> {
  let names: string[];
  try {
    names = (await readdir(outDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
      .map((e) => e.name);
  } catch {
    return [];
  }
  names.sort((a, b) => (a === "pack.yaml" ? -1 : b === "pack.yaml" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(join(outDir, name), "utf8") })));
}

/**
 * Write a model-produced artifact. `.md` files go to design/, `.yaml` files to
 * the pack directory. The name is re-checked and the resolved path must stay
 * inside the output directory.
 */
export async function writeArtifact(outDir: string, name: string, content: string): Promise<string> {
  const problem = checkFileName(name);
  if (problem !== null) throw new PipelineError(`refusing to write '${name}': ${problem}`);
  const root = resolve(outDir);
  const dest = resolve(root, name.endsWith(".md") ? DESIGN_DIR : ".", name);
  if (!dest.startsWith(root + sep)) throw new PipelineError(`refusing to write outside ${root}: ${name}`);
  await mkdir(resolve(dest, ".."), { recursive: true });
  await writeFile(dest, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return relative(root, dest).split(sep).join("/");
}

/** Extract a design document from a response: a named block, a single wrapping block, or the text itself. */
export function extractDocument(text: string, name: string): string {
  const parsed = parseFencedFiles(text, { allowed: ["md"] });
  const named = parsed.files.find((f) => f.name === name);
  if (named) return named.content.trim();
  const trimmed = text.trim();
  const wrapped = /^(`{3,}|~{3,})[ \t]*(?:markdown|md)?[^\n]*\n([\s\S]*?)\n\1[ \t]*$/.exec(trimmed);
  if (wrapped) return wrapped[2]!.trim();
  return trimmed;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function addUsage(total: TokenUsage, u: TokenUsage | undefined): void {
  if (!u) return;
  total.inputTokens += u.inputTokens;
  total.outputTokens += u.outputTokens;
  total.cacheReadInputTokens += u.cacheReadInputTokens;
  total.cacheCreationInputTokens += u.cacheCreationInputTokens;
}

export async function generatePack(params: GenerateParams, deps: PipelineDeps): Promise<GenerateResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log;
  const outDir = resolve(params.outDir);
  const designDir = join(outDir, DESIGN_DIR);
  await mkdir(designDir, { recursive: true });

  const previous = params.fromStage === "concept" ? null : await readRunLog(outDir);
  const runLog: RunLog = previous ?? {
    format: "lexvm-generate-run/1",
    pack: params.packId,
    params: {
      idea: params.idea,
      lang: params.lang,
      minutes: params.minutes,
      author: params.author,
      license: params.license,
      maxRepairs: params.maxRepairs,
      maxStates: params.maxStates,
    },
    runs: [],
    events: [],
    totals: emptyUsage(),
  };
  if (previous) {
    // The caller resolves resumed parameters (CLI flags first, then the previous run.json).
    runLog.params = {
      idea: params.idea || runLog.params.idea,
      lang: params.lang,
      minutes: params.minutes,
      author: params.author,
      license: params.license,
      maxRepairs: params.maxRepairs,
      maxStates: params.maxStates,
    };
  }
  const run: RunLog["runs"][number] = { startedAt: now().toISOString(), fromStage: params.fromStage };
  runLog.runs.push(run);
  const saveLog = async () => {
    runLog.totals = emptyUsage();
    for (const e of runLog.events) addUsage(runLog.totals, e.usage);
    await writeFile(join(designDir, RUN_LOG), `${JSON.stringify(runLog, null, 2)}\n`, "utf8");
  };
  await saveLog();

  const system = buildSystemPrompt(deps.kit);
  const inputs = (): PromptInputs => ({
    lang: params.lang,
    idea: params.idea,
    minutes: params.minutes,
    packId: params.packId,
    author: params.author,
    license: params.license,
    pipeline: true,
  });
  const readDoc = async (name: string) => readOptional(join(designDir, name));
  const requireDoc = async (name: string, stage: Stage) => {
    const doc = await readDoc(name);
    if (doc === null) {
      throw new PipelineError(
        `stage '${stage}' needs ${DESIGN_DIR}/${name}; run an earlier stage first (--from-stage)`,
      );
    }
    return doc;
  };
  const asNamed = (files: SourceFile[]): NamedText[] => files.map((f) => ({ name: f.name, content: f.text }));

  /** One LLM call with timing, progress and logging. */
  const call = async (
    stage: RunEvent["stage"],
    prompt: string,
    label: string,
  ): Promise<{ result: CompletionResult; event: RunEvent }> => {
    log(label);
    const started = now();
    let nextMark = 10_000;
    const result = await deps.complete(prompt, {
      stage,
      system,
      onProgress: (chars) => {
        if (chars >= nextMark) {
          log(`      … ${Math.floor(chars / 1000)}k characters received`);
          while (nextMark <= chars) nextMark += 10_000;
        }
      },
    });
    const finished = now();
    const event: RunEvent = {
      stage,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      ...(result.usage ? { usage: result.usage } : {}),
      stopReason: result.stopReason ?? null,
    };
    const usage = result.usage
      ? ` · ${fmtTokens(result.usage.inputTokens + result.usage.cacheReadInputTokens + result.usage.cacheCreationInputTokens)} in / ${fmtTokens(result.usage.outputTokens)} out tokens`
      : "";
    log(`      done in ${Math.round(event.durationMs / 1000)} s${usage}`);
    if (result.stopReason === "max_tokens") {
      log("      warning: the answer was cut off at the output token limit; consider a higher --max-tokens");
      event.notes = [...(event.notes ?? []), "output truncated at max_tokens"];
    }
    return { result, event };
  };

  /** A stage whose answer is a Markdown document. */
  const documentStage = async (stage: "concept" | "puzzles", label: string, prompt: string, name: string) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryNote =
        attempt === 0 ? "" : "\n\nYour previous answer was empty. Answer with the complete Markdown document.\n";
      const { result, event } = await call(stage, prompt + retryNote, attempt === 0 ? label : `${label} (retry)`);
      const doc = extractDocument(result.text, name);
      if (doc !== "") {
        event.files = [await writeArtifact(outDir, name, `${doc}\n`)];
        runLog.events.push(event);
        await saveLog();
        log(`      wrote ${event.files.join(", ")}`);
        return;
      }
      event.notes = [...(event.notes ?? []), "empty answer"];
      runLog.events.push(event);
      await saveLog();
    }
    throw new PipelineError(`stage '${stage}' produced no document`);
  };

  /** A stage (or repair round) whose answer is a set of fenced files. Returns the written names. */
  const filesStage = async (
    stage: RunEvent["stage"],
    label: string,
    prompt: string,
    options: {
      expected: readonly string[];
      allowed: readonly FileExtension[];
      required: boolean;
      round?: number;
      /** Remove all existing pack files before writing the new ones (the world stage starts the pack afresh). */
      replaceAll?: boolean;
    },
  ): Promise<string[]> => {
    for (let attempt = 0; attempt < (options.required ? 2 : 1); attempt++) {
      const retryNote =
        attempt === 0
          ? ""
          : "\n\nYour previous answer contained no usable file blocks. Answer again with the complete files, each in its own fenced code block whose info string is `yaml file=<name>`.\n";
      const { result, event } = await call(stage, prompt + retryNote, attempt === 0 ? label : `${label} (retry)`);
      if (options.round !== undefined) event.round = options.round;
      const parsed = parseFencedFiles(result.text, { allowed: options.allowed });
      const notes = parsed.issues.map((i) => `${i.severity}: line ${i.line}: ${i.message}`);
      if (parsed.unnamed.length > 0) notes.push(`ignored ${parsed.unnamed.length} code block(s) without a file name`);
      for (const n of notes) log(`      ${n}`);
      if (options.replaceAll && parsed.files.length > 0) {
        const stale = await readPackFiles(outDir);
        for (const f of stale) await rm(join(outDir, f.name));
        if (stale.length > 0) log(`      replaced previous pack files: ${stale.map((f) => f.name).join(", ")}`);
      }
      const written: string[] = [];
      for (const f of parsed.files) written.push(await writeArtifact(outDir, f.name, f.content));
      const missing = options.expected.filter((e) => !parsed.files.some((f) => f.name === e));
      if (written.length > 0 && missing.length > 0) {
        const note = `missing expected file(s): ${missing.join(", ")}`;
        log(`      warning: ${note}`);
        notes.push(note);
      }
      event.files = written;
      if (notes.length > 0) event.notes = [...(event.notes ?? []), ...notes];
      runLog.events.push(event);
      await saveLog();
      if (written.length > 0) {
        log(`      wrote ${written.join(", ")}`);
        return written;
      }
    }
    if (options.required) throw new PipelineError(`stage '${stage}' produced no files`);
    log("      warning: the answer contained no files; nothing changed");
    return [];
  };

  const startIndex = STAGES.indexOf(params.fromStage);
  const total = STAGES.length;
  const tag = (stage: Stage) => `[${STAGES.indexOf(stage) + 1}/${total}] ${stage}`;
  const runs = (stage: Stage) => STAGES.indexOf(stage) >= startIndex;

  try {
    if (runs("concept")) {
      await documentStage(
        "concept",
        `${tag("concept")} …`,
        buildStagePrompt(deps.kit, "concept", inputs()),
        "concept.md",
      );
    }
    if (runs("puzzles")) {
      const concept = await requireDoc("concept.md", "puzzles");
      const prompt = buildStagePrompt(deps.kit, "puzzles", { ...inputs(), concept });
      await documentStage("puzzles", `${tag("puzzles")} …`, prompt, "puzzles.md");
    }
    if (runs("world")) {
      const concept = await requireDoc("concept.md", "world");
      const puzzles = await requireDoc("puzzles.md", "world");
      const prompt = buildStagePrompt(deps.kit, "world", { ...inputs(), concept, puzzles });
      await filesStage("world", `${tag("world")} …`, prompt, {
        expected: STAGE_FILES.world,
        allowed: ["yaml"],
        required: true,
        replaceAll: true,
      });
    }
    if (runs("logic")) {
      const concept = await requireDoc("concept.md", "logic");
      const puzzles = await requireDoc("puzzles.md", "logic");
      const files = await readPackFiles(outDir);
      if (!files.some((f) => f.name === "pack.yaml")) {
        throw new PipelineError("stage 'logic' needs pack.yaml; run the world stage first (--from-stage world)");
      }
      const prompt = buildStagePrompt(deps.kit, "logic", { ...inputs(), concept, puzzles, files: asNamed(files) });
      await filesStage("logic", `${tag("logic")} …`, prompt, {
        expected: STAGE_FILES.logic,
        allowed: ["yaml"],
        required: true,
      });
    }

    // Verify / repair loop.
    log(`${tag("verify")} (up to ${params.maxRepairs} repair round(s))`);
    if ((await readPackFiles(outDir)).length === 0) {
      throw new PipelineError(`no pack files in ${outDir}; run an earlier stage first (--from-stage world)`);
    }
    const concept = await readDoc("concept.md");
    const puzzles = await readDoc("puzzles.md");
    let round = 0;
    let lastCrash = "";
    for (;;) {
      const files = await readPackFiles(outDir);
      const started = now();
      const report = await deps.verify(files, { maxStates: params.maxStates });
      const finished = now();
      const counts = countSeverities(report.diagnostics);
      runLog.events.push({
        stage: "verify",
        round,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: finished.getTime() - started.getTime(),
        diagnostics: counts,
        gates: report.gates,
      });
      await saveLog();
      const gateSummary = report.gates.map((g) => `${g.gate} ${g.status}`).join(", ");
      log(`      check ${round}: ${counts.errors} error(s), ${counts.warnings} warning(s) — ${gateSummary}`);

      if (report.ok) {
        const result = { ok: true, repairs: round, diagnostics: report.diagnostics, ...pick(counts) };
        run.finishedAt = now().toISOString();
        run.result = { ok: true, repairs: round, ...pick(counts) };
        await saveLog();
        return result;
      }
      for (const d of report.diagnostics.filter((x) => x.severity === "error").slice(0, 5)) {
        log(`        ${formatDiagnostic(d)}`);
      }
      // A verifier that crashes the same way twice will not be fixed by another repair round.
      const crash = report.diagnostics
        .filter((d) => /^verify\..*-crashed$/.test(d.code))
        .map((d) => d.message)
        .join("\n");
      if (crash !== "" && crash === lastCrash) {
        throw new PipelineError(`the verifier crashed twice with the same error; stopping. ${crash}`);
      }
      lastCrash = crash;
      if (round >= params.maxRepairs) {
        run.finishedAt = now().toISOString();
        run.result = {
          ok: false,
          repairs: round,
          ...pick(counts),
          failure: "errors remain after the last repair round",
        };
        await saveLog();
        return { ok: false, repairs: round, diagnostics: report.diagnostics, ...pick(counts) };
      }
      round++;
      const prompt = buildStagePrompt(deps.kit, "repair", {
        ...inputs(),
        concept,
        puzzles,
        files: asNamed(files),
        diagnostics: formatDiagnosticsForPrompt(report.diagnostics),
      });
      await filesStage("repair", `      repair ${round}/${params.maxRepairs} …`, prompt, {
        expected: [],
        allowed: ["yaml"],
        required: false,
        round,
      });
    }
  } catch (err) {
    run.finishedAt = now().toISOString();
    run.result = {
      ok: false,
      repairs: 0,
      errors: 0,
      warnings: 0,
      failure: err instanceof Error ? err.message : String(err),
    };
    await saveLog();
    throw err;
  }
}

function pick(c: { errors: number; warnings: number }): { errors: number; warnings: number } {
  return { errors: c.errors, warnings: c.warnings };
}

/** True if the directory already holds generated output (used to refuse accidental overwrites). */
export async function hasExistingOutput(outDir: string): Promise<boolean> {
  return (
    (await exists(join(outDir, "pack.yaml"))) ||
    (await exists(join(outDir, DESIGN_DIR, RUN_LOG))) ||
    (await exists(join(outDir, DESIGN_DIR, "concept.md")))
  );
}
