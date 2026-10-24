/**
 * Play time in the generation pipeline: the --minutes target in pack.yaml and
 * in the verify gate, play time diagnostics in repair prompts, the length
 * repair round, and the aligned fallbacks of `lexvm check` and the gates.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Diagnostic, ExploreReport, WalkthroughReport } from "@lexvm/engine";
import { compile } from "@lexvm/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exploreFallbacks, walkthroughFallbacks } from "../src/fallbacks.ts";
import { runGenerate } from "../src/generate/index.ts";
import { loadPromptKit, type PromptKit, REPO_ROOT } from "../src/generate/kit.ts";
import type { CompleteFn, CompleteOptions } from "../src/generate/llm.ts";
import { type RunLog, withPlaytime } from "../src/generate/pipeline.ts";
import {
  engineVerify,
  formatDiagnosticsForPrompt,
  selectDiagnostics,
  type VerifyFn,
  type VerifyOptions,
  type VerifyReport,
} from "../src/generate/verify.ts";

const ENV = { LEXVM_MODEL: "test-model", ANTHROPIC_API_KEY: "sk-test" };
const IDEA = "Your uncle has vanished and his study is locked.";

let kit: PromptKit;
let root: string;
let example: string;

beforeAll(async () => {
  kit = await loadPromptKit();
  root = await mkdtemp(join(tmpdir(), "lexvm-generate-playtime-"));
  example = await readFile(join(REPO_ROOT, "packs/locked-study/pack.yaml"), "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const block = (name: string, content: string) => `\`\`\`yaml file=${name}\n${content.trimEnd()}\n\`\`\``;

/** A fake LLM: the world stage returns the whole example as pack.yaml (without playtime), repairs rewrite rules. */
function fakeLlm() {
  const calls: Array<{ stage: string; prompt: string }> = [];
  const answers: Record<string, () => string> = {
    concept: () => "# The Locked Study\n\nA concept.",
    story: () => "# Story\n\nThe truth.",
    puzzles: () => "# Puzzles\n\nA chart.",
    world: () => block("pack.yaml", example.replace(/^playtime: \d+\n/m, "")),
    logic: () => block("notes.yaml", "# nothing to add\n"),
    repair: () => block("notes.yaml", "# repaired\n"),
  };
  const complete: CompleteFn = async (prompt: string, options: CompleteOptions) => {
    calls.push({ stage: options.stage, prompt });
    const answer = answers[options.stage];
    if (!answer) throw new Error(`unexpected stage ${options.stage}`);
    return { text: answer(), stopReason: "end_turn" };
  };
  return { complete, calls };
}

const passed = (warnings: number): VerifyReport["gates"] => [
  { gate: "compile", status: "passed", errors: 0, warnings: 0 },
  { gate: "walkthrough", status: "passed", errors: 0, warnings },
  { gate: "exploration", status: "passed", errors: 0, warnings: 0 },
];

const tooShort: Diagnostic = {
  severity: "warning",
  code: "playtime.too-short",
  path: "playtime",
  message: "Estimated play time ≈ 6 min is 80% below the target of 30 min: ≈ 24 min short: add 3-5 puzzles.",
};
const textWarning: Diagnostic = { severity: "warning", code: "text.too-long", path: "rooms.hall", message: "long" };

describe("withPlaytime", () => {
  it("replaces an existing playtime or adds one after the metadata", () => {
    expect(withPlaytime("id: x\nplaytime: 5\nrooms: {}\n", 30)).toBe("id: x\nplaytime: 30\nrooms: {}\n");
    expect(withPlaytime("format: lexvm-pack/1\nlanguage: de\nrooms: {}\n", 12)).toBe(
      "format: lexvm-pack/1\nlanguage: de\nplaytime: 12\nrooms: {}\n",
    );
    expect(withPlaytime("rooms: {}\n", 7)).toBe("playtime: 7\nrooms: {}\n");
    // Only a top-level key counts.
    expect(withPlaytime("language: en\nnotes:\n  playtime: 3\n", 9)).toBe(
      "language: en\nplaytime: 9\nnotes:\n  playtime: 3\n",
    );
  });
});

