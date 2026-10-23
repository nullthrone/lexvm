/**
 * Performance smoke test: a synthetic pack of realistic size must compile
 * cleanly, replay its walkthrough and be explored completely within seconds.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.ts";
import { explore } from "../src/explore.ts";
import { runWalkthrough } from "../src/walkthrough.ts";
import { syntheticPack } from "./fixtures/runtime/synthetic.ts";

describe("exploration performance", () => {
  it("explores a realistic synthetic pack completely and quickly", () => {
    const input = syntheticPack();
    expect(Object.keys(input.rooms as object)).toHaveLength(12);
    expect(Object.keys(input.objects as object)).toHaveLength(30);
    expect(Object.keys(input.flags as object)).toHaveLength(40);

    const { pack, diagnostics } = compile([{ name: "pack.json", text: JSON.stringify(input) }]);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    if (pack === null) throw new Error("synthetic pack did not compile");

    const walk = runWalkthrough(pack);
    expect(walk.diagnostics).toEqual([]);
    expect(walk.ok).toBe(true);
    expect(walk.score).toBe(2);

    const t0 = Date.now();
    const report = explore(pack);
    const ms = Date.now() - t0;
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.deadEnds).toEqual([]);
    expect(report.losingEndings).toEqual([]);
    expect(report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    expect(report.unreached.rooms).toEqual([]);
    expect(report.shortestWin?.at(-1)).toBe("push statue");
    expect(report.shortestWin!.length).toBeLessThanOrEqual(walk.steps.length);
    // Generous bound for slow CI machines; typically well under a second.
    expect(ms, `${report.states} states in ${ms} ms`).toBeLessThan(30_000);
  }, 60_000);
});
