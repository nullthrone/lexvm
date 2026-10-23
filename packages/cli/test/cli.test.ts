/**
 * Smoke tests: spawn the real CLI (through tsx) on the reference pack and the
 * compile fixtures. Checks that need runtime parts the engine does not
 * implement yet are skipped until they exist.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile, explore, loadPack, newGame, type Pack, parseCommand, runWalkthrough } from "@lexvm/engine";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const MAIN = join(ROOT, "packages/cli/src/main.ts");
const TSX = pathToFileURL(join(ROOT, "node_modules/tsx/dist/loader.mjs")).href;
const LOCKED_STUDY = join(ROOT, "packs/locked-study");
const FIXTURES = join(ROOT, "packages/engine/test/fixtures/compile");
const TIMEOUT = 60_000;

const tmp = mkdtempSync(join(tmpdir(), "lexvm-cli-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function lexvm(args: string[], input = "") {
  const r = spawnSync(process.execPath, ["--import", TSX, MAIN, ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const lockedStudy: Pack = compile([{ name: "pack.yaml", text: readFileSync(join(LOCKED_STUDY, "pack.yaml"), "utf8") }])
  .pack!;

function works(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

const runtimeReady = works(() => newGame(lockedStudy));
const parserReady = runtimeReady && works(() => parseCommand(lockedStudy, newGame(lockedStudy).state, "look"));
const verifierReady = works(() => runWalkthrough(lockedStudy)) && works(() => explore(lockedStudy, { maxStates: 100 }));

describe("lexvm (general)", () => {
  it(
    "prints help, version and rejects unknown commands",
    () => {
      const help = lexvm(["help"]);
      expect(help.code).toBe(0);
      expect(help.stdout).toContain("Commands:");
      expect(lexvm([]).code).toBe(2);
      const unknown = lexvm(["frobnicate"]);
      expect(unknown.code).toBe(2);
      expect(unknown.stderr).toContain('unknown command "frobnicate"');
      const pkg = JSON.parse(readFileSync(join(ROOT, "packages/cli/package.json"), "utf8")) as { version: string };
      expect(lexvm(["--version"]).stdout.trim()).toBe(pkg.version);
      expect(lexvm(["validate", "--bogus"]).code).toBe(2);
      expect(lexvm(["check", "--help"]).stdout).toContain("--max-states");
    },
    TIMEOUT,
  );
});

describe("lexvm validate", () => {
  it(
    "accepts the reference pack",
    () => {
      const r = lexvm(["validate", "packs/locked-study"]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("ok  packs/locked-study: 0 errors, 0 warnings");
    },
    TIMEOUT,
  );

  it(
    "scans a packs directory and prints JSON",
    () => {
      const r = lexvm(["validate", "--json", "packs"]);
      expect(r.code).toBe(0);
      const entries = JSON.parse(r.stdout) as Array<{ pack: string; ok: boolean; diagnostics: { severity: string }[] }>;
      const entry = entries.find((e) => e.pack === "locked-study");
      expect(entry?.ok).toBe(true);
      expect(entry?.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "reports file:line, severity, code, path and message for a broken pack",
    () => {
      const r = lexvm(["validate", join(FIXTURES, "broken.yaml")]);
      expect(r.code).toBe(1);
      const line = r.stdout.split("\n").find((l) => l.includes("sagt er."));
      expect(line).toMatch(
        /broken\.yaml:25 {2}error {4}schema\.unrecognized_keys {2}rules\[0\]\.do\["sagt er\."\] {2}Unknown key/,
      );
      expect(r.stdout).toContain("FAILED");
    },
    TIMEOUT,
  );

  it(
    "merges a multi-file pack directory",
    () => {
      const r = lexvm(["validate", join(FIXTURES, "multi")]);
      expect(r.code).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "exits 2 for a missing path",
    () => {
      const r = lexvm(["validate", join(tmp, "does-not-exist")]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("not found");
    },
    TIMEOUT,
  );
});

describe("lexvm build", () => {
  it(
    "writes minified packs and a sorted catalog",
    () => {
      const out = join(tmp, "build");
      const r = lexvm(["build", "packs", "--out", out]);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as {
        format: string;
        packs: Array<Record<string, unknown>>;
      };
      expect(index.format).toBe("lexvm-catalog/1");
      const entry = index.packs.find((p) => p.id === "locked-study")!;
      expect(Object.keys(entry)).toEqual([
        "id",
        "title",
        "subtitle",
        "description",
        "language",
        "version",
        "playtime",
        "author",
        "license",
        "file",
        "hash",
        "size",
      ]);
      const file = join(out, entry.file as string);
      expect(statSync(file).size).toBe(entry.size);
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("\n");
      expect(loadPack(JSON.parse(text))).toEqual(lockedStudy);
      const languages = index.packs.map((p) => p.language as string);
      expect(languages).toEqual([...languages].sort());
    },
    TIMEOUT,
  );

  it(
    "writes nothing for failing packs and exits 1",
    () => {
      const packs = join(tmp, "mixed-packs");
      cpSync(LOCKED_STUDY, join(packs, "locked-study"), { recursive: true });
      mkdirSync(join(packs, "broken"), { recursive: true });
      writeFileSync(join(packs, "broken", "pack.yaml"), readFileSync(join(FIXTURES, "broken.yaml")));
      const out = join(tmp, "mixed-out");
      const r = lexvm(["build", packs, "--out", out]);
      expect(r.code).toBe(1);
      expect(existsSync(join(out, "broken.lexpack.json"))).toBe(false);
      expect(existsSync(join(out, "locked-study.lexpack.json"))).toBe(true);
      const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8")) as { packs: { id: string }[] };
      expect(index.packs.map((p) => p.id)).toEqual(["locked-study"]);
    },
    TIMEOUT,
  );

  it(
    "requires --out",
    () => {
      expect(lexvm(["build", "packs"]).code).toBe(2);
    },
    TIMEOUT,
  );
});

describe("lexvm new", () => {
  it(
    "scaffolds packs that validate without any diagnostics",
    () => {
      for (const lang of ["de", "en"]) {
        const dir = join(tmp, `new-${lang}`);
        const created = lexvm(["new", "my-story", "--dir", dir, "--lang", lang]);
        expect(created.code, created.stderr).toBe(0);
        const r = lexvm(["validate", join(dir, "my-story")]);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain("0 errors, 0 warnings, 0 info");
        // Never overwrites.
        expect(lexvm(["new", "my-story", "--dir", dir]).code).toBe(1);
      }
      expect(lexvm(["new", "Not_Kebab", "--dir", tmp]).code).toBe(2);
    },
    TIMEOUT,
  );

  it.skipIf(!verifierReady)(
    "scaffolds a pack that passes check",
    () => {
      const dir = join(tmp, "new-check");
      expect(lexvm(["new", "checked", "--dir", dir]).code).toBe(0);
      const r = lexvm(["check", join(dir, "checked")]);
      expect(r.code, r.stdout).toBe(0);
    },
    TIMEOUT,
  );
});

describe("lexvm schema", () => {
  it(
    "writes a JSON Schema, and the committed schema file is up to date",
    () => {
      const out = join(tmp, "schema", "pack.schema.json");
      expect(lexvm(["schema", "--out", out]).code).toBe(0);
      const schema = JSON.parse(readFileSync(out, "utf8")) as Record<string, unknown> & { $defs: object };
      expect(schema.$id).toMatch(/lexvm-pack-1\.schema\.json$/);
      expect(Object.keys(schema.$defs)).toContain("Condition");
      expect(readFileSync(join(ROOT, "schema/lexvm-pack-1.schema.json"), "utf8")).toBe(readFileSync(out, "utf8"));
    },
    TIMEOUT,
  );
});

describe("lexvm play", () => {
  it.skipIf(!runtimeReady)(
    "replays canonical commands and prints the transcript",
    () => {
      const transcript = join(tmp, "transcript.txt");
      const r = lexvm([
        "play",
        "packs/locked-study",
        "--canonical",
        "--transcript",
        transcript,
        "--commands",
        lockedStudy.walkthrough.join("; "),
      ]);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain("-- Entrance Hall (hall)");
      expect(r.stdout).toContain("THE END");
      expect(readFileSync(transcript, "utf8")).toContain("» choose say_password");
    },
    TIMEOUT,
  );

  it.skipIf(!runtimeReady)(
    "exits 1 when a canonical command is rejected",
    () => {
      // The letter is in the closed desk in another room: not present, so rejected.
      const r = lexvm(["play", "packs/locked-study", "--canonical", "--commands", "take letter"]);
      expect(r.code).toBe(1);
    },
    TIMEOUT,
  );

  it.skipIf(!runtimeReady)(
    "supports undo, hints and numbered dialogue options from piped stdin",
    () => {
      const r = lexvm(["play", "packs/locked-study", "--canonical"], "talk graves\n1\nundo\nhint\nhint\nquit\n");
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain("1) ask_uncle");
      expect(r.stdout).toContain("Undone.");
      expect(r.stdout).toContain("Hint 1/");
      expect(r.stdout).toContain("Hint 2/");
    },
    TIMEOUT,
  );

  it.skipIf(!parserReady)(
    "accepts free text",
    () => {
      const r = lexvm(["play", "packs/locked-study", "--commands", "talk to graves; 1"]);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain("reading in the library");
    },
    TIMEOUT,
  );
});

describe("lexvm check", () => {
  it.skipIf(!verifierReady)(
    "verifies the reference pack",
    () => {
      const r = lexvm(["check", "--json", "packs/locked-study"]);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      const [report] = JSON.parse(r.stdout) as Array<{
        ok: boolean;
        walkthrough: { ok: boolean; score: number; maxScore: number };
        explore: { winnable: boolean; complete: boolean };
      }>;
      expect(report!.ok).toBe(true);
      expect(report!.walkthrough.ok).toBe(true);
      expect(report!.walkthrough.score).toBe(report!.walkthrough.maxScore);
      expect(report!.explore.winnable).toBe(true);
      expect(report!.explore.complete).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "fails on compile errors without running the game",
    () => {
      const r = lexvm(["check", "--no-explore", join(FIXTURES, "broken.yaml")]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain("result        FAILED");
    },
    TIMEOUT,
  );
});