describe("lexvm generate: play time", () => {
  it("writes --minutes to playtime and passes it to the verify gate", async () => {
    const dir = join(root, "minutes", "locked-study");
    const llm = fakeLlm();
    const seen: Array<{ options: VerifyOptions; pack: string }> = [];
    const verify: VerifyFn = (files, options) => {
      seen.push({ options, pack: files.find((f) => f.name === "pack.yaml")!.text });
      return { ok: true, diagnostics: [], gates: passed(0) };
    };
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--lang", "en", "--minutes", "12", "--out", dir], {
      complete: llm.complete,
      verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code, logs.join("\n")).toBe(0);
    expect(await readFile(join(dir, "pack.yaml"), "utf8")).toMatch(/^language: en\nplaytime: 12\n/m);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.options).toMatchObject({ targetMinutes: 12 });
    expect(seen[0]!.pack).toContain("playtime: 12");
    expect(logs.join("\n")).toContain("set playtime: 12 and pacing: balanced in pack.yaml");
    // The stage prompts carry the budget for the target.
    expect(llm.calls.find((c) => c.stage === "world")!.prompt).toContain("Size budget for about 12 minutes");
  });

  it("spends one repair round on a pack that passes but misses its length", async () => {
    const dir = join(root, "length", "locked-study");
    const llm = fakeLlm();
    let checks = 0;
    const verify: VerifyFn = () => {
      checks++;
      return checks === 1
        ? { ok: true, diagnostics: [textWarning, tooShort], gates: passed(2) }
        : { ok: true, diagnostics: [], gates: passed(0) };
    };
    const code = await runGenerate(["--idea", IDEA, "--minutes", "30", "--out", dir, "--max-repairs", "3"], {
      complete: llm.complete,
      verify,
      env: ENV,
      log: () => {},
      kit,
    });
    expect(code).toBe(0);
    expect(checks).toBe(2);
    const repairs = llm.calls.filter((c) => c.stage === "repair");
    expect(repairs).toHaveLength(1);
    const prompt = repairs[0]!.prompt;
    expect(prompt).toContain("[warning] playtime.too-short @ playtime");
    expect(prompt.indexOf("playtime.too-short")).toBeLessThan(prompt.indexOf("text.too-long"));
    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.runs[0]!.result).toMatchObject({ ok: true, repairs: 1 });
  });

  it("does not spend more than one round on the length", async () => {
    const dir = join(root, "length-once", "locked-study");
    const llm = fakeLlm();
    const verify: VerifyFn = () => ({ ok: true, diagnostics: [tooShort], gates: passed(1) });
    const code = await runGenerate(["--idea", IDEA, "--out", dir, "--max-repairs", "5"], {
      complete: llm.complete,
      verify,
      env: ENV,
      log: () => {},
      kit,
    });
    expect(code).toBe(0);
    expect(llm.calls.filter((c) => c.stage === "repair")).toHaveLength(1);
  });

  it("restores the last passing version when the length repair breaks the pack", async () => {
    const dir = join(root, "restore", "locked-study");
    const llm = fakeLlm();
    let checks = 0;
    const verify: VerifyFn = (files) => {
      checks++;
      if (!files.some((f) => f.name === "notes.yaml" && f.text.startsWith("# repaired"))) {
        return { ok: true, diagnostics: [tooShort], gates: passed(1) };
      }
      return {
        ok: false,
        diagnostics: [{ severity: "error", code: "walkthrough.rejected", path: "walkthrough[3]", message: "broken" }],
        gates: passed(0),
      };
    };
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--out", dir, "--max-repairs", "1"], {
      complete: llm.complete,
      verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code, logs.join("\n")).toBe(0);
    expect(checks).toBe(2);
    expect(logs.join("\n")).toContain("restored the last passing version");
    expect(await readFile(join(dir, "notes.yaml"), "utf8")).toBe("# nothing to add\n");
    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.runs[0]!.result).toMatchObject({ ok: true, warnings: 1 });
    expect(run.events.at(-1)!.notes).toEqual([
      "restored the last passing version after an unsuccessful length or review round",
    ]);
  });
});

