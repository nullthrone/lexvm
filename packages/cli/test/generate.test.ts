import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runGenerate } from "../src/generate/index.ts";
import { loadPromptKit, type PromptKit, REPO_ROOT } from "../src/generate/kit.ts";
import type { CompleteFn, CompleteOptions, CompletionResult } from "../src/generate/llm.ts";
import { type RunLog, writeArtifact } from "../src/generate/pipeline.ts";
import type { VerifyFn, VerifyReport } from "../src/generate/verify.ts";

const SECRET = "sk-test-secret-value";
const ENV = { LEXVM_MODEL: "test-model", ANTHROPIC_API_KEY: SECRET };
const IDEA = "Your uncle has vanished and his study is locked.";

let kit: PromptKit;
let root: string;
let blocks: Map<string, string>;
let topKeys: string[];

/** Split a YAML document into its top-level key blocks (comments before the first key are dropped). */
function splitTopLevel(yaml: string): Map<string, string> {
  const result = new Map<string, string>();
  let key: string | null = null;
  let lines: string[] = [];
  for (const line of yaml.split("\n")) {
    const m = /^([A-Za-z]+):/.exec(line);
    if (m) {
      if (key) result.set(key, `${lines.join("\n").trimEnd()}\n`);
      key = m[1]!;
      lines = [line];
    } else if (key) {
      lines.push(line);
    }
  }
  if (key) result.set(key, `${lines.join("\n").trimEnd()}\n`);
  return result;
}

const PACK_KEYS = ["format", "id", "version", "title", "subtitle", "description", "language", "author", "license"];
const META_KEYS = [...PACK_KEYS, "playtime", "maxScore", "start", "verbs", "flags"];
const join_ = (keys: string[]) => keys.map((k) => blocks.get(k)!).join("\n");

function fileBlock(name: string, content: string): string {
  return `\`\`\`yaml file=${name}\n${content.trimEnd()}\n\`\`\``;
}

interface Call {
  stage: string;
  prompt: string;
  system: string | undefined;
}

/** A fake LLM that answers every stage with (parts of) the locked-study example. */
function fakeLlm(overrides: Partial<Record<string, (prompt: string) => string>> = {}) {
  const calls: Call[] = [];
  const answers: Record<string, (prompt: string) => string> = {
    concept: () => "# The Locked Study\n\nCONCEPT_MARKER: an uncle, a butler, a locked door.",
    puzzles: () =>
      [
        "Here is the puzzle design.",
        "",
        "````markdown file=puzzles.md",
        "# Puzzles",
        "",
        "PUZZLES_MARKER",
        "",
        "```mermaid",
        "flowchart TD",
        "  book --> key --> door --> letter --> password",
        "```",
        "````",
      ].join("\n"),
    world: () =>
      [
        "Here are the world files.",
        fileBlock("pack.yaml", join_(META_KEYS)),
        "And the rooms:",
        fileBlock("rooms.yaml", blocks.get("rooms")!),
        fileBlock("objects.yaml", blocks.get("objects")!),
        "An attempt to escape the output directory:",
        fileBlock("../escape.yaml", "evil: true"),
      ].join("\n\n"),
    logic: () =>
      [
        fileBlock("rules.yaml", blocks.get("rules")!),
        fileBlock("dialogues.yaml", blocks.get("dialogues")!),
        fileBlock("solution.yaml", join_(["endings", "hints", "walkthrough"])),
        "All checklist items: ok.",
      ].join("\n\n"),
    repair: () =>
      `Fixed the rule.\n\n${fileBlock("rules.yaml", `# repaired\n${blocks.get("rules")!}`)}\n\n- rules: fixed`,
    ...overrides,
  };
  const complete: CompleteFn = async (prompt: string, options: CompleteOptions): Promise<CompletionResult> => {
    calls.push({ stage: options.stage, prompt, system: options.system });
    options.onProgress?.(12_345);
    const answer = answers[options.stage];
    if (!answer) throw new Error(`unexpected stage ${options.stage}`);
    return {
      text: answer(prompt),
      stopReason: "end_turn",
      usage: { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 9000, cacheCreationInputTokens: 0 },
    };
  };
  return { complete, calls };
}

