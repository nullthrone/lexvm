import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assemblePrompt, buildSystemPrompt, PROMPT_STAGES, type PromptInputs } from "../src/generate/assemble.ts";
import {
  demoteHeadings,
  extractRegions,
  loadPromptKit,
  type PromptKit,
  placeholdersOf,
  REPO_ROOT,
  renderTemplate,
  TEMPLATE_NAMES,
} from "../src/generate/kit.ts";
import { runPrompt } from "../src/generate/prompt.ts";
import type { VerifyFn } from "../src/generate/verify.ts";

/** Strings that look like AI model identifiers. None may appear in repository files. */
const MODEL_ID =
  /\b(claude-(opus|sonnet|haiku|fable|mythos|instant|\d)[\w.-]*|gpt-\d[\w.-]*|gemini-\d[\w.-]*|o\d-(mini|preview))\b/i;

let kit: PromptKit;
let tmp: string;

beforeAll(async () => {
  kit = await loadPromptKit();
  tmp = await mkdtemp(join(tmpdir(), "lexvm-prompt-"));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const fullInputs: PromptInputs = {
  lang: "de",
  idea: "Hamburg 1948. Ein Kommissar sucht einen verschwundenen Hafenarbeiter.",
  minutes: 40,
  packId: "hamburg-1948",
  author: "Jane Doe",
  license: "CC-BY-4.0",
  pipeline: true,
  concept: "# Concept\n\nNoir.",
  puzzles: "# Puzzles\n\n```mermaid\nflowchart TD\n  a --> b\n```",
  files: [{ name: "pack.yaml", content: "format: lexvm-pack/1\n" }],
  diagnostics: "[error] ref.unknown-object @ rules[0]: unknown object 'x'",
};

describe("prompt kit", () => {
  it("loads the spec, guide regions, checklist, example and all templates", () => {
    expect(kit.spec).toContain("lexvm-pack/1");
    expect(kit.guide).toContain("## Puzzle dependency chart");
    expect(kit.example).toContain("id: locked-study");
    expect(kit.example).not.toContain("yaml-language-server");
    for (const name of TEMPLATE_NAMES) expect(kit.templates[name].length).toBeGreaterThan(100);
  });

  it("checklist covers the most common mistakes", () => {
    const c = kit.checklist.toLowerCase();
    for (const topic of [
      "undeclared flags",
      "flow-mapping quoting",
      "missing reverse exits",
      "walkthrough uses names instead of ids",
      "`once` rules without `id`",
      "losing endings",
      "dead ends",
      "missing hints",
      "texts too long for phones",
      "unreferenced scenery",
    ]) {
      expect(c).toContain(topic);
    }
  });

  it("extractRegions and demoteHeadings behave", () => {
    const md =
      "# A\n<!-- prompt:begin x -->\none\n<!-- prompt:end x -->\nskip\n<!-- prompt:begin x -->\ntwo\n<!-- prompt:end x -->";
    expect(extractRegions(md, "x")).toBe("one\n\ntwo");
    expect(extractRegions(md, "y")).toBe("");
    expect(demoteHeadings("# T\n```yaml\n# comment\n```\n## S", 1)).toBe("## T\n```yaml\n# comment\n```\n### S");
  });

  it("renderTemplate fails on missing values and never re-expands substituted text", () => {
    expect(() => renderTemplate("Hello {{NAME}}", {}, "t")).toThrow(/NAME/);
    expect(renderTemplate("<!-- template: note -->\nA {{X}} B", { X: "{{X}}" })).toBe("A {{X}} B\n");
    expect(placeholdersOf("{{A}} {{B}} {{A}}")).toEqual(["A", "B"]);
  });
});

describe("assemblePrompt", () => {
  it("resolves every placeholder in every stage, with and without inputs", () => {
    const empty: PromptInputs = { lang: null, idea: null, minutes: 30 };
    for (const stage of PROMPT_STAGES) {
      for (const inputs of [empty, fullInputs]) {
        const text = assemblePrompt(kit, stage, inputs);
        expect(text, stage).not.toMatch(/\{\{[A-Z_]+\}\}/);
        expect(text, stage).not.toContain("<!-- template:");
      }
    }
  });

  it("one-shot embeds the full spec, the guide, the checklist and the example", () => {
    const text = assemblePrompt(kit, "oneshot", { lang: null, idea: null, minutes: 30 });
    const spec = kit.spec;
    // Every section heading of the spec is present.
    for (const heading of spec.match(/^#{2,3} .+$/gm) ?? []) expect(text).toContain(heading);
    expect(text).toContain(spec);
    expect(text).toContain(kit.guide);
    expect(text).toContain(kit.checklist);
    expect(text).toContain(kit.example);
    expect(text).toContain("walkthrough` last");
    expect(text.trimEnd().endsWith("My idea:")).toBe(true);
    expect(text).toContain("If no idea follows");
  });

  it("one-shot with an idea puts it at the end and states the language", () => {
    const text = assemblePrompt(kit, "oneshot", { lang: "de", idea: "Ein Fall im Regen.\nZweite Zeile.", minutes: 45 });
    expect(text.trimEnd().endsWith("> Ein Fall im Regen.\n> Zweite Zeile.")).toBe(true);
    expect(text).toContain("German (`language: de`)");
    expect(text).toContain("about 45 minutes");
    expect(text).not.toContain("If no idea follows");
  });

  it("stage prompts carry the shared system prompt and the run inputs", () => {
    const system = buildSystemPrompt(kit);
    expect(system).toContain(kit.spec);
    const repair = assemblePrompt(kit, "repair", fullInputs);
    expect(repair.startsWith(system)).toBe(true);
    expect(repair).toContain("ref.unknown-object");
    expect(repair).toContain("```yaml file=pack.yaml");
    // The puzzle doc contains a fence, so it is wrapped in a longer one.
    expect(repair).toContain("````markdown file=puzzles.md");
    const world = assemblePrompt(kit, "world", fullInputs);
    expect(world).toContain("`hamburg-1948`");
    expect(world).toContain('"Jane Doe (written with an LLM)"');
    expect(world).toContain("lexvm generate");
  });

  it("contains no model identifiers", () => {
    for (const stage of PROMPT_STAGES) {
      expect(assemblePrompt(kit, stage, fullInputs)).not.toMatch(MODEL_ID);
    }
  });
});

describe("repository files", () => {
  it("contain no model identifiers (prompts, authoring docs, generator code, tests)", async () => {
    const dirs = ["prompts", "prompts/templates", "docs/authoring", "packages/cli/src/generate", "packages/cli/test"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const name of await readdir(join(REPO_ROOT, dir))) {
        if (!/\.(md|ts)$/.test(name)) continue;
        if (dir === "packages/cli/test" && !/^(generate|prompt)/.test(name)) continue;
        const text = await readFile(join(REPO_ROOT, dir, name), "utf8");
        // This test file spells the pattern out, but not a concrete id.
        const match = MODEL_ID.exec(text);
        if (match) offenders.push(`${dir}/${name}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("prompts/oneshot.md is up to date (run `npm run prompts` after changing templates, guide, spec or example)", async () => {
    let generated = "";
    const code = await runPrompt(["--stage", "oneshot"], { stdout: (t) => (generated += t), log: () => {} });
    expect(code).toBe(0);
    const committed = await readFile(join(REPO_ROOT, "prompts/oneshot.md"), "utf8");
    expect(committed === generated, "prompts/oneshot.md is stale: run `npm run prompts`").toBe(true);
  });
});

describe("runPrompt", () => {
  it("prints to stdout by default and writes --out files", async () => {
    let out = "";
    const logs: string[] = [];
    expect(await runPrompt(["--stage", "concept", "--idea", "A lighthouse"], { stdout: (t) => (out += t) })).toBe(0);
    expect(out).toContain("# Stage 1 of 4: concept");
    expect(out).toContain("> A lighthouse");
    const target = join(tmp, "nested", "oneshot.md");
    expect(await runPrompt(["--out", target, "--lang", "en"], { log: (l) => logs.push(l) })).toBe(0);
    expect(await readFile(target, "utf8")).toContain("English (`language: en`)");
    expect(logs.join("\n")).toContain("wrote");
  });

  it("rejects bad arguments with exit code 2", async () => {
    const logs: string[] = [];
    const log = (l: string) => logs.push(l);
    expect(await runPrompt(["--stage", "nonsense"], { log })).toBe(2);
    expect(await runPrompt(["--lang", "fr"], { log })).toBe(2);
    expect(await runPrompt(["--minutes", "abc"], { log })).toBe(2);
    expect(await runPrompt(["--unknown"], { log })).toBe(2);
    expect(logs.join("\n")).toContain("--stage must be one of");
  });

  it("builds a repair prompt from a pack directory, running the checks for diagnostics", async () => {
    const dir = join(tmp, "my-pack");
    await mkdir(join(dir, "design"), { recursive: true });
    await writeFile(join(dir, "pack.yaml"), "format: lexvm-pack/1\nlanguage: de\n");
    await writeFile(join(dir, "rooms.yaml"), "rooms: {}\n");
    await writeFile(join(dir, "design", "puzzles.md"), "# Puzzles\n");
    const seen: string[][] = [];
    const verify: VerifyFn = (files) => {
      seen.push(files.map((f) => f.name));
      return {
        ok: false,
        gates: [],
        diagnostics: [
          { severity: "error", code: "schema.required", path: "rooms", message: "rooms must not be empty" },
        ],
      };
    };
    let out = "";
    expect(await runPrompt(["--stage", "repair", "--pack", dir], { stdout: (t) => (out += t), verify })).toBe(0);
    expect(seen).toEqual([["pack.yaml", "rooms.yaml"]]);
    expect(out).toContain("[error] schema.required @ rooms: rooms must not be empty");
    expect(out).toContain("```yaml file=rooms.yaml");
    expect(out).toContain("```markdown file=puzzles.md");

    const diagFile = join(tmp, "diag.txt");
    await writeFile(diagFile, "[error] custom @ x: from file");
    out = "";
    const single = join(dir, "pack.yaml");
    expect(
      await runPrompt(["--stage", "repair", "--pack", single, "--diagnostics", diagFile], {
        stdout: (t) => (out += t),
        verify,
      }),
    ).toBe(0);
    expect(out).toContain("from file");
    expect(seen).toHaveLength(1);
  });
});
