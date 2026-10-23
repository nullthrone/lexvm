/** Shared test fixtures (plain data, no engine calls). */
import type { GameState, ObjectView, View } from "@lexvm/engine";

export function sampleState(overrides: Partial<GameState> = {}): GameState {
  return {
    v: 1,
    pack: { id: "locked-study", version: "1.0.0" },
    turn: 3,
    room: "hall",
    objects: { brass_key: { location: "inventory", open: false, locked: false, hidden: false } },
    flags: { book_moved: true },
    counters: { tide: 2 },
    visited: ["hall", "library"],
    fired: [],
    chosen: ["graves_talk.ask_uncle"],
    dialogue: null,
    score: 1,
    ended: null,
    ...overrides,
  };
}

const obj = (id: string, name: string, kind: ObjectView["kind"], verbs: string[]): ObjectView => ({
  id,
  name,
  kind,
  verbs,
});

/** A view shaped like the engine's for the demo pack: Graves and the door here, key, letter and a clue held. */
export function sampleView(overrides: Partial<View> = {}): View {
  return {
    room: { id: "hall", name: "Entrance Hall" },
    objects: [
      obj("graves", "Graves", "npc", ["look", "talk", "give", "show"]),
      obj("study_door", "oak door", "scenery", ["look", "open", "use"]),
    ],
    inventory: [
      obj("brass_key", "brass key", "item", ["look", "drop", "use", "give", "show"]),
      obj("letter", "letter", "item", ["look", "read", "use"]),
      obj("clue_password", "The password", "clue", ["look", "show"]),
    ],
    exits: [
      { id: "west", label: "west" },
      { id: "north", label: "north" },
    ],
    verbs: [
      { id: "look", label: "Examine", arity: 1 },
      { id: "take", label: "Take", arity: 1 },
      { id: "drop", label: "Drop", arity: 1 },
      { id: "open", label: "Open", arity: 1 },
      { id: "use", label: "Use", arity: 2, prep: "with" },
      { id: "talk", label: "Talk to", arity: 1 },
      { id: "give", label: "Give", arity: 2, prep: "to" },
      { id: "show", label: "Show", arity: 2, prep: "to" },
      { id: "read", label: "Read", arity: 1 },
      { id: "combine", label: "Combine", arity: 2, prep: "with" },
    ],
    dialogue: null,
    ended: null,
    score: { value: 1, max: 3 },
    turn: 3,
    ...overrides,
  };
}
