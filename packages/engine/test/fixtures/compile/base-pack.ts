import type { PackInput } from "../../../src/schema.ts";

/**
 * A small pack that produces no diagnostics at all (not even info). Analyzer
 * tests clone it, break one thing, and expect exactly that problem.
 */
export function basePack(): PackInput {
  return {
    format: "lexvm-pack/1",
    id: "base",
    version: "1.0.0",
    title: "Base",
    description: "Analyzer test pack.",
    language: "en",
    author: "Test",
    license: "CC0-1.0",
    maxScore: 1,
    start: { room: "hall", intro: "Welcome." },
    verbs: { read: { label: "Read", default: "Nothing to read." } },
    flags: { lamp_lit: false },
    counters: { knocks: 0 },
    rooms: {
      hall: {
        name: "Hall",
        description: "A hall with a {box}. A {door} leads north.",
        exits: { north: { to: "study", door: "door" } },
      },
      study: {
        name: "Study",
        description: "A quiet study. The {door|oak door} leads south.",
        exits: { south: { to: "hall", door: "door" } },
      },
    },
    objects: {
      lamp: { name: "lamp", location: "hall", portable: true },
      box: { name: "box", location: "hall", container: true, openable: true, open: false, description: "A box." },
      key: { name: "key", location: "box", portable: true },
      door: {
        name: "door",
        location: "hall",
        alsoIn: ["study"],
        openable: true,
        open: false,
        locked: true,
        unlockedBy: "key",
      },
      butler: { name: "butler", location: "hall", npc: true, dialogue: "chat", roomText: "The butler waits." },
      note: { name: "note", location: "study", portable: true, verbs: ["read"] },
      clue_note: { name: "Note clue", location: "nowhere", clue: true },
    },
    rules: [
      {
        id: "light_lamp",
        on: { verb: "use", object: "lamp" },
        when: { not: { flag: "lamp_lit" } },
        do: [{ set: "lamp_lit" }, { say: "The lamp glows." }],
      },
      { id: "read_note", on: { verb: "read", object: "note" }, do: [{ learn: "clue_note" }] },
      {
        id: "knock",
        on: { verb: "push", object: "door" },
        when: { counter: { name: "knocks", lt: 3 } },
        do: { counter: { name: "knocks", add: 1 } },
      },
      {
        id: "win",
        on: { verb: "give", object: "lamp", with: "butler" },
        when: [{ flag: "lamp_lit" }, { has: "clue_note" }, { counter: { name: "knocks", gte: 1 } }],
        do: [{ score: 1 }, { end: "done" }],
      },
    ],
    dialogues: {
      chat: {
        with: "butler",
        start: "hello",
        nodes: {
          hello: {
            say: "Yes?",
            options: [
              { id: "ask", text: "Anything new?", goto: "news" },
              { id: "bye", text: "Goodbye." },
            ],
          },
          news: { say: "Nothing.", options: [{ id: "back", text: "I see.", goto: "hello" }] },
        },
      },
    },
    endings: { done: { title: "Done", text: "Well done.", win: true } },
    hints: [{ id: "lamp", until: { flag: "lamp_lit" }, steps: ["Use the lamp."] }],
    walkthrough: [
      "use lamp",
      "open box",
      "take key",
      "use key door",
      "open door",
      "go north",
      "take note",
      "read note",
      "go south",
      "push door",
      "give lamp butler",
    ],
  };
}
