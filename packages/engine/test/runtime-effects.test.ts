import { describe, expect, it } from "vitest";
import { newGame, step } from "../src/runtime.ts";
import type { Pack } from "../src/schema.ts";
import { last, linesOf, makePack, play, textOf } from "./fixtures/runtime/helpers.ts";

/** A pack where `push button` runs the given effects. */
function packWith(effects: unknown, extra: Record<string, unknown> = {}): Pack {
  return makePack({
    start: { room: "hall" },
    flags: { f: false, g: true },
    counters: { c: 2 },
    maxScore: 10,
    rooms: {
      hall: { name: "Hall", description: "A hall.", exits: { north: { to: "attic" } } },
      attic: { name: "Attic", description: "Dusty." },
    },
    objects: {
      button: { name: "button", location: "hall" },
      lamp: { name: "lamp", location: "hall", portable: true },
      chest: { name: "chest", location: "hall", container: true, openable: true },
      ghost: { name: "ghost", location: "hall", hidden: true },
      clue: { name: "odd clue", location: "nowhere", clue: true },
      npc: { name: "Ann", location: "hall", npc: true },
    },
    dialogues: {
      chat: {
        with: "npc",
        start: "hi",
        nodes: { hi: { say: "Hello.", options: [{ id: "bye", text: "Bye." }] } },
      },
    },
    endings: {
      won: { title: "Won", text: "You won.", win: true },
    },
    rules: [{ id: "fx", on: { verb: "push", object: "button" }, do: effects }],
    ...extra,
  });
}

/** An `if` effect. `then` is a key of the effect DSL, not a thenable. */
function iff(when: unknown, thenEffects: unknown, elseEffects?: unknown) {
  // biome-ignore lint/suspicious/noThenProperty: data key of the effect DSL, never a function
  const body: Record<string, unknown> = { when, then: thenEffects };
  if (elseEffects !== undefined) body.else = elseEffects;
  return { if: body };
}

function push(effects: unknown, extra?: Record<string, unknown>) {
  const pack = packWith(effects, extra);
  const { results } = play(pack, ["push button"]);
  return last(results);
}

