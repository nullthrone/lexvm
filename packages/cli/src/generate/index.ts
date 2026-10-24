/**
 * `lexvm generate`: staged LLM generation of a content pack.
 * Owned by the pipeline workstream; main.ts only dispatches here.
 *
 *   lexvm generate --idea "..." [--lang de] [--minutes 30] --out packs/<id>
 *                  [--model <id>] [--max-repairs 6] [--from-stage <stage>] [--max-states N]
 *
 * Exit codes: 0 = the pack passes all gates, 1 = generation or verification
 * failed, 2 = usage error (including a missing model or API key).
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_PACING, type Pacing } from "@lexvm/engine";
import { clean } from "../term.ts";
import { DEFAULT_LICENSE, DEFAULT_MINUTES, PACINGS, PACK_LANGUAGES, type PackLanguage } from "./assemble.ts";
import { loadPromptKit, type PromptKit } from "./kit.ts";
import { type CompleteFn, createAnthropicComplete, EFFORTS, type Effort, LlmError } from "./llm.ts";
import {
  DEFAULT_MAX_REPAIRS,
  generatePack,
  hasExistingOutput,
  PipelineError,
  readRunLog,
  STAGES,
  type Stage,
} from "./pipeline.ts";
import { DEFAULT_MAX_STATES, engineVerify, formatDiagnostic, type VerifyFn } from "./verify.ts";

export const MODEL_DOCS_URL = "https://platform.claude.com/docs/en/about-claude/models/overview";
export const DEFAULT_MAX_TOKENS = 64_000;

export const GENERATE_USAGE = `Usage: lexvm generate --idea "<idea>" --out packs/<id> [options]

Generates a content pack with the Anthropic API in stages (concept, story,
puzzles, world, logic), repairs it until it passes all verification gates,
then runs one editorial review round on the walkthrough transcript.

Required:
  --idea <text>          The story idea, in any language (or --idea-file <path>)
  --out <dir>            Output directory; its name is the pack id (kebab-case)

Options:
  --lang <de|en>         Pack language (default: the language of the idea)
  --minutes <n>          Target play time in minutes (default ${DEFAULT_MINUTES}); becomes the pack's playtime,
                         sizes the prompts' budget and is checked by the play time estimate
  --pacing <pacing>      ${PACINGS.join("|")} (default ${DEFAULT_PACING}): share of the time spent reading
                         (about 60/45/30%); becomes the pack's pacing and sizes the budget
  --no-review            Skip the editorial review round after the pack passes
  --model <id>           Claude model id (or set LEXVM_MODEL)
  --max-repairs <n>      Repair rounds after the first check (default ${DEFAULT_MAX_REPAIRS})
  --from-stage <stage>   Resume at concept|story|puzzles|world|logic|verify, reusing earlier artifacts
  --max-states <n>       State limit for the exploration gate (default ${DEFAULT_MAX_STATES})
  --max-tokens <n>       Output token limit per request (default ${DEFAULT_MAX_TOKENS})
  --effort <level>       Effort level: ${EFFORTS.join("|")} (default: the model's default)
  --no-thinking          Do not request adaptive thinking (for models without it)
  --author <name>        Author for pack metadata (default "LexVM contributors")
  --license <spdx>       Content license (default ${DEFAULT_LICENSE})
  --force                Overwrite an existing pack directory when starting from scratch

Environment:
  ANTHROPIC_API_KEY      API key (required; never printed)
  LEXVM_MODEL            Model id, used when --model is not given
`;

export interface GenerateCliDeps {
  env?: Record<string, string | undefined>;
  /** Progress and error output (stderr by default). */
  log?: (line: string) => void;
  /** Inject a fake LLM (tests). When set, no API key is needed. */
  complete?: CompleteFn;
  /** Inject a fake verifier (tests). */
  verify?: VerifyFn;
  kit?: PromptKit;
  cwd?: string;
  now?: () => Date;
}

class UsageError extends Error {}