/**
 * A fake verifier. It checks that the files merge like the compiler would
 * (every top-level key of the example exactly once), then reports one error
 * until rules.yaml carries the repair marker (or always, if `alwaysFail`).
 */
function fakeVerifier(alwaysFail = false) {
  const seen: string[][] = [];
  const verify: VerifyFn = (files) => {
    seen.push(files.map((f) => f.name));
    const keys = files.flatMap((f) => [...splitTopLevel(f.text).keys()]);
    const sortedKeys = [...keys].sort();
    if (JSON.stringify(sortedKeys) !== JSON.stringify([...topKeys].sort())) {
      throw new Error(`files do not merge to the example: ${sortedKeys.join(",")}`);
    }
    const rules = files.find((f) => f.name === "rules.yaml")!.text;
    const broken = alwaysFail || !rules.startsWith("# repaired");
    const report: VerifyReport = broken
      ? {
          ok: false,
          diagnostics: [
            {
              severity: "error",
              code: "ref.unknown-object",
              path: "rules[0].do[2].reveal",
              message: "UNIQUE_DIAGNOSTIC: unknown object 'brass_kee'.",
              file: "rules.yaml",
              line: 4,
            },
            { severity: "warning", code: "text.too-long", path: "rooms.hall.description", message: "too long" },
          ],
          gates: [
            { gate: "compile", status: "failed", errors: 1, warnings: 1 },
            { gate: "walkthrough", status: "skipped", errors: 0, warnings: 0 },
            { gate: "exploration", status: "skipped", errors: 0, warnings: 0 },
          ],
        }
      : {
          ok: true,
          diagnostics: [
            { severity: "warning", code: "text.too-long", path: "rooms.hall.description", message: "too long" },
          ],
          gates: [
            { gate: "compile", status: "passed", errors: 0, warnings: 1 },
            { gate: "walkthrough", status: "passed", errors: 0, warnings: 0 },
            { gate: "exploration", status: "passed", errors: 0, warnings: 0 },
          ],
        };
    return report;
  };
  return { verify, seen };
}

function clock() {
  let t = Date.parse("2026-01-01T00:00:00Z");
  return () => {
    t += 1500;
    return new Date(t);
  };
}

async function allText(dir: string): Promise<string> {
  let out = "";
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) out += await readFile(join(entry.parentPath, entry.name), "utf8");
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

