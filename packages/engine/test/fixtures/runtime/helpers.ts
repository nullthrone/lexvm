/**
 * Test helpers for the runtime tests. Packs are loaded with
 * PackSchema.parse(parse(yaml)) so these tests do not depend on loadPack/compile.
 */
import { parse } from "yaml";
import { parseCanonical } from "../../../src/commands.ts";
import { compile } from "../../../src/compile.ts";
import { newGame, step } from "../../../src/runtime.ts";
import { type Pack, PackSchema } from "../../../src/schema.ts";
import type { GameState, OutputBlock, StepResult } from "../../../src/types.ts";

export function packFromYaml(text: string): Pack {
  return PackSchema.parse(parse(text));
}

/** Build a pack from partial input, filling the required metadata. */
export function makePack(input: Record<string, unknown>): Pack {
  return PackSchema.parse({
    format: "lexvm-pack/1",
    id: "test-pack",
    version: "1.0.0",
    title: "Test",
    description: "A test pack.",
    language: "en",
    author: "tests",
    license: "CC0-1.0",
    endings: { won: { title: "Won", text: "You won.", win: true } },
    walkthrough: ["wait"],
    ...input,
  });
}

interface NodeFs {
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
}

/**
 * Read a file relative to the repository root. The engine's tsconfig has no
 * Node types (the engine must not use Node APIs), so fs is fetched untyped.
 */
export function readRepoFile(relative: string): string {
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
  const fs = proc.getBuiltinModule("node:fs") as NodeFs;
  for (const prefix of ["", "../", "../../", "../../../"]) {
    const path = prefix + relative;
    if (fs.existsSync(path)) return fs.readFileSync(path, "utf8");
  }
  throw new Error(`file not found from the working directory: ${relative}`);
}

export function loadFixture(name: string): Pack {
  return packFromYaml(readRepoFile(`packages/engine/test/fixtures/runtime/${name}`));
}

export function loadLockedStudy(): Pack {
  return packFromYaml(readRepoFile("packs/locked-study/pack.yaml"));
}

/** A repository pack of several YAML files (packs/<id>/*.yaml), compiled. */
export function loadRepoPack(id: string): Pack {
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
  const fs = proc.getBuiltinModule("node:fs") as NodeFs & { readdirSync(path: string): string[] };
  const dir = ["", "../", "../../", "../../../"].map((prefix) => `${prefix}packs/${id}`).find((d) => fs.existsSync(d));
  if (dir === undefined) throw new Error(`pack not found: ${id}`);
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => ({ name, text: fs.readFileSync(`${dir}/${name}`, "utf8") }));
  const result = compile(files);
  if (result.pack === null) throw new Error(`pack ${id} does not compile`);
  return result.pack;
}

/** Recursively freeze a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Plain text of all blocks, joined by newlines. */
export function textOf(blocks: OutputBlock[]): string {
  return blocks.map((b) => b.spans.map((s) => s.text).join("")).join("\n");
}

/** Blocks of one kind as plain strings. */
export function linesOf(blocks: OutputBlock[], kind: OutputBlock["kind"]): string[] {
  return blocks.filter((b) => b.kind === kind).map((b) => b.spans.map((s) => s.text).join(""));
}

/** Play canonical commands from a new game; throws on malformed commands. Returns every step's result. */
export function play(
  pack: Pack,
  commands: string[],
): { state: GameState; results: StepResult[]; start: OutputBlock[] } {
  const game = newGame(pack);
  let state = game.state;
  const results: StepResult[] = [];
  for (const text of commands) {
    const cmd = parseCanonical(text);
    if (!cmd) throw new Error(`malformed command: ${text}`);
    const r = step(pack, state, cmd);
    results.push(r);
    state = r.state;
  }
  return { state, results, start: game.output };
}

/** The result of the last step of play(). */
export function last(results: StepResult[]): StepResult {
  const r = results[results.length - 1];
  if (!r) throw new Error("no steps");
  return r;
}
