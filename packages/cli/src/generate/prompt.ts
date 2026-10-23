/**
 * `lexvm prompt`: assemble the prompt kit (spec + guide + example) for
 * copy-paste use with any LLM. Owned by the pipeline workstream.
 *
 *   lexvm prompt [--stage oneshot|concept|puzzles|world|logic|repair] [--lang de|en]
 *                [--idea "..."] [--minutes 30] [--pack <dir|file>] [--diagnostics <file>] [--out <file>]
 *
 * `npm run prompts` runs `--stage oneshot --out prompts/oneshot.md`, the
 * generic prompt bundled by the web app.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  assemblePrompt,
  DEFAULT_MINUTES,
  type NamedText,
  PACK_LANGUAGES,
  type PackLanguage,
  PROMPT_STAGES,
  type PromptInputs,
  type PromptStage,
} from "./assemble.ts";
import { loadPromptKit, type PromptKit } from "./kit.ts";
import { DESIGN_DIR, readPackFiles } from "./pipeline.ts";
import { DEFAULT_MAX_STATES, engineVerify, formatDiagnosticsForPrompt, type VerifyFn } from "./verify.ts";

export const PROMPT_USAGE = `Usage: lexvm prompt [options]

Assembles a self-contained prompt for any chat LLM from the prompt kit
(prompts/templates, the format spec, the authoring guide and the example pack).

Options:
  --stage <stage>        ${PROMPT_STAGES.join("|")} (default oneshot)
  --lang <de|en>         Pack language (default: the language of the idea)
  --idea <text>          The story idea (or --idea-file <path>); omitted = generic prompt
  --minutes <n>          Target play time in minutes (default ${DEFAULT_MINUTES}); sizes the budget in the prompt
  --pack <dir|file>      Existing pack directory or YAML file to include (later stages, repair)
  --diagnostics <file>   Diagnostics to include in a repair prompt (default: run the checks on --pack)
  --out <file>           Write to a file instead of stdout
`;

export interface PromptCliDeps {
  stdout?: (text: string) => void;
  log?: (line: string) => void;
  kit?: PromptKit;
  verify?: VerifyFn;
  cwd?: string;
}

class UsageError extends Error {}

interface PackInputs {
  concept: string | null;
  puzzles: string | null;
  files: NamedText[];
  language: string | null;
}

async function readPack(path: string): Promise<PackInputs> {
  const info = await stat(path);
  if (info.isDirectory()) {
    const read = async (name: string) => {
      try {
        return await readFile(join(path, DESIGN_DIR, name), "utf8");
      } catch {
        return null;
      }
    };
    const files = (await readPackFiles(path)).map((f) => ({ name: f.name, content: f.text }));
    if (files.length === 0 && (await readdir(path)).length === 0) throw new UsageError(`${path} is empty`);
    const pack = files.find((f) => f.name === "pack.yaml");
    return {
      concept: await read("concept.md"),
      puzzles: await read("puzzles.md"),
      files,
      language: pack ? languageOf(pack.content) : null,
    };
  }
  const content = await readFile(path, "utf8");
  return { concept: null, puzzles: null, files: [{ name: basename(path), content }], language: languageOf(content) };
}

function languageOf(yaml: string): string | null {
  return /^language:\s*["']?([a-z]{2,3})\b/m.exec(yaml)?.[1] ?? null;
}

export async function runPrompt(argv: string[], deps: PromptCliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const cwd = deps.cwd ?? process.cwd();

  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (err) {
    log(`lexvm prompt: ${err instanceof Error ? err.message : String(err)}\n\n${PROMPT_USAGE}`);
    return 2;
  }
  if (values.help) {
    log(PROMPT_USAGE);
    return 0;
  }

  try {
    const stage = (values.stage ?? "oneshot") as PromptStage;
    if (!(PROMPT_STAGES as readonly string[]).includes(stage)) {
      throw new UsageError(`--stage must be one of: ${PROMPT_STAGES.join(", ")}`);
    }
    if (values.lang !== undefined && !(PACK_LANGUAGES as readonly string[]).includes(values.lang)) {
      throw new UsageError(`--lang must be one of: ${PACK_LANGUAGES.join(", ")}`);
    }
    let minutes = DEFAULT_MINUTES;
    if (values.minutes !== undefined) {
      if (!/^\d+$/.test(values.minutes) || Number(values.minutes) < 5 || Number(values.minutes) > 240) {
        throw new UsageError("--minutes must be a whole number between 5 and 240");
      }
      minutes = Number(values.minutes);
    }
    let idea: string | null = values.idea ?? null;
    if (values["idea-file"]) idea = await readFile(resolve(cwd, values["idea-file"]), "utf8");

    const inputs: PromptInputs = { lang: (values.lang as PackLanguage | undefined) ?? null, idea, minutes };
    if (values.pack) {
      const packPath = resolve(cwd, values.pack);
      const pack = await readPack(packPath);
      inputs.concept = pack.concept;
      inputs.puzzles = pack.puzzles;
      inputs.files = pack.files;
      if (inputs.lang === null && (pack.language === "de" || pack.language === "en")) inputs.lang = pack.language;
      const dirName = basename(packPath);
      if ((await stat(packPath)).isDirectory() && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(dirName)) inputs.packId = dirName;
    }
    if (values.diagnostics) {
      inputs.diagnostics = await readFile(resolve(cwd, values.diagnostics), "utf8");
    } else if (stage === "repair" && inputs.files && inputs.files.length > 0) {
      const verify = deps.verify ?? engineVerify;
      const report = await verify(
        inputs.files.map((f) => ({ name: f.name, text: f.content })),
        { maxStates: DEFAULT_MAX_STATES },
      );
      if (report.diagnostics.some((d) => /-crashed$/.test(d.code))) {
        log("lexvm prompt: could not run the checks; paste the diagnostics into the prompt by hand.");
      } else if (report.diagnostics.length === 0) {
        log("lexvm prompt: the pack has no diagnostics; nothing to repair.");
      } else {
        inputs.diagnostics = formatDiagnosticsForPrompt(report.diagnostics);
      }
    }

    const kit = deps.kit ?? (await loadPromptKit());
    const text = assemblePrompt(kit, stage, inputs);
    if (values.out) {
      const outPath = resolve(cwd, values.out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, text, "utf8");
      log(`lexvm prompt: wrote ${values.out} (${stage}, ${text.length} characters)`);
    } else {
      stdout(text);
    }
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      log(`lexvm prompt: ${err.message}`);
      return 2;
    }
    log(`lexvm prompt: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      stage: { type: "string" },
      lang: { type: "string" },
      idea: { type: "string" },
      "idea-file": { type: "string" },
      minutes: { type: "string" },
      pack: { type: "string" },
      diagnostics: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}
