/**
 * Prompt assembly: turns the prompt kit plus run inputs into the text sent to
 * an LLM. Used by `lexvm prompt` (copy-paste prompts for any LLM) and by
 * `lexvm generate` (staged API pipeline), so both always use the same words.
 */
import { budgetForMinutes, PLAYTIME_DEFAULTS, type PlaytimeBudget } from "@lexvm/engine";
import { fenceFile } from "./fenced.ts";
import { type PromptKit, renderTemplate } from "./kit.ts";

export const PROMPT_STAGES = ["oneshot", "concept", "puzzles", "world", "logic", "repair"] as const;
export type PromptStage = (typeof PROMPT_STAGES)[number];

export const PACK_LANGUAGES = ["de", "en"] as const;
export type PackLanguage = (typeof PACK_LANGUAGES)[number];

export const DEFAULT_MINUTES = 30;
/** Rows of the size budget table in the one-shot prompt (plus the requested length, if different). */
export const BUDGET_TABLE_MINUTES = [15, 30, 45, 60] as const;
export const DEFAULT_LICENSE = "CC-BY-4.0";

export interface NamedText {
  name: string;
  content: string;
}

/** Everything a prompt may be filled with. Missing values render as instructions for a chat context. */
export interface PromptInputs {
  /** Pack language; null = the language of the idea. */
  lang: PackLanguage | null;
  /** The user's idea; null renders the "write your idea here" instruction (generic prompt). */
  idea: string | null;
  minutes: number;
  /** Pack id (kebab-case), when the output directory already fixes it. */
  packId?: string | null;
  /** Author for pack metadata (API pipeline); null = ask the model to use the user's name. */
  author?: string | null;
  license?: string | null;
  /** True when the prompt is for the API pipeline (affects provenance wording). */
  pipeline?: boolean;
  /** True for copy-paste stage prompts (affects provenance wording); set by assemblePrompt. */
  staged?: boolean;
  /** design/concept.md, if available. */
  concept?: string | null;
  /** design/puzzles.md, if available. */
  puzzles?: string | null;
  /** Current pack files (YAML), if available. */
  files?: NamedText[] | null;
  /** Diagnostics text for the repair stage. */
  diagnostics?: string | null;
}

const LANGUAGE_NAMES: Record<PackLanguage, string> = { de: "German", en: "English" };

export function describeLanguage(lang: PackLanguage | null): string {
  if (lang === null) {
    return (
      "the language the idea is written in — `de` for German, `en` for English. " +
      "LexVM supports these two pack languages; if the idea is written in another language, use English (`en`) " +
      "unless the user asks for German"
    );
  }
  return `${LANGUAGE_NAMES[lang]} (\`language: ${lang}\`)`;
}

/** A Markdown code fence around `content`, long enough that nothing inside can close it. */
export function fence(content: string, lang: string): string {
  const longestRun = Math.max(2, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const f = "`".repeat(longestRun + 1);
  return `${f}${lang}\n${content.replace(/\s+$/, "")}\n${f}`;
}

function renderIdea(idea: string | null): string {
  if (idea === null || idea.trim() === "") {
    return [
      "> **To the person pasting this prompt:** write your idea after “My idea:” below — a few sentences in any language:",
      "> setting, hero, goal, tone, perhaps a twist, the pack language (`de` or `en`) and the play time you want.",
      "> Then send the whole prompt.",
      "",
      "If no idea follows, ask the user for it in one short question and wait; do not invent a story on your own.",
      "",
      "My idea:",
    ].join("\n");
  }
  return `My idea:\n\n${idea
    .trim()
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n")}`;
}

function renderDoc(name: string, content: string | null | undefined, stageHint: string): string {
  if (content === null || content === undefined || content.trim() === "") {
    return `(No ${name} file was provided. Use the ${stageHint} from earlier in this conversation.)`;
  }
  return fenceFile(name, content);
}

function renderFiles(files: NamedText[] | null | undefined): string {
  if (!files || files.length === 0) {
    return "(No files were provided. Use the pack files from earlier in this conversation, or paste them here.)";
  }
  return files.map((f) => fenceFile(f.name, f.content)).join("\n\n");
}

function renderDiagnostics(text: string | null | undefined): string {
  if (text === null || text === undefined || text.trim() === "") {
    return "(Paste the output of `npm run lexvm -- check <pack>` or the diagnostics shown by the LexVM app here.)";
  }
  return fence(text.trim(), "text");
}

const TOLERANCE_PERCENT = Math.round(PLAYTIME_DEFAULTS.tolerance * 100);

function range(r: { min: number; max: number }): string {
  const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${fmt(r.min)}–${fmt(r.max)}`;
}

function budgetIntro(minutes: number): string {
  return (
    `Size budget for about ${minutes} minutes. LexVM estimates the play time from the walkthrough and the texts; ` +
    `\`lexvm check\` warns when the estimate misses \`playtime\` by more than ${TOLERANCE_PERCENT}%. Stay within these ranges:`
  );
}

