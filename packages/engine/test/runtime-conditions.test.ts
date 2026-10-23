import { describe, expect, it } from "vitest";
import { evalCondition, evalConditions } from "../src/conditions.ts";
import { isHeld, isPresent, presentObjects, reachableRoot } from "../src/presence.ts";
import { initialState } from "../src/runtime.ts";
import type { Condition } from "../src/schema.ts";
import type { GameState } from "../src/types.ts";
import { makePack } from "./fixtures/runtime/helpers.ts";

const pack = makePack({
  start: { room: "hall" },
  flags: { lit: true, dark: false },
  counters: { tide: 3 },
  rooms: {
    hall: { name: "Hall", description: "A hall." },
    cellar: { name: "Cellar", description: "A cellar." },
  },
  objects: {
    key: { name: "key", location: "inventory", portable: true },
    lamp: { name: "lamp", location: "hall", portable: true },
    box: { name: "box", location: "hall", container: true, openable: true },
    coin: { name: "coin", location: "box", portable: true },
    table: { name: "table", location: "hall", container: true },
    cup: { name: "cup", location: "table", portable: true },
    bag: { name: "bag", location: "inventory", portable: true, container: true, openable: true, open: true },
    pebble: { name: "pebble", location: "bag", portable: true },
    pouch: { name: "pouch", location: "bag", portable: true, container: true, openable: true, open: false },
    gem: { name: "gem", location: "pouch", portable: true },
    door: { name: "door", location: "cellar", alsoIn: ["hall"], openable: true, locked: true },
    ghost: { name: "ghost", location: "hall", hidden: true },
    crate: { name: "crate", location: "hall", container: true, hidden: true },
    nail: { name: "nail", location: "crate", portable: true },
    loop_a: { name: "loop a", location: "loop_b" },
    loop_b: { name: "loop b", location: "loop_a" },
    far: { name: "far thing", location: "cellar" },
    lost: { name: "lost thing", location: "nowhere" },
  },
});

function state(patch: (s: GameState) => void = () => {}): GameState {
  const s = initialState(pack);
  s.visited = ["hall"];
  patch(s);
  return s;
}

const holds = (c: Condition, s = state()) => evalCondition(pack, s, c);

describe("conditions", () => {
  it("has: top-level inventory only", () => {
    expect(holds({ has: "key" })).toBe(true);
    expect(holds({ has: "bag" })).toBe(true);
    expect(holds({ has: "pebble" })).toBe(false);
    expect(holds({ has: "lamp" })).toBe(false);
    expect(holds({ has: "unknown" })).toBe(false);
  });

  it("at, visited", () => {
    expect(holds({ at: "hall" })).toBe(true);
    expect(holds({ at: "cellar" })).toBe(false);
    expect(holds({ visited: "hall" })).toBe(true);
    expect(holds({ visited: "cellar" })).toBe(false);
    expect(
      holds(
        { visited: "cellar" },
        state((s) => s.visited.push("cellar")),
      ),
    ).toBe(true);
  });

  it("here uses presence", () => {
    expect(holds({ here: "lamp" })).toBe(true);
    expect(holds({ here: "pebble" })).toBe(true);
    expect(holds({ here: "coin" })).toBe(false);
    expect(holds({ here: "far" })).toBe(false);
  });

  it("in: exact location", () => {
    expect(holds({ in: { object: "coin", location: "box" } })).toBe(true);
    expect(holds({ in: { object: "coin", location: "hall" } })).toBe(false);
    expect(holds({ in: { object: "lost", location: "nowhere" } })).toBe(true);
    expect(holds({ in: { object: "key", location: "inventory" } })).toBe(true);
  });

  it("flag", () => {
    expect(holds({ flag: "lit" })).toBe(true);
    expect(holds({ flag: "dark" })).toBe(false);
    expect(holds({ flag: "undeclared" })).toBe(false);
  });

  it("counter comparisons: all given must hold", () => {
    expect(holds({ counter: { name: "tide", eq: 3 } })).toBe(true);
    expect(holds({ counter: { name: "tide", eq: 2 } })).toBe(false);
    expect(holds({ counter: { name: "tide", ne: 2 } })).toBe(true);
    expect(holds({ counter: { name: "tide", ne: 3 } })).toBe(false);
    expect(holds({ counter: { name: "tide", gt: 2 } })).toBe(true);
    expect(holds({ counter: { name: "tide", gt: 3 } })).toBe(false);
    expect(holds({ counter: { name: "tide", gte: 3 } })).toBe(true);
    expect(holds({ counter: { name: "tide", gte: 4 } })).toBe(false);
    expect(holds({ counter: { name: "tide", lt: 4 } })).toBe(true);
    expect(holds({ counter: { name: "tide", lt: 3 } })).toBe(false);
    expect(holds({ counter: { name: "tide", lte: 3 } })).toBe(true);
    expect(holds({ counter: { name: "tide", lte: 2 } })).toBe(false);
    expect(holds({ counter: { name: "tide", gte: 1, lt: 5 } })).toBe(true);
    expect(holds({ counter: { name: "tide", gte: 1, lt: 3 } })).toBe(false);
    expect(holds({ counter: { name: "missing", eq: 0 } })).toBe(true);
  });

  it("isOpen, isLocked", () => {
    expect(holds({ isOpen: "bag" })).toBe(true);
    expect(holds({ isOpen: "box" })).toBe(false);
    expect(holds({ isLocked: "door" })).toBe(true);
    expect(holds({ isLocked: "box" })).toBe(false);
  });

  it("not, all, any", () => {
    expect(holds({ not: { flag: "dark" } })).toBe(true);
    expect(holds({ all: [{ flag: "lit" }, { at: "hall" }] })).toBe(true);
    expect(holds({ all: [{ flag: "lit" }, { flag: "dark" }] })).toBe(false);
    expect(holds({ all: [] })).toBe(true);
    expect(holds({ any: [{ flag: "dark" }, { at: "hall" }] })).toBe(true);
    expect(holds({ any: [{ flag: "dark" }, { at: "cellar" }] })).toBe(false);
    expect(holds({ any: [] })).toBe(false);
    expect(holds({ not: { any: [{ flag: "dark" }, { all: [{ flag: "lit" }, { has: "lamp" }] }] } })).toBe(true);
  });

  it("a list means all; a missing list always holds", () => {
    const s = state();
    expect(evalConditions(pack, s, undefined)).toBe(true);
    expect(evalConditions(pack, s, [])).toBe(true);
    expect(evalConditions(pack, s, [{ flag: "lit" }, { at: "hall" }])).toBe(true);
    expect(evalConditions(pack, s, [{ flag: "lit" }, { at: "cellar" }])).toBe(false);
  });
});