function int(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new UsageError(`--${name} must be a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`--${name} must be between ${min} and ${max}`);
  return n;
}

export function parseLang(value: string | undefined): PackLanguage | null {
  if (value === undefined) return null;
  if (!(PACK_LANGUAGES as readonly string[]).includes(value)) {
    throw new UsageError(`--lang must be one of: ${PACK_LANGUAGES.join(", ")}`);
  }
  return value as PackLanguage;
}

export async function runGenerate(argv: string[], deps: GenerateCliDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  // Generated text is untrusted: no control characters reach the terminal.
  const log = deps.log ?? ((line: string) => process.stderr.write(`${clean(line)}\n`));
  const cwd = deps.cwd ?? process.cwd();

  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (err) {
    log(`lexvm generate: ${err instanceof Error ? err.message : String(err)}\n\n${GENERATE_USAGE}`);
    return 2;
  }
  if (values.help) {
    log(GENERATE_USAGE);
    return 0;
  }

  try {
    if (!values.out) throw new UsageError("--out <dir> is required (e.g. --out packs/my-adventure)");
    const outDir = resolve(cwd, values.out);
    const packId = basename(outDir);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(packId)) {
      throw new UsageError(`the output directory name '${packId}' is the pack id and must be kebab-case`);
    }
    const fromStageRaw = values["from-stage"] === "repair" ? "verify" : (values["from-stage"] ?? "concept");
    if (!(STAGES as readonly string[]).includes(fromStageRaw)) {
      throw new UsageError(`--from-stage must be one of: ${STAGES.join(", ")}`);
    }
    const fromStage = fromStageRaw as Stage;
    if (values.effort !== undefined && !(EFFORTS as readonly string[]).includes(values.effort)) {
      throw new UsageError(`--effort must be one of: ${EFFORTS.join(", ")}`);
    }

    let idea = values.idea ?? "";
    if (values["idea-file"]) idea = await readFile(resolve(cwd, values["idea-file"]), "utf8");
    const previous = fromStage === "concept" ? null : await readRunLog(outDir);
    if (idea.trim() === "" && previous) idea = previous.params.idea;
    if (idea.trim() === "" && (fromStage === "concept" || fromStage === "puzzles")) {
      throw new UsageError("--idea <text> (or --idea-file <path>) is required");
    }
    const lang = values.lang !== undefined ? parseLang(values.lang) : (previous?.params.lang ?? null);
    const minutes = int(values.minutes, "minutes", previous?.params.minutes ?? DEFAULT_MINUTES, 5, 240);
    if (values.pacing !== undefined && !(PACINGS as readonly string[]).includes(values.pacing)) {
      throw new UsageError(`--pacing must be one of: ${PACINGS.join(", ")}`);
    }
    const pacing = (values.pacing as Pacing | undefined) ?? previous?.params.pacing ?? DEFAULT_PACING;
    const review = values["no-review"] ? false : (previous?.params.review ?? true);
    const maxRepairs = int(values["max-repairs"], "max-repairs", DEFAULT_MAX_REPAIRS, 0, 50);
    const maxStates = int(values["max-states"], "max-states", DEFAULT_MAX_STATES, 100, 50_000_000);
    const maxTokens = int(values["max-tokens"], "max-tokens", DEFAULT_MAX_TOKENS, 1024, 1_000_000);
    const author = values.author ?? previous?.params.author ?? "LexVM contributors";
    const license = values.license ?? previous?.params.license ?? DEFAULT_LICENSE;

    if (fromStage === "concept" && !values.force && (await hasExistingOutput(outDir))) {
      throw new UsageError(
        `${values.out} already contains a generated pack. Use --from-stage <stage> to resume, or --force to start over.`,
      );
    }

    let complete = deps.complete;
    if (!complete) {
      const model = (values.model ?? env.LEXVM_MODEL ?? "").trim();
      if (model === "") {
        log(
          "lexvm generate: no model given. Pass --model <id> or set LEXVM_MODEL to a current Claude model id " +
            `(see Anthropic's model documentation: ${MODEL_DOCS_URL}).`,
        );
        return 2;
      }
      const apiKey = env.ANTHROPIC_API_KEY ?? "";
      if (apiKey.trim() === "") {
        log("lexvm generate: ANTHROPIC_API_KEY is not set. Create an API key in the Anthropic Console and export it.");
        return 2;
      }
      complete = createAnthropicComplete({
        apiKey,
        model,
        maxTokens,
        thinking: !values["no-thinking"],
        effort: values.effort as Effort | undefined,
        log,
      });
    }

    const kit = deps.kit ?? (await loadPromptKit());
    log(
      `lexvm generate: ${values.out} (language: ${lang ?? "from the idea"}, about ${minutes} min, pacing ${pacing}, from stage ${fromStage})`,
    );
    const result = await generatePack(
      { idea, lang, minutes, pacing, review, outDir, packId, author, license, maxRepairs, maxStates, fromStage },
      { kit, complete, verify: deps.verify ?? engineVerify, log, ...(deps.now ? { now: deps.now } : {}) },
    );
    if (result.ok) {
      log(
        `OK: ${values.out} passes all gates after ${result.repairs} repair round(s); ${result.warnings} warning(s) remain. ` +
          `Review it with: npm run lexvm -- check ${values.out}`,
      );
      return 0;
    }
    log(
      `FAILED: ${values.out} still has ${result.errors} error(s) after ${result.repairs} repair round(s). ` +
        `Continue with --from-stage verify (and a higher --max-repairs), or fix the files by hand.`,
    );
    for (const d of result.diagnostics.filter((x) => x.severity === "error").slice(0, 10)) {
      log(`  ${formatDiagnostic(d)}`);
    }
    return 1;
  } catch (err) {
    if (err instanceof UsageError) {
      log(`lexvm generate: ${err.message}`);
      return 2;
    }
    if (err instanceof PipelineError || err instanceof LlmError) {
      log(`lexvm generate: ${err.message}`);
      return 1;
    }
    log(`lexvm generate: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return 1;
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      idea: { type: "string" },
      "idea-file": { type: "string" },
      lang: { type: "string" },
      minutes: { type: "string" },
      pacing: { type: "string" },
      "no-review": { type: "boolean" },
      out: { type: "string" },
      model: { type: "string" },
      "max-repairs": { type: "string" },
      "from-stage": { type: "string" },
      "max-states": { type: "string" },
      "max-tokens": { type: "string" },
      effort: { type: "string" },
      "no-thinking": { type: "boolean" },
      author: { type: "string" },
      license: { type: "string" },
      force: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
}