/** The size budget for one target length, as Markdown (stage prompts). */
export function renderBudget(minutes: number, lang: PackLanguage | null): string {
  if (lang !== null) {
    return [budgetIntro(minutes), ...budgetForMinutes(minutes, lang).notes.map((n) => `- ${n}`)].join("\n");
  }
  const lines = PACK_LANGUAGES.map((l) => {
    const b = budgetForMinutes(minutes, l);
    return `- ${LANGUAGE_NAMES[l]} pack (\`${l}\`): ${range(b.walkthroughSteps)} walkthrough steps and ${range(b.words)} player-visible words in the whole pack.`;
  });
  return [
    budgetIntro(minutes),
    ...lines,
    '- About a quarter of the steps are dialogue choices; about 60% of the words appear along the walkthrough, the rest in optional descriptions, dialogue branches and custom responses (see "Length budget" in the guide).',
  ].join("\n");
}

/** The size budget table for 15/30/45/60 minutes (and the requested length), as Markdown (one-shot prompt). */
export function renderBudgetTable(minutes: number, lang: PackLanguage | null): string {
  const rows = [...new Set<number>([...BUDGET_TABLE_MINUTES, minutes])].sort((a, b) => a - b);
  const langs = lang === null ? [...PACK_LANGUAGES] : [lang];
  const budgets = (m: number): PlaytimeBudget[] => langs.map((l) => budgetForMinutes(m, l));
  const head =
    langs.length === 1
      ? ["| Play time | Walkthrough steps | Words of text |", "|---|---|---|"]
      : [
          `| Play time | ${langs.map((l) => `\`${l}\`: walkthrough steps | \`${l}\`: words of text`).join(" | ")} |`,
          `|---|${langs.map(() => "---|---|").join("")}`,
        ];
  const body = rows.map(
    (m) =>
      `| ${m} min | ${budgets(m)
        .map((b) => `${range(b.walkthroughSteps)} | ${range(b.words)}`)
        .join(" | ")} |`,
  );
  return [...head, ...body].join("\n");
}

function provenance(inputs: PromptInputs): { AUTHOR: string; LICENSE: string; GENERATOR: string } {
  const license = inputs.license ?? DEFAULT_LICENSE;
  const author =
    inputs.author !== undefined && inputs.author !== null && inputs.author.trim() !== ""
      ? `\`${JSON.stringify(`${inputs.author.trim()} (written with an LLM)`)}\``
      : "the user's name or handle if they gave one, otherwise `Anonymous`, followed by ` (written with an LLM)`";
  const generator = inputs.pipeline
    ? '`{ pipeline: "lexvm generate", notes: "Drafted by an LLM via the Anthropic API in staged prompts; verified with lexvm check." }`'
    : inputs.staged
      ? '`{ pipeline: "lexvm staged prompts", notes: "Drafted by an LLM chat assistant from the LexVM stage prompts." }`'
      : '`{ pipeline: "lexvm one-shot prompt", notes: "Drafted by an LLM chat assistant from the LexVM one-shot prompt." }`';
  return {
    AUTHOR: author,
    LICENSE: `\`${license}\`${inputs.license ? "" : " unless the user asks for another SPDX license id"}`,
    GENERATOR: generator,
  };
}

/** All placeholder values for the given inputs. */
export function promptVars(kit: PromptKit, inputs: PromptInputs): Record<string, string> {
  return {
    SPEC: kit.spec,
    GUIDE: kit.guide,
    CHECKLIST: kit.checklist,
    EXAMPLE: fence(kit.example, "yaml"),
    LANG:
      inputs.lang === null && inputs.concept && inputs.concept.trim() !== ""
        ? "the language chosen in the concept (`de` or `en`)"
        : describeLanguage(inputs.lang),
    MINUTES: String(inputs.minutes),
    // The shared system prompt is rendered with minutes 0 and uses neither.
    BUDGET: inputs.minutes > 0 ? renderBudget(inputs.minutes, inputs.lang) : "",
    BUDGET_TABLE: inputs.minutes > 0 ? renderBudgetTable(inputs.minutes, inputs.lang) : "",
    IDEA: renderIdea(inputs.idea),
    PACK_ID: inputs.packId
      ? `\`${inputs.packId}\``
      : "a short kebab-case id derived from the title (e.g. `hamburg-1948`)",
    CONCEPT: renderDoc("concept.md", inputs.concept, "concept"),
    PUZZLES: renderDoc("puzzles.md", inputs.puzzles, "puzzle design"),
    FILES: renderFiles(inputs.files),
    DIAGNOSTICS: renderDiagnostics(inputs.diagnostics),
    ...provenance(inputs),
  };
}

/** The shared system prompt of the staged pipeline (identical for every stage, so it can be cached). */
export function buildSystemPrompt(kit: PromptKit): string {
  return renderTemplate(kit.templates.system, promptVars(kit, { lang: null, idea: null, minutes: 0 }), "system");
}

/** The user message for one pipeline stage (without the system prompt). */
export function buildStagePrompt(kit: PromptKit, stage: Exclude<PromptStage, "oneshot">, inputs: PromptInputs): string {
  return renderTemplate(kit.templates[stage], promptVars(kit, inputs), stage);
}

/**
 * A self-contained prompt for copy-paste use with any LLM:
 * the one-shot prompt, or the system prompt followed by the stage prompt.
 */
export function assemblePrompt(kit: PromptKit, stage: PromptStage, inputs: PromptInputs): string {
  if (stage === "oneshot") return renderTemplate(kit.templates.oneshot, promptVars(kit, inputs), "oneshot");
  return `${buildSystemPrompt(kit)}\n---\n\n${buildStagePrompt(kit, stage, { staged: true, ...inputs })}`;
}
