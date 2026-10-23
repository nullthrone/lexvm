/**
 * The exploration step shared by `lexvm check` and the generate gate: the
 * second pass with `drop`, and incomplete explorations as errors.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compile, type Pack } from "@lexvm/engine";
import { describe, expect, it } from "vitest";
import { verifyExploration } from "../src/exploration.ts";
import { REPO_ROOT } from "../src/generate/kit.ts";

function pack(yaml: string): Pack {
  const header = `format: lexvm-pack/1
id: t
version: 1.0.0
title: T
description: D
language: en
author: a
license: CC0-1.0
`;
  const result = compile([{ name: "pack.yaml", text: header + yaml }]);
  if (!result.pack) throw new Error(JSON.stringify(result.diagnostics));
  return result.pack;
}

// The key opens the north exit and later the gate; the lamp lights the one-way way down to the gate.
// Dropping the key in b and going down leaves it behind for good.
const DROP_DEAD_END = `start: { room: a }
rooms:
  a:
    name: A
    description: Room A.
    exits: { north: { to: b, when: { has: key }, blocked: Locked. } }
  b:
    name: B
    description: Room B.
    exits:
      south: { to: a }
      down: { to: c, when: { has: lamp }, blocked: Too dark. }
  c: { name: C, description: Room C., exits: { east: { to: d, door: gate } } }
  d: { name: D, description: Room D. }
objects:
  key: { name: key, location: a, portable: true }
  lamp: { name: lamp, location: a, portable: true }
  gate: { name: gate, location: c, openable: true, locked: true, unlockedBy: key }
rules:
  - { on: { event: enter, room: d }, do: { end: won } }
hints:
  - { id: h, until: { at: d }, steps: [Take everything.] }
endings:
  won: { title: Won, text: You won., win: true }
walkthrough: [take key, take lamp, go north, go down, open gate, go east]
`;

describe("verifyExploration", () => {
  it("finds dead ends that need a dropped item in a second pass", () => {
    const report = verifyExploration(pack(DROP_DEAD_END));
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.deadEnds.length).toBeGreaterThan(0);
    expect(report.deadEnds.every((d) => d.path.some((c) => c.startsWith("drop ")))).toBe(true);
    const dead = report.diagnostics.find((d) => d.code === "explore.dead-end");
    expect(dead?.severity).toBe("error");
    expect(dead?.message).toContain("drop key");
  });

  it("keeps the main result when a rule keeps every item with the player", () => {
    const keep = DROP_DEAD_END.replace("rules:\n", "rules:\n  - { on: { verb: drop }, do: { say: You keep it. } }\n");
    const report = verifyExploration(pack(keep));
    expect(report.deadEnds).toEqual([]);
    expect(report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("says so when the drop pass cannot finish", () => {
    const report = verifyExploration(pack(DROP_DEAD_END), { maxStates: 12 });
    expect(report.complete).toBe(true);
    expect(report.diagnostics.map((d) => d.code)).toContain("explore.drop-incomplete");
    expect(report.diagnostics.find((d) => d.code === "explore.drop-incomplete")?.severity).toBe("info");
  });

  it("treats an incomplete exploration as an error unless allowed", () => {
    const unbounded = pack(`counters: { clock: 0 }
start: { room: hall }
rooms:
  hall:
    name: Hall
    description: A hall with a pit.
    exits:
      down: { to: pit }
      out: { to: yard, visibleWhen: { counter: { name: clock, gte: 3 } } }
  pit: { name: Pit, description: You cannot climb out. }
  yard: { name: Yard, description: Yard. }
rules:
  - { id: tick, on: { event: turn }, do: { counter: { name: clock, add: 1 } } }
  - { id: win, on: { event: enter, room: yard }, do: { end: won } }
hints:
  - { id: h, until: { visited: yard }, steps: [Wait.] }
endings:
  won: { title: Won, text: You won., win: true }
walkthrough: [wait, wait, wait, go out]
`);
    const strict = verifyExploration(unbounded, { maxStates: 500 });
    expect(strict.complete).toBe(false);
    expect(strict.diagnostics).toContainEqual(
      expect.objectContaining({ code: "explore.incomplete", severity: "error" }),
    );
    const allowed = verifyExploration(unbounded, { maxStates: 500, allowIncomplete: true });
    expect(allowed.diagnostics).toContainEqual(
      expect.objectContaining({ code: "explore.incomplete", severity: "warning" }),
    );
    expect(allowed.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("passes the repository packs", async () => {
    for (const id of ["locked-study"]) {
      const text = await readFile(join(REPO_ROOT, `packs/${id}/pack.yaml`), "utf8");
      const result = compile([{ name: "pack.yaml", text }]);
      const report = verifyExploration(result.pack!);
      expect(report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
    }
  });
});