describe("effects", () => {
  it("say prints text paragraphs", () => {
    const r = push({ say: "One.\n\nTwo." });
    expect(linesOf(r.output, "text")).toEqual(["One.", "Two."]);
  });

  it("move relocates an object silently", () => {
    const r = push({ move: { object: "lamp", to: "inventory" } });
    expect(r.state.objects.lamp?.location).toBe("inventory");
    expect(linesOf(r.output, "text")).toEqual([]);
  });

  it("goto moves the player, prints the room and fires enter rules", () => {
    const r = push([{ goto: "attic" }, { say: "After." }], {
      rules: [
        { id: "fx", on: { verb: "push", object: "button" }, do: [{ goto: "attic" }, { say: "After." }] },
        { id: "arrive", on: { event: "enter", room: "attic" }, do: { say: "Creak." } },
      ],
    });
    expect(r.state.room).toBe("attic");
    expect(r.state.visited).toEqual(["hall", "attic"]);
    expect(linesOf(r.output, "room-title")).toEqual(["Attic"]);
    expect(linesOf(r.output, "text")).toEqual(["Dusty.", "Creak.", "After."]);
  });

  it("set, clear and counter add/set", () => {
    const r = push([{ set: "f" }, { clear: "g" }, { counter: { name: "c", add: 3 } }]);
    expect(r.state.flags).toEqual({ f: true, g: false });
    expect(r.state.counters.c).toBe(5);
    const s = push([{ counter: { name: "c", set: -1 } }, { counter: { name: "c", add: -2 } }]);
    expect(s.state.counters.c).toBe(-3);
  });

  it("later effects see earlier changes", () => {
    const r = push([{ set: "f" }, iff({ flag: "f" }, [{ say: "yes" }], [{ say: "no" }])]);
    expect(linesOf(r.output, "text")).toEqual(["yes"]);
  });

  it("open, close, lock, unlock are silent state changes", () => {
    let r = push([{ open: "chest" }, { lock: "chest" }]);
    expect(r.state.objects.chest).toMatchObject({ open: true, locked: true });
    r = push([{ open: "chest" }, { close: "chest" }, { lock: "chest" }, { unlock: "chest" }]);
    expect(r.state.objects.chest).toMatchObject({ open: false, locked: false });
    expect(linesOf(r.output, "text")).toEqual([]);
  });

  it("reveal and hide", () => {
    let r = push({ reveal: "ghost" });
    expect(r.state.objects.ghost?.hidden).toBe(false);
    r = push({ hide: "lamp" });
    expect(r.state.objects.lamp?.hidden).toBe(true);
  });

  it("learn puts a clue into the notebook once and announces it", () => {
    const pack = packWith({ learn: "clue" });
    const { results } = play(pack, ["push button", "push button"]);
    const [first, second] = results;
    expect(first?.state.objects.clue?.location).toBe("inventory");
    expect(linesOf(first?.output ?? [], "system")).toEqual(["New in your notebook: odd clue."]);
    expect(first?.output.find((b) => b.kind === "system")?.spans).toContainEqual({ text: "odd clue", ref: "clue" });
    expect(linesOf(second?.output ?? [], "system")).toEqual([]);
  });

  it("dialogue starts a conversation and endDialogue leaves it", () => {
    let r = push({ dialogue: "chat" });
    expect(r.state.dialogue).toEqual({ id: "chat", node: "hi" });
    expect(linesOf(r.output, "npc")).toEqual(["Hello."]);
    r = push([{ dialogue: "chat" }, { endDialogue: true }]);
    expect(r.state.dialogue).toBeNull();
  });

  it("score adds points and announces them", () => {
    expect(linesOf(push({ score: 1 }).output, "system")).toEqual(["+1 point."]);
    const r = push([{ score: 3 }, { score: -1 }, { score: 0 }]);
    expect(r.state.score).toBe(2);
    expect(linesOf(r.output, "system")).toEqual(["+3 points.", "-1 points."]);
  });

  it("end stops the remaining effects, prints the ending and ends the game", () => {
    const r = push([{ say: "before" }, { end: "won" }, { say: "after" }, { set: "f" }]);
    expect(r.state.ended).toBe("won");
    expect(r.state.flags.f).toBe(false);
    expect(linesOf(r.output, "text")).toEqual(["before"]);
    expect(linesOf(r.output, "ending")).toEqual(["Won", "You won."]);
    expect(linesOf(r.output, "system")).toEqual(["Score: 0 of 10."]);
  });

  it("end inside a nested if also stops the outer effects", () => {
    const r = push([iff({ flag: "g" }, [{ end: "won" }, { say: "x" }]), { say: "y" }]);
    expect(r.state.ended).toBe("won");
    expect(textOf(r.output)).not.toMatch(/\b[xy]\b/);
  });

  it("look describes the current room", () => {
    const r = push({ look: true });
    expect(linesOf(r.output, "room-title")).toEqual(["Hall"]);
  });

  it("if picks then or else; a missing else does nothing", () => {
    expect(linesOf(push(iff({ flag: "f" }, { say: "t" }, { say: "e" })).output, "text")).toEqual(["e"]);
    expect(linesOf(push(iff([{ flag: "g" }], { say: "t" })).output, "text")).toEqual(["t"]);
    expect(linesOf(push(iff({ flag: "f" }, { say: "t" })).output, "text")).toEqual([]);
  });

  it("effects on unknown objects or rooms are ignored", () => {
    const pack = packWith([{ open: "nothing" }, { goto: "nowhere_room" }, { say: "ok" }]);
    const r = step(pack, newGame(pack).state, { verb: "push", object: "button" });
    expect(r.status).toBe("ok");
    expect(linesOf(r.output, "text")).toEqual(["ok"]);
  });
});
