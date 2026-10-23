import { describe, expect, it } from "vitest";
import lockedStudy from "../../../packs/locked-study/pack.yaml?raw";
import { compile } from "../src/compile.ts";
import { loadPack, PackError } from "../src/load.ts";
import type { PackInput } from "../src/schema.ts";
import { basePack } from "./fixtures/compile/base-pack.ts";

function loadError(json: unknown): PackError {
  try {
    loadPack(json);
  } catch (e) {
    if (e instanceof PackError) return e;
    throw e;
  }
  throw new Error("expected loadPack to throw");
}

describe("loadPack", () => {
  it("loads a compiled pack unchanged", () => {
    const compiled = compile([{ name: "pack.yaml", text: lockedStudy }]).pack!;
    const json: unknown = JSON.parse(JSON.stringify(compiled));
    expect(loadPack(json)).toEqual(compiled);
  });

  it("normalises lenient input and does not mutate it", () => {
    const input = basePack();
    const before = JSON.stringify(input);
    const pack = loadPack(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(pack.rules[0]!.when).toEqual([{ not: { flag: "lamp_lit" } }]);
    expect(pack.policy).toBe("forgiving");
  });

  it("does not throw for warnings", () => {
    const input = basePack();
    input.hints = [];
    expect(() => loadPack(input)).not.toThrow();
  });

  it("throws PackError with schema diagnostics for invalid structure", () => {
    const input: Record<string, unknown> = { ...basePack(), rooms: "none" };
    const e = loadError(input);
    expect(e.diagnostics).toHaveLength(1);
    expect(e.diagnostics[0]).toMatchObject({ severity: "error", code: "schema.invalid_type", path: "rooms" });
    expect(e.diagnostics[0]!.file).toBeUndefined();
    expect(e.message).toContain("rooms:");
  });

  it("throws PackError with only the semantic errors", () => {
    const input: PackInput = basePack();
    input.start.room = "nowhere_at_all";
    input.hints = []; // a warning, not part of the error
    const e = loadError(input);
    expect(e.diagnostics.map((d) => d.code)).toEqual(["ref.unknown-room"]);
  });

  it("rejects non-objects", () => {
    for (const value of [null, 42, "pack", [], undefined]) {
      expect(loadError(value).diagnostics[0]!.severity).toBe("error");
    }
  });

  it("survives absurdly deep nesting on untrusted input", () => {
    let condition: unknown = { flag: "lamp_lit" };
    for (let i = 0; i < 50_000; i++) condition = { not: condition };
    const input = basePack() as Record<string, unknown> & PackInput;
    input.rules![0]!.when = condition as never;
    expect(loadError(input).diagnostics[0]!.severity).toBe("error");
  });
});
