import { describe, expect, it } from "vitest";
import { newGame, step, view } from "../src/runtime.ts";
import { objectDescription } from "../src/text.ts";
import type { GameState } from "../src/types.ts";
import { validateState } from "../src/validate-state.ts";
import { loadLockedStudy, makePack, play } from "./fixtures/runtime/helpers.ts";

describe("validateState", () => {
  const pack = loadLockedStudy();
  const start = newGame(pack).state;
  const at = (patch: Partial<GameState>): GameState => ({
    ...(JSON.parse(JSON.stringify(start)) as GameState),
    ...patch,
  });

  it("accepts every state of a walkthrough", () => {
    expect(validateState(pack, start)).toEqual([]);
    const { results } = play(pack, pack.walkthrough);
    results.forEach((r, i) => {
      expect(validateState(pack, r.state), pack.walkthrough[i]).toEqual([]);
    });
  });

  it("rejects ids that are not declared, including inherited property names", () => {
    expect(validateState(pack, at({ room: "constructor" }))).toEqual(['unknown room "constructor"']);
    expect(validateState(pack, at({ dialogue: { id: "constructor", node: "x" } }))).toEqual([
      'unknown dialogue "constructor"',
    ]);
    const talk = step(pack, start, { verb: "talk", object: "graves" }).state;
    expect(talk.dialogue).not.toBeNull();
    const dialogueId = talk.dialogue?.id ?? "";
    expect(validateState(pack, { ...talk, dialogue: { id: dialogueId, node: "toString" } })).toEqual([
      `unknown node "toString" in dialogue "${dialogueId}"`,
    ]);
    expect(validateState(pack, at({ ended: "__proto__" }))).toEqual(['unknown ending "__proto__"']);
    expect(validateState(pack, at({ visited: ["hall", "nowhere_room"] }))).toEqual([
      'unknown visited room "nowhere_room"',
    ]);
    expect(validateState(pack, at({ fired: ["no_such_rule"], chosen: ["x.y"] }))).toEqual([
      'unknown once rule "no_such_rule"',
      'unknown once option "x.y"',
    ]);
  });

  it("requires exactly the pack's objects, flags and counters", () => {
    const objects = { ...start.objects, ghost: { location: "hall", open: false, locked: false, hidden: false } };
    expect(validateState(pack, at({ objects }))).toEqual(['unknown object "ghost"']);
    const firstObject = Object.keys(start.objects)[0] ?? "";
    const { [firstObject]: _gone, ...fewer } = start.objects;
    expect(validateState(pack, at({ objects: fewer }))).toEqual([`missing object "${firstObject}"`]);
    const moved = { ...start.objects, [firstObject]: { ...start.objects[firstObject]!, location: "attic" } };
    expect(validateState(pack, at({ objects: moved }))).toEqual([
      `object "${firstObject}" is in unknown location "attic"`,
    ]);
    expect(validateState(pack, at({ flags: { ...start.flags, extra: true } }))).toEqual(['unknown flag "extra"']);
    expect(validateState(pack, at({ score: Number.NaN }))).toEqual(["score must be a number"]);
  });

  it("rejects a dialogue that offers no option (a soft lock)", () => {
    const soft = makePack({
      start: { room: "r" },
      flags: { done: true },
      rooms: { r: { name: "R", description: "R." } },
      objects: { ann: { name: "Ann", location: "r", npc: true, dialogue: "d" } },
      dialogues: {
        d: {
          with: "ann",
          start: "a",
          nodes: { a: { options: [{ id: "x", text: "X", when: { not: { flag: "done" } } }] } },
        },
      },
    });
    const state: GameState = { ...newGame(soft).state, dialogue: { id: "d", node: "a" } };
    expect(validateState(soft, state)).toEqual(['dialogue "d" has no available option at node "a"']);
    expect(validateState(soft, { ...state, flags: { done: false } })).toEqual([]);
    expect(view(soft, { ...state, flags: { done: false } }).dialogue?.options).toHaveLength(1);
  });
});

describe("objectDescription", () => {
  it("returns the current description variant as plain paragraphs without running a turn", () => {
    const pack = makePack({
      start: { room: "r" },
      flags: { solved: false },
      counters: { clock: 0 },
      rooms: { r: { name: "R", description: "R." } },
      objects: {
        butler: { name: "butler", location: "r", npc: true },
        clue: {
          name: "Clue",
          location: "inventory",
          clue: true,
          description: [{ when: { flag: "solved" }, text: "Solved." }, { text: "The {butler} did it.\n\nSurely." }],
        },
        plain: { name: "plain", location: "r" },
      },
      rules: [
        {
          on: { event: "turn" },
          when: { counter: { name: "clock", lt: 5 } },
          do: { counter: { name: "clock", add: 1 } },
        },
        { on: { event: "turn" }, do: { say: "A clock chimes somewhere." } },
      ],
    });
    const state = newGame(pack).state;
    expect(objectDescription(pack, state, "clue")).toEqual(["The butler did it.", "Surely."]);
    expect(objectDescription(pack, { ...state, flags: { solved: true } }, "clue")).toEqual(["Solved."]);
    expect(objectDescription(pack, state, "plain")).toEqual([]);
    expect(objectDescription(pack, state, "constructor")).toEqual([]);
  });
});
