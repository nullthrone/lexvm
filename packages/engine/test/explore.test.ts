import { describe, expect, it } from "vitest";
import { explore } from "../src/explore.ts";
import { step } from "../src/runtime.ts";
import { loadFixture, loadLockedStudy, makePack, play } from "./fixtures/runtime/helpers.ts";

describe("explore", () => {
  it("locked-study: complete, winnable, no dead ends, no losing endings, everything reached", () => {
    const pack = loadLockedStudy();
    const t0 = Date.now();
    const report = explore(pack);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.deadEnds).toEqual([]);
    expect(report.losingEndings).toEqual([]);
    expect(report.diagnostics).toEqual([]);
    expect(report.unreached).toEqual({ rooms: [], endings: [], rules: [], options: [] });
    expect(report.states).toBeGreaterThan(10);
    expect(report.shortestWin?.at(-1)).toBe("choose say_password");
    // The shortest win replays to a winning ending.
    const { state } = play(pack, report.shortestWin ?? []);
    expect(state.ended).toBe("found_uncle");
  });

  it("German fixture: complete and winnable without dead ends", () => {
    const report = explore(loadFixture("hafen.yaml"));
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("detects a dead end and reports the fatal command", () => {
    const report = explore(loadFixture("dead-end.yaml"));
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.deadEnds).toEqual([{ path: ["use key drain"] }]);
    const d = report.diagnostics.find((x) => x.code === "explore.dead-end");
    expect(d).toMatchObject({ severity: "error", path: "rooms.cell" });
    expect(d?.message).toContain('"use key drain"');
    expect(d?.message).toContain("last room: cell");
    expect(report.shortestWin).toEqual(["take key", "open cell_door", "go out"]);
    const { state } = play(loadFixture("dead-end.yaml"), report.shortestWin ?? []);
    expect(state.ended).toBe("free");
  });

  it("detects losing endings and reports unreached content as info", () => {
    const report = explore(loadFixture("losing-ending.yaml"));
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(true);
    expect(report.shortestWin).toEqual(["pull lever"]);
    expect(report.losingEndings).toEqual([{ ending: "poisoned", path: ["use vial"] }]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "explore.losing-ending", path: "endings.poisoned" }),
    );
    expect(report.unreached.endings).toEqual(["forgotten"]);
    expect(report.unreached.rules).toEqual(["never"]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "info", code: "explore.unreached-ending", path: "endings.forgotten" }),
    );
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "info", code: "explore.unreached-rule", path: "rules[2]" }),
    );
  });

  it("reports unwinnable packs", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms: {
        hall: { name: "Hall", description: "A hall.", exits: { north: { to: "attic" } } },
        attic: { name: "Attic", description: "Dust." },
      },
      dialogues: { lonely: { start: "a", nodes: { a: { say: "Hm.", options: [{ id: "never", text: "Never." }] } } } },
    });
    const report = explore(pack);
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(false);
    expect(report.shortestWin).toBeNull();
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "explore.not-winnable" }),
    );
    expect(report.diagnostics.some((d) => d.code === "explore.dead-end")).toBe(false);
    expect(report.unreached.endings).toEqual(["won"]);
    expect(report.unreached.options).toEqual(["lonely.never"]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "explore.unreached-option", path: "dialogues.lonely.nodes.a.options[0]" }),
    );
  });

  it("stops at maxStates and reports an incomplete exploration", () => {
    const pack = makePack({
      start: { room: "hall" },
      counters: { n: 0 },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: { crank: { name: "crank", location: "hall" } },
      rules: [
        { on: { verb: "push", object: "crank" }, do: { counter: { name: "n", add: 1 } } },
        { on: { verb: "pull", object: "crank" }, when: { counter: { name: "n", gte: 1000 } }, do: { end: "won" } },
      ],
    });
    const report = explore(pack, { maxStates: 50 });
    expect(report.complete).toBe(false);
    expect(report.states).toBe(50);
    expect(report.diagnostics).toEqual([expect.objectContaining({ severity: "warning", code: "explore.incomplete" })]);
    expect(report.deadEnds).toEqual([]);
  });

  it("explores turn rules through a neutral command", () => {
    const pack = makePack({
      start: { room: "hall" },
      counters: { tide: 0 },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: { boat: { name: "boat", location: "hall" } },
      rules: [
        {
          on: { event: "turn" },
          when: { counter: { name: "tide", lt: 3 } },
          do: { counter: { name: "tide", add: 1 } },
        },
        { on: { verb: "push", object: "boat" }, when: { counter: { name: "tide", gte: 3 } }, do: { end: "won" } },
      ],
    });
    const report = explore(pack);
    expect(report.winnable).toBe(true);
    expect(report.shortestWin).toEqual(["wait", "wait", "wait", "push boat"]);
    expect(report.deadEnds).toEqual([]);
  });

  it("finds rules on objects that only the parser can reach and two-object rules in both orders", () => {
    const pack = makePack({
      start: { room: "hall" },
      flags: { spliced: false },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: {
        rope: { name: "rope", location: "hall" },
        hook: { name: "hook", location: "hall" },
        statue: { name: "statue", location: "hall" },
      },
      rules: [
        { on: { verb: "use", object: "hook", with: "rope" }, do: { set: "spliced" } },
        { on: { verb: "take", object: "statue" }, when: { flag: "spliced" }, do: { end: "won" } },
      ],
    });
    const report = explore(pack);
    expect(report.winnable).toBe(true);
    expect(report.shortestWin?.at(-1)).toBe("take statue");
    expect(report.deadEnds).toEqual([]);
  });

  it("includeDrop explores dropping items", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: { coin: { name: "coin", location: "inventory", portable: true } },
      rules: [{ on: { event: "turn" }, when: { in: { object: "coin", location: "hall" } }, do: { end: "won" } }],
    });
    expect(explore(pack).winnable).toBe(false);
    const withDrop = explore(pack, { includeDrop: true });
    expect(withDrop.winnable).toBe(true);
    expect(withDrop.shortestWin).toEqual(["drop coin"]);
  });

  it("is deterministic", () => {
    const pack = loadLockedStudy();
    expect(explore(pack)).toEqual(explore(pack));
  });

  it("never reports states that the runtime rejects", () => {
    const pack = loadLockedStudy();
    const report = explore(pack);
    let state = play(pack, []).state;
    for (const c of report.shortestWin ?? []) {
      const [verb, object, w] = c.split(" ");
      const r = step(pack, state, { verb: verb ?? "", ...(object ? { object } : {}), ...(w ? { with: w } : {}) });
      expect(r.status).toBe("ok");
      state = r.state;
    }
  });
});