beforeAll(async () => {
  kit = await loadPromptKit();
  root = await mkdtemp(join(tmpdir(), "lexvm-generate-"));
  const example = await readFile(join(REPO_ROOT, "packs/locked-study/pack.yaml"), "utf8");
  blocks = splitTopLevel(example);
  topKeys = [...blocks.keys()];
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("lexvm generate", () => {
  it("runs all stages, repairs once and succeeds", async () => {
    const dir = join(root, "case-1", "locked-study");
    const llm = fakeLlm();
    const verifier = fakeVerifier();
    const logs: string[] = [];
    const code = await runGenerate(
      ["--idea", IDEA, "--lang", "en", "--minutes", "5", "--out", dir, "--max-repairs", "3", "--author", "Jane Doe"],
      { complete: llm.complete, verify: verifier.verify, env: ENV, log: (l) => logs.push(l), kit, now: clock() },
    );
    const log = logs.join("\n");
    expect(code, log).toBe(0);

    // Stages ran in order; the repair loop ran once and terminated.
    expect(llm.calls.map((c) => c.stage)).toEqual(["concept", "puzzles", "world", "logic", "repair"]);
    expect(verifier.seen).toHaveLength(2);
    expect(verifier.seen[0]).toEqual([
      "pack.yaml",
      "dialogues.yaml",
      "objects.yaml",
      "rooms.yaml",
      "rules.yaml",
      "solution.yaml",
    ]);

    // Every stage sees the outputs of the previous stages; the system prompt is shared (cacheable).
    const [concept, puzzles, world, logic, repair] = llm.calls;
    expect(concept!.prompt).toContain(IDEA);
    expect(concept!.prompt).toContain("`locked-study`");
    expect(puzzles!.prompt).toContain("CONCEPT_MARKER");
    expect(world!.prompt).toContain("CONCEPT_MARKER");
    expect(world!.prompt).toContain("PUZZLES_MARKER");
    expect(world!.prompt).toContain('"Jane Doe (written with an LLM)"');
    expect(logic!.prompt).toContain("```yaml file=rooms.yaml");
    expect(logic!.prompt).toContain("PUZZLES_MARKER");
    expect(repair!.prompt).toContain(
      "[error] ref.unknown-object @ rules[0].do[2].reveal (rules.yaml:4): UNIQUE_DIAGNOSTIC",
    );
    expect(repair!.prompt.indexOf("[error]")).toBeLessThan(repair!.prompt.indexOf("[warning]"));
    expect(repair!.prompt).toContain("```yaml file=solution.yaml");
    const systems = new Set(llm.calls.map((c) => c.system));
    expect(systems.size).toBe(1);
    expect([...systems][0]).toContain(kit.spec);

    // Artifacts.
    for (const f of ["pack.yaml", "rooms.yaml", "objects.yaml", "rules.yaml", "dialogues.yaml", "solution.yaml"]) {
      expect(await exists(join(dir, f)), f).toBe(true);
    }
    expect(await readFile(join(dir, "rules.yaml"), "utf8")).toMatch(/^# repaired/);
    expect(await readFile(join(dir, "design/concept.md"), "utf8")).toContain("CONCEPT_MARKER");
    const puzzlesDoc = await readFile(join(dir, "design/puzzles.md"), "utf8");
    expect(puzzlesDoc).toContain("```mermaid");
    expect(puzzlesDoc).not.toContain("````");
    // The malicious block was rejected and nothing escaped the output directory.
    expect(await exists(join(dir, "..", "escape.yaml"))).toBe(false);
    expect(await exists(join(dir, "escape.yaml"))).toBe(false);
    expect(log).toContain("rejected file '../escape.yaml'");

    // Run log.
    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.format).toBe("lexvm-generate-run/1");
    expect(run.pack).toBe("locked-study");
    expect(run.params.idea).toBe(IDEA);
    expect(run.events.map((e) => (e.round === undefined ? e.stage : `${e.stage}#${e.round}`))).toEqual([
      "concept",
      "puzzles",
      "world",
      "logic",
      "verify#0",
      "repair#1",
      "verify#1",
    ]);
    expect(run.events[2]!.files).toEqual(["pack.yaml", "rooms.yaml", "objects.yaml"]);
    expect(run.events[4]!.diagnostics).toEqual({ errors: 1, warnings: 1, infos: 0 });
    expect(run.events[6]!.gates?.every((g) => g.status === "passed")).toBe(true);
    expect(run.totals.outputTokens).toBe(5 * 500);
    expect(run.runs).toHaveLength(1);
    expect(run.runs[0]!.result).toMatchObject({ ok: true, repairs: 1, errors: 0, warnings: 1 });
    expect(run.events[0]!.durationMs).toBeGreaterThan(0);

    // Progress went to the log; no secrets or model ids anywhere.
    expect(log).toContain("[1/5] concept");
    expect(log).toContain("[5/5] verify");
    expect(log).toContain("12k characters received");
    expect(log).toContain("OK:");
    const written = await allText(dir);
    for (const text of [log, written]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("test-model");
    }
  });

  it("stops after --max-repairs rounds and exits 1 when errors remain", async () => {
    const dir = join(root, "case-2", "stubborn-pack");
    const llm = fakeLlm();
    const verifier = fakeVerifier(true);
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--out", dir, "--max-repairs", "2"], {
      complete: llm.complete,
      verify: verifier.verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code).toBe(1);
    expect(llm.calls.filter((c) => c.stage === "repair")).toHaveLength(2);
    expect(verifier.seen).toHaveLength(3);
    const log = logs.join("\n");
    expect(log).toContain("FAILED:");
    expect(log).toContain("UNIQUE_DIAGNOSTIC");
    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.runs[0]!.result).toMatchObject({ ok: false, repairs: 2, errors: 1 });
  });

  it("resumes from a stage, reusing earlier artifacts and the stored idea", async () => {
    const dir = join(root, "case-3", "resumed-pack");
    const first = fakeLlm();
    const deps = { verify: fakeVerifier().verify, env: ENV, log: () => {}, kit };
    expect(await runGenerate(["--idea", IDEA, "--out", dir], { ...deps, complete: first.complete })).toBe(0);
    const conceptBefore = await readFile(join(dir, "design/concept.md"), "utf8");

    // From logic: only logic and the verify loop run (the repair marker is gone again, so one repair).
    const second = fakeLlm();
    expect(await runGenerate(["--out", dir, "--from-stage", "logic"], { ...deps, complete: second.complete })).toBe(0);
    expect(second.calls.map((c) => c.stage)).toEqual(["logic", "repair"]);
    expect(second.calls[0]!.prompt).toContain("CONCEPT_MARKER");
    expect(await readFile(join(dir, "design/concept.md"), "utf8")).toBe(conceptBefore);

    // From verify: no LLM call at all when the pack already passes.
    const third = fakeLlm();
    expect(await runGenerate(["--out", dir, "--from-stage", "verify"], { ...deps, complete: third.complete })).toBe(0);
    expect(third.calls).toEqual([]);

    // From puzzles without --idea: the idea comes from run.json.
    const fourth = fakeLlm();
    expect(await runGenerate(["--out", dir, "--from-stage", "puzzles"], { ...deps, complete: fourth.complete })).toBe(
      0,
    );
    expect(fourth.calls[0]!.stage).toBe("puzzles");
    expect(fourth.calls[0]!.prompt).toContain(IDEA);

    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.runs.map((r) => r.fromStage)).toEqual(["concept", "logic", "verify", "puzzles"]);
    expect(run.runs.every((r) => r.result?.ok)).toBe(true);
  });

  it("refuses to resume without the artifacts a stage needs", async () => {
    const dir = join(root, "case-4", "empty-pack");
    const logs: string[] = [];
    const llm = fakeLlm();
    const code = await runGenerate(["--out", dir, "--from-stage", "world"], {
      complete: llm.complete,
      verify: fakeVerifier().verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("design/concept.md");
    expect(llm.calls).toEqual([]);
  });

  it("refuses to overwrite an existing pack unless --force is given", async () => {
    const dir = join(root, "case-5", "existing-pack");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "pack.yaml"), "format: lexvm-pack/1\n");
    const logs: string[] = [];
    const deps = { verify: fakeVerifier().verify, env: ENV, log: (l: string) => logs.push(l), kit };
    expect(await runGenerate(["--idea", IDEA, "--out", dir], { ...deps, complete: fakeLlm().complete })).toBe(2);
    expect(logs.join("\n")).toContain("--from-stage");
    expect(
      await runGenerate(["--idea", IDEA, "--out", dir, "--force"], { ...deps, complete: fakeLlm().complete }),
    ).toBe(0);
    // The world stage replaced the stale pack.yaml.
    expect(await readFile(join(dir, "pack.yaml"), "utf8")).toContain("id: locked-study");
  });

  it("fails when a file stage returns no files twice", async () => {
    const dir = join(root, "case-6", "no-files");
    const llm = fakeLlm({ world: () => "I would rather describe the world in prose." });
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--out", dir], {
      complete: llm.complete,
      verify: fakeVerifier().verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code).toBe(1);
    expect(llm.calls.map((c) => c.stage)).toEqual(["concept", "puzzles", "world", "world"]);
    expect(llm.calls[3]!.prompt).toContain("no usable file blocks");
    expect(logs.join("\n")).toContain("produced no files");
    const run = JSON.parse(await readFile(join(dir, "design/run.json"), "utf8")) as RunLog;
    expect(run.runs[0]!.result?.failure).toContain("produced no files");
  });

  it("stops the repair loop when the verifier keeps crashing the same way", async () => {
    const dir = join(root, "case-7", "crashing-verifier");
    const llm = fakeLlm();
    let checks = 0;
    const verify: VerifyFn = () => {
      checks++;
      return {
        ok: false,
        gates: [],
        diagnostics: [{ severity: "error", code: "verify.walkthrough-crashed", path: "", message: "boom" }],
      };
    };
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--out", dir, "--max-repairs", "5"], {
      complete: llm.complete,
      verify,
      env: ENV,
      log: (l) => logs.push(l),
      kit,
    });
    expect(code).toBe(1);
    expect(checks).toBe(2);
    expect(llm.calls.filter((c) => c.stage === "repair")).toHaveLength(1);
    expect(logs.join("\n")).toContain("crashed twice");
  });
});