describe("engineVerify", () => {
  const files = async () => [
    { name: "pack.yaml", text: await readFile(join(REPO_ROOT, "packs/locked-study/pack.yaml"), "utf8") },
  ];

  it("includes the play time diagnostics, against the --minutes target", async () => {
    const report = await engineVerify(await files(), { maxStates: 200_000, targetMinutes: 30 });
    expect(report.ok).toBe(true);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("playtime.estimate");
    expect(codes).toContain("playtime.too-short");
    expect(report.gates.find((g) => g.gate === "walkthrough")!.warnings).toBe(1);
    const onTarget = await engineVerify(await files(), { maxStates: 200_000 });
    expect(onTarget.diagnostics.map((d) => d.code)).not.toContain("playtime.too-short");
    expect(onTarget.diagnostics.map((d) => d.code)).toContain("playtime.estimate");
  });

  it("reports an incomplete exploration as unverified, never as unwinnable", async () => {
    const report = await engineVerify(await files(), { maxStates: 20 });
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("explore.incomplete");
    expect(codes).not.toContain("explore.not-winnable");
    expect(codes).not.toContain("explore.unwinnable");
    // Nothing is proven, so the gate fails (the generator can raise --max-states).
    expect(report.diagnostics.filter((d) => d.severity === "error").map((d) => d.code)).toEqual(["explore.incomplete"]);
    expect(report.ok).toBe(false);
  });

  it("ranks play time warnings after the errors and before every other warning", () => {
    const error: Diagnostic = { severity: "error", code: "ref.unknown-object", path: "x", message: "e" };
    const explore: Diagnostic = { severity: "warning", code: "explore.incomplete", path: "", message: "i" };
    const info: Diagnostic = { severity: "info", code: "playtime.estimate", path: "playtime", message: "≈" };
    const ordered = selectDiagnostics([textWarning, explore, tooShort, info, error]).map((d) => d.code);
    expect(ordered).toEqual(["ref.unknown-object", "playtime.too-short", "explore.incomplete", "text.too-long"]);
    expect(formatDiagnosticsForPrompt([textWarning, tooShort])).toMatch(/^\[warning\] playtime\.too-short/);
  });
});

describe("check and gate fallbacks", () => {
  const lockedStudy = async () =>
    compile([{ name: "pack.yaml", text: await readFile(join(REPO_ROOT, "packs/locked-study/pack.yaml"), "utf8") }])
      .pack!;
  const explore = (over: Partial<ExploreReport>): ExploreReport => ({
    complete: true,
    states: 10,
    winnable: true,
    shortestWin: [],
    deadEnds: [],
    losingEndings: [],
    unreached: { rooms: [], endings: [], rules: [], options: [] },
    diagnostics: [],
    ...over,
  });

  it("adds nothing the engine already reported", () => {
    const reported: Diagnostic = { severity: "error", code: "explore.dead-end", path: "rooms.hall", message: "d" };
    const report = explore({ deadEnds: [{ path: ["go north"] }], diagnostics: [reported] });
    expect(exploreFallbacks(report)).toEqual([]);
    expect(exploreFallbacks(explore({ deadEnds: [{ path: ["go north"] }] })).map((d) => d.code)).toEqual([
      "explore.dead-end",
    ]);
  });

  it("reports not-winnable only for a complete exploration", () => {
    expect(exploreFallbacks(explore({ winnable: false, complete: false })).map((d) => d.code)).toEqual([
      "explore.incomplete",
    ]);
    expect(exploreFallbacks(explore({ winnable: false })).map((d) => d.code)).toEqual(["explore.not-winnable"]);
  });

  it("uses the engine's walkthrough codes and checks the score of a successful replay", async () => {
    const study = await lockedStudy();
    const base: WalkthroughReport = { ok: false, steps: [], ending: null, score: 0, diagnostics: [] };
    expect(walkthroughFallbacks(study, base).map((d) => d.code)).toEqual(["walkthrough.not-won"]);
    const rejected = { ...base, steps: [{ command: "go up", status: "rejected" as const, output: "No." }] };
    expect(walkthroughFallbacks(study, rejected)).toMatchObject([
      { code: "walkthrough.rejected", path: "walkthrough[0]" },
    ]);
    const reported = {
      ...rejected,
      diagnostics: [{ severity: "error" as const, code: "walkthrough.rejected", path: "walkthrough[0]", message: "x" }],
    };
    expect(walkthroughFallbacks(study, reported)).toEqual([]);
    const won = { ...base, ok: true, ending: "found_uncle", score: 2 };
    expect(walkthroughFallbacks(study, won).map((d) => d.code)).toEqual(["walkthrough.score-mismatch"]);
    expect(walkthroughFallbacks(study, { ...won, score: 3 })).toEqual([]);
    // One maxScore mistake, one warning: the analyzer's score.maxScore-unreachable already covers it.
    const unreachable: Diagnostic = {
      severity: "warning",
      code: "score.maxScore-unreachable",
      path: "maxScore",
      message: "m",
    };
    expect(walkthroughFallbacks(study, won, [unreachable])).toEqual([]);
  });
});