describe("presence", () => {
  it("objects in the room and in the inventory are present", () => {
    const s = state();
    expect(isPresent(pack, s, "lamp")).toBe(true);
    expect(isPresent(pack, s, "key")).toBe(true);
    expect(isPresent(pack, s, "far")).toBe(false);
    expect(isPresent(pack, s, "lost")).toBe(false);
  });

  it("closed openable containers hide their contents; open or non-openable ones pass presence", () => {
    expect(isPresent(pack, state(), "coin")).toBe(false);
    expect(
      isPresent(
        pack,
        state((s) => (s.objects.box = { ...s.objects.box!, open: true })),
        "coin",
      ),
    ).toBe(true);
    expect(isPresent(pack, state(), "cup")).toBe(true);
  });

  it("resolves nested containers in the inventory", () => {
    const s = state();
    expect(isPresent(pack, s, "pebble")).toBe(true);
    expect(isHeld(pack, s, "pebble")).toBe(true);
    expect(isPresent(pack, s, "gem")).toBe(false);
    const opened = state((x) => (x.objects.pouch = { ...x.objects.pouch!, open: true }));
    expect(isPresent(pack, opened, "gem")).toBe(true);
    expect(reachableRoot(pack, opened, "gem")).toBe("inventory");
    const closedBag = state((x) => (x.objects.bag = { ...x.objects.bag!, open: false }));
    expect(isPresent(pack, closedBag, "pebble")).toBe(false);
    expect(isPresent(pack, closedBag, "bag")).toBe(true);
  });

  it("hidden objects are absent, and so is everything inside them", () => {
    const s = state();
    expect(isPresent(pack, s, "ghost")).toBe(false);
    expect(isPresent(pack, s, "crate")).toBe(false);
    expect(isPresent(pack, s, "nail")).toBe(false);
    const revealed = state((x) => (x.objects.crate = { ...x.objects.crate!, hidden: false }));
    expect(isPresent(pack, revealed, "nail")).toBe(true);
  });

  it("alsoIn makes the object itself present in the listed rooms", () => {
    expect(isPresent(pack, state(), "door")).toBe(true);
    expect(
      isPresent(
        pack,
        state((s) => (s.room = "cellar")),
        "door",
      ),
    ).toBe(true);
    const hiddenDoor = state((s) => (s.objects.door = { ...s.objects.door!, hidden: true }));
    expect(isPresent(pack, hiddenDoor, "door")).toBe(false);
  });

  it("treats location cycles as absent", () => {
    const s = state();
    expect(reachableRoot(pack, s, "loop_a")).toBeNull();
    expect(isPresent(pack, s, "loop_a")).toBe(false);
  });

  it("presentObjects splits room and inventory in pack order", () => {
    const p = presentObjects(pack, state(), Object.keys(pack.objects));
    expect(p.room).toEqual(["lamp", "box", "table", "cup", "door"]);
    expect(p.inv).toEqual(["key", "bag", "pebble", "pouch"]);
  });
});