describe("lexvm generate: configuration errors", () => {
  it("exits 2 with a helpful message when no model is given", async () => {
    const logs: string[] = [];
    const code = await runGenerate(["--idea", IDEA, "--out", join(root, "no-model", "some-pack")], {
      env: { ANTHROPIC_API_KEY: SECRET },
      log: (l) => logs.push(l),
      kit,
    });
    expect(code).toBe(2);
    const log = logs.join("\n");
    expect(log).toContain("--model");
    expect(log).toContain("LEXVM_MODEL");
    expect(log).toContain("model documentation");
    expect(log).not.toContain(SECRET);
  });

  it("exits 2 when the API key is missing", async () => {
    const logs: string[] = [];
    const code = await runGenerate(
      ["--idea", IDEA, "--out", join(root, "no-key", "some-pack"), "--model", "test-model"],
      {
        env: {},
        log: (l) => logs.push(l),
        kit,
      },
    );
    expect(code).toBe(2);
    expect(logs.join("\n")).toContain("ANTHROPIC_API_KEY");
  });

  it("exits 2 on invalid arguments", async () => {
    const run = (argv: string[]) => runGenerate(argv, { env: ENV, log: () => {}, kit, complete: fakeLlm().complete });
    expect(await run(["--idea", IDEA])).toBe(2); // no --out
    expect(await run(["--out", join(root, "x", "fine-id")])).toBe(2); // no idea
    expect(await run(["--idea", IDEA, "--out", join(root, "x", "Not_Kebab")])).toBe(2);
    expect(await run(["--idea", IDEA, "--out", join(root, "x", "a"), "--lang", "fr"])).toBe(2);
    expect(await run(["--idea", IDEA, "--out", join(root, "x", "a"), "--from-stage", "nope"])).toBe(2);
    expect(await run(["--idea", IDEA, "--out", join(root, "x", "a"), "--minutes", "-3"])).toBe(2);
    expect(await run(["--idea", IDEA, "--out", join(root, "x", "a"), "--effort", "extreme"])).toBe(2);
    expect(await run(["--bogus"])).toBe(2);
    expect(await run(["--help"])).toBe(0);
  });
});

describe("writeArtifact", () => {
  it("never writes outside the output directory", async () => {
    const dir = join(root, "artifacts");
    await expect(writeArtifact(dir, "../x.yaml", "x")).rejects.toThrow(/refusing/);
    await expect(writeArtifact(dir, "sub/x.yaml", "x")).rejects.toThrow(/refusing/);
    await expect(writeArtifact(dir, "x.json", "x")).rejects.toThrow(/refusing/);
    expect(await writeArtifact(dir, "notes.md", "n")).toBe("design/notes.md");
    expect(await writeArtifact(dir, "rooms.yaml", "r")).toBe("rooms.yaml");
  });
});
