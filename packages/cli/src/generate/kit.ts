/**
 * The prompt kit: templates under prompts/templates plus the documents they
 * embed (normative spec, condensed authoring guide, worked example). Every
 * document is read from the repository at runtime, so the prompts always
 * match the current spec.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root, derived from this file's location (packages/cli/src/generate). */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

export const TEMPLATE_NAMES = ["oneshot", "system", "concept", "puzzles", "world", "logic", "repair"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export interface PromptKit {
  /** Full normative spec (docs/spec/content-pack.md), headings demoted one level for embedding. */
  spec: string;
  /** Condensed authoring guide: the `guide` regions of docs/authoring/guide.md. */
  guide: string;
  /** Common-mistakes checklist: the `checklist` region of docs/authoring/guide.md. */
  checklist: string;
  /** Worked example pack (packs/locked-study/pack.yaml). */
  example: string;
  templates: Record<TemplateName, string>;
}

export const KIT_SOURCES = {
  spec: "docs/spec/content-pack.md",
  guide: "docs/authoring/guide.md",
  example: "packs/locked-study/pack.yaml",
  templates: "prompts/templates",
} as const;

/**
 * Extract the regions of a Markdown document marked for prompt inclusion:
 *
 *     <!-- prompt:begin guide -->
 *     ...
 *     <!-- prompt:end guide -->
 *
 * Regions with the same name are concatenated in document order.
 */
export function extractRegions(markdown: string, name: string): string {
  const re = new RegExp(`<!--\\s*prompt:begin\\s+${name}\\s*-->([\\s\\S]*?)<!--\\s*prompt:end\\s+${name}\\s*-->`, "g");
  const parts = [...markdown.matchAll(re)].map((m) => m[1]!.trim());
  return parts.join("\n\n");
}

/** Shift ATX headings down by `levels` (max level 6), leaving fenced code blocks untouched. */
export function demoteHeadings(markdown: string, levels: number): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length && line.trim() === f[1]) fence = null;
        return line;
      }
      if (fence !== null) return line;
      const h = /^(#{1,6})(\s.*)$/.exec(line);
      if (!h) return line;
      return `${"#".repeat(Math.min(6, h[1]!.length + levels))}${h[2]}`;
    })
    .join("\n");
}

/** Remove editor-only lines (yaml-language-server modeline) from the example. */
function cleanExample(yaml: string): string {
  return yaml
    .split("\n")
    .filter((l) => !/^#\s*yaml-language-server:/.test(l))
    .join("\n")
    .replace(/^#\s*\n/, "")
    .trim();
}

export async function loadPromptKit(root: string = REPO_ROOT): Promise<PromptKit> {
  const read = (rel: string) => readFile(join(root, rel), "utf8");
  const [specRaw, guideRaw, exampleRaw] = await Promise.all([
    read(KIT_SOURCES.spec),
    read(KIT_SOURCES.guide),
    read(KIT_SOURCES.example),
  ]);
  const entries = await Promise.all(
    TEMPLATE_NAMES.map(async (n) => [n, await read(`${KIT_SOURCES.templates}/${n}.md`)] as const),
  );
  const guide = extractRegions(guideRaw, "guide");
  const checklist = extractRegions(guideRaw, "checklist");
  if (guide === "" || checklist === "") {
    throw new Error(`${KIT_SOURCES.guide} has no 'guide' or 'checklist' prompt regions`);
  }
  return {
    spec: demoteHeadings(specRaw.trim(), 1),
    guide,
    checklist,
    example: cleanExample(exampleRaw),
    templates: Object.fromEntries(entries) as Record<TemplateName, string>,
  };
}

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/** Names of all placeholders used in a template. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/**
 * Fill `{{NAME}}` placeholders in a single pass (substituted text is never
 * re-scanned, so embedded documents cannot inject placeholders). Throws if a
 * placeholder has no value, so a template change can never ship a prompt with
 * holes in it. Template comments (`<!-- template: ... -->`) are removed.
 */
export function renderTemplate(template: string, vars: Record<string, string>, templateName = "template"): string {
  const missing = placeholdersOf(template).filter((p) => vars[p] === undefined);
  if (missing.length > 0) {
    throw new Error(`${templateName}: no value for placeholder(s) ${missing.map((m) => `{{${m}}}`).join(", ")}`);
  }
  const stripped = template.replace(/<!--\s*template:[\s\S]*?-->\n?/g, "");
  return `${stripped.replace(PLACEHOLDER, (_m, name: string) => vars[name]!).trim()}\n`;
}
