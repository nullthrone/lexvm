import { describe, expect, it } from "vitest";
import { explore, exploreWith } from "../src/explore.ts";
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
    // Nothing is proven: an error, which `lexvm check --allow-incomplete` downgrades.
    expect(report.diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "explore.incomplete" })]);
    expect(report.deadEnds).toEqual([]);
  });

  it("explores turn rules through a neutral command", () => {
    const pack = makePack({
      start: { room: "hall" },
      counters: { tide: 0 },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: { boat: { name: "boat", location: "hall", verbs: ["push"] } },
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

  const statuePack = (statueVerbs: string[]) =>
    makePack({
      start: { room: "hall" },
      flags: { spliced: false },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: {
        rope: { name: "rope", location: "hall" },
        hook: { name: "hook", location: "hall" },
        statue: { name: "statue", location: "hall", verbs: statueVerbs },
      },
      rules: [
        { on: { verb: "use", object: "hook", with: "rope" }, do: { set: "spliced" } },
        { on: { verb: "take", object: "statue" }, when: { flag: "spliced" }, do: { end: "won" } },
      ],
    });

  it("finds rules on non-portable objects and two-object rules in both orders", () => {
    // 'take' on scenery is offered only because the statue lists it.
    const report = explore(statuePack(["take"]));
    expect(report.winnable).toBe(true);
    expect(report.shortestWin?.at(-1)).toBe("take statue");
    expect(report.deadEnds).toEqual([]);
    expect(report.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("judges winnability by offered actions: a typed-only solution does not count", () => {
    const report = explore(statuePack([]));
    expect(report.complete).toBe(true);
    expect(report.winnable).toBe(false);
    expect(report.shortestWin).toBeNull();
    expect(report.deadEnds).toEqual([]);
    const d = report.diagnostics.find((x) => x.code === "explore.not-winnable");
    expect(d?.severity).toBe("error");
    expect(d?.message).toContain('"take statue"');
    expect(d?.message).toContain("verbs");
    expect(report.diagnostics.filter((x) => x.severity === "error")).toHaveLength(1);
  });

  const leverPack = (rules: unknown[]) =>
    makePack({
      start: { room: "hall" },
      flags: { jammed: false },
      rooms: { hall: { name: "Hall", description: "A {lever} in the wall." } },
      objects: { lever: { name: "lever", location: "hall", verbs: ["pull", "push"] } },
      rules,
    });

  it("reports tap dead ends that only a typed command could escape", () => {
    const report = explore(
      leverPack([
        { on: { verb: "pull", object: "lever" }, when: { not: { flag: "jammed" } }, do: { end: "won" } },
        { on: { verb: "push", object: "lever" }, do: { set: "jammed" } },
        { on: { verb: "take", object: "lever" }, when: { flag: "jammed" }, do: { end: "won" } },
      ]),
    );
    expect(report.winnable).toBe(true);
    expect(report.shortestWin).toEqual(["pull lever"]);
    expect(report.deadEnds).toEqual([{ path: ["push lever"] }]);
    const d = report.diagnostics.find((x) => x.code === "explore.dead-end");
    expect(d?.message).toContain("Dead end for tap players");
    expect(d?.message).toContain('"take lever"');
  });

  it("reports dead ends that only typed commands reach", () => {
    const report = explore(
      leverPack([
        { on: { verb: "pull", object: "lever" }, when: { not: { flag: "jammed" } }, do: { end: "won" } },
        { on: { verb: "take", object: "lever" }, do: { set: "jammed" } },
      ]),
    );
    expect(report.winnable).toBe(true);
    expect(report.deadEnds).toEqual([{ path: ["take lever"] }]);
    const d = report.diagnostics.find((x) => x.code === "explore.dead-end");
    expect(d?.message).toContain("(typed commands)");
  });

  it("counts give/show from either side of the action sheet as offered", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: {
        coin: { name: "coin", location: "inventory", portable: true },
        note: { name: "note", location: "nowhere", clue: true },
        clerk: { name: "clerk", location: "hall", npc: true },
      },
      rules: [
        { on: { verb: "give", object: "coin", with: "clerk" }, do: { learn: "note" } },
        { on: { verb: "show", object: "note", with: "clerk" }, do: { end: "won" } },
      ],
    });
    const report = explore(pack);
    expect(report.winnable).toBe(true);
    expect(report.shortestWin).toEqual(["give coin clerk", "show note clerk"]);
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

  it("includeDrop keeps track of non-portable objects carried in a container", () => {
    // Dropping the letter (not portable, carried in the bag) leaves it behind for good.
    const pack = makePack({
      start: { room: "a" },
      rooms: {
        a: { name: "A", description: "Room.", exits: { north: { to: "b" } } },
        b: { name: "B", description: "B.", exits: { south: { to: "a" } } },
      },
      objects: {
        bag: { name: "bag", location: "inventory", portable: true, container: true },
        letter: { name: "letter", location: "bag" },
        clerk: { name: "clerk", location: "b", npc: true },
      },
      rules: [{ id: "deliver", on: { verb: "give", object: "letter", with: "clerk" }, do: { end: "won" } }],
    });
    expect(explore(pack).deadEnds).toEqual([]);
    const withDrop = explore(pack, { includeDrop: true });
    expect(withDrop.complete).toBe(true);
    expect(withDrop.deadEnds).toContainEqual({ path: ["drop letter"] });
    expect(exploreWith(pack, { includeDrop: true }, false).deadEnds).toContainEqual({ path: ["drop letter"] });
  });

  it("does not report options of a node reached only through options gated by reduced state", () => {
    // `asked` only gates `more`, which leads to the answer node and back: the reduction drops it,
    // so the answer node is never entered in the representative states, although it is in play.
    const pack = makePack({
      start: { room: "cell" },
      flags: { asked: false },
      rooms: {
        cell: { name: "Cell", description: "A {guard}.", exits: { out: { to: "yard" } } },
        yard: { name: "Yard", description: "Yard." },
      },
      objects: { guard: { name: "guard", location: "cell", npc: true, dialogue: "d" } },
      rules: [{ id: "escape", on: { event: "enter", room: "yard" }, do: { end: "won" } }],
      dialogues: {
        d: {
          with: "guard",
          start: "hub",
          nodes: {
            hub: {
              say: "Yes?",
              options: [
                { id: "ask", text: "Ask", once: true, do: { set: "asked" }, goto: "hub" },
                { id: "more", text: "More", when: { flag: "asked" }, goto: "ans" },
                { id: "bye", text: "Bye" },
              ],
            },
            ans: { say: "The answer.", options: [{ id: "back", text: "Back", goto: "hub" }] },
          },
        },
      },
    });
    for (const reduce of [true, false]) {
      const report = exploreWith(pack, {}, reduce);
      expect(report.unreached.options).toEqual([]);
      expect(report.diagnostics.filter((d) => d.code === "explore.unreached-option")).toEqual([]);
    }
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
