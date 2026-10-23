import { describe, expect, it } from "vitest";
import { canonicalJson, hash64, packHash, stateKey } from "../src/hash.ts";
import { newGame, step } from "../src/runtime.ts";
import type { GameState } from "../src/types.ts";
import { loadLockedStudy, packFromYaml, readRepoFile } from "./fixtures/runtime/helpers.ts";

describe("packHash", () => {
  it("is a stable 16-digit hex string", () => {
    const a = loadLockedStudy();
    const b = loadLockedStudy();
    expect(packHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(packHash(a)).toBe(packHash(b));
  });

  it("ignores key order but not content", () => {
    const pack = loadLockedStudy();
    const reordered = Object.fromEntries(Object.entries(pack).reverse()) as typeof pack;
    expect(packHash(reordered)).toBe(packHash(pack));
    const changed = packFromYaml(readRepoFile("packs/locked-study/pack.yaml").replace("Graves", "Groves"));
    expect(packHash(changed)).not.toBe(packHash(pack));
  });

  it("canonical JSON sorts keys and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }], e: null })).toBe('{"a":[{"d":2}],"b":1,"e":null}');
  });

  it("hash64 spreads small differences", () => {
    expect(hash64("a")).not.toBe(hash64("b"));
    expect(hash64("ab")).not.toBe(hash64("ba"));
    expect(hash64("")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("stateKey", () => {
  const pack = loadLockedStudy();
  const s0 = newGame(pack).state;

  it("excludes the turn counter", () => {
    expect(stateKey({ ...s0, turn: 42 })).toBe(stateKey(s0));
    const waited = step(pack, s0, { verb: "wait" }).state;
    expect(waited.turn).toBe(1);
    expect(stateKey(waited)).toBe(stateKey(s0));
  });

  it("is independent of key order and of the order of visited, fired and chosen", () => {
    const a: GameState = { ...s0, visited: ["hall", "library"], fired: ["x", "y"], chosen: ["d.a", "d.b"] };
    const b: GameState = {
      ...a,
      objects: Object.fromEntries(Object.entries(a.objects).reverse()),
      flags: Object.fromEntries(Object.entries(a.flags).reverse()),
      visited: ["library", "hall"],
      fired: ["y", "x"],
      chosen: ["d.b", "d.a"],
    };
    expect(stateKey(b)).toBe(stateKey(a));
  });

  it("distinguishes every part of the logical state", () => {
    const base = stateKey(s0);
    const variants: GameState[] = [
      { ...s0, room: "library" },
      { ...s0, flags: { ...s0.flags, book_moved: true } },
      { ...s0, counters: { x: 1 } },
      { ...s0, objects: { ...s0.objects, desk: { ...s0.objects.desk!, open: true } } },
      { ...s0, objects: { ...s0.objects, brass_key: { ...s0.objects.brass_key!, hidden: false } } },
      { ...s0, objects: { ...s0.objects, letter: { ...s0.objects.letter!, location: "inventory" } } },
      { ...s0, visited: ["hall", "study"] },
      { ...s0, fired: ["enter_study_first"] },
      { ...s0, chosen: ["graves_talk.bye"] },
      { ...s0, dialogue: { id: "graves_talk", node: "hello" } },
      { ...s0, score: 1 },
      { ...s0, ended: "found_uncle" },
    ];
    const keys = variants.map(stateKey);
    for (const k of keys) expect(k).not.toBe(base);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
