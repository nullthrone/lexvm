import { describe, expect, it } from "vitest";
import { commandLabel } from "../src/commands.ts";
import { MAX_WORK } from "../src/context.ts";
import { newGame, step, view } from "../src/runtime.ts";
import { last, linesOf, makePack, play, textOf } from "./fixtures/runtime/helpers.ts";

const rooms = {
  hall: { name: "Hall", description: "A hall.", exits: { north: { to: "attic" }, east: { to: "yard" } } },
  attic: { name: "Attic", description: "Dusty.", exits: { south: { to: "hall" } } },
  yard: { name: "Yard", description: "Grass.", exits: { west: { to: "hall" } } },
};
const objects = {
  lamp: { name: "lamp", location: "hall", portable: true },
  key: { name: "key", location: "hall", portable: true },
  door: { name: "door", location: "hall", openable: true, locked: true, unlockedBy: "key" },
  wire: { name: "wire", location: "hall", portable: true },
  ann: { name: "Ann", location: "hall", npc: true, dialogue: "ann_talk" },
};

describe("command rules", () => {
  it("rules replace defaults", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [{ on: { verb: "take", object: "lamp" }, do: { say: "It is bolted down." } }],
    });
    const r = last(play(pack, ["take lamp"]).results);
    expect(r.state.objects.lamp?.location).toBe("hall");
    expect(linesOf(r.output, "text")).toEqual(["It is bolted down."]);
  });

  it("only the first matching rule whose when holds fires; specific before general", () => {
    const pack = makePack({
      start: { room: "hall" },
      flags: { a: false },
      rooms,
      objects,
      rules: [
        { id: "guarded", on: { verb: "push", object: "lamp" }, when: { flag: "a" }, do: { say: "guarded" } },
        { id: "specific", on: { verb: "push", object: "lamp" }, do: [{ say: "specific" }, { set: "a" }] },
        { id: "general", on: { verb: "push" }, do: { say: "general" } },
      ],
    });
    const { results } = play(pack, ["push lamp", "push lamp", "push key"]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([["specific"], ["guarded"], ["general"]]);
  });

  it("an omitted object matches commands with and without objects", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [{ on: { verb: "look" }, do: { say: "Too dark." } }],
    });
    const { results } = play(pack, ["look", "look lamp"]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([["Too dark."], ["Too dark."]]);
    expect(linesOf(results[0]?.output ?? [], "room-title")).toEqual([]);
  });

  it("a specified with does not match a one-object command", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [{ on: { verb: "use", object: "lamp", with: "wire" }, do: { say: "Sparks." } }],
    });
    const { results } = play(pack, ["use lamp", "use lamp wire"]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([["Nothing happens."], ["Sparks."]]);
  });

  it("once rules fire once and are recorded in state.fired", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [
        { id: "first_push", once: true, on: { verb: "push", object: "lamp" }, do: { say: "Click." } },
        { on: { verb: "push", object: "lamp" }, do: { say: "Nothing more." } },
        { once: true, on: { verb: "pull", object: "lamp" }, do: { say: "Anonymous." } },
      ],
    });
    const { results, state } = play(pack, ["push lamp", "push lamp", "pull lamp", "pull lamp"]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([
      ["Click."],
      ["Nothing more."],
      ["Anonymous."],
      ["Nothing happens."],
    ]);
    // A once rule without id (an analyzer error) falls back to its index as key.
    expect(state.fired).toEqual(["first_push", "rules[2]"]);
  });

  it("use a with b is retried as use b with a only if no rule matched", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [
        { id: "splice", on: { verb: "use", object: "wire", with: "lamp" }, do: { say: "Spliced." } },
        { id: "key_any", on: { verb: "use", object: "key" }, do: { say: "Key rule." } },
      ],
    });
    const { results } = play(pack, ["use lamp wire", "use wire lamp", "use key lamp", "use lamp key"]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([
      ["Spliced."],
      ["Spliced."],
      ["Key rule."],
      ["Key rule."],
    ]);
    const forward = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [
        { on: { verb: "use", object: "lamp", with: "wire" }, do: { say: "Forward." } },
        { on: { verb: "use", object: "wire", with: "lamp" }, do: { say: "Reverse." } },
      ],
    });
    expect(linesOf(last(play(forward, ["use lamp wire"]).results).output, "text")).toEqual(["Forward."]);
  });

  it("go rules match the exit id and replace movement", () => {
    const pack = makePack({
      start: { room: "hall" },
      flags: { allowed: false },
      rooms,
      objects,
      rules: [{ on: { verb: "go", object: "north" }, when: { not: { flag: "allowed" } }, do: { say: "Not yet." } }],
    });
    const r = last(play(pack, ["go north"]).results);
    expect(r.state.room).toBe("hall");
    expect(linesOf(r.output, "text")).toEqual(["Not yet."]);
  });
});

describe("event rules", () => {
  it("start rules fire after the intro and before the first room; enter rules after the description", () => {
    const pack = makePack({
      start: { room: "hall", intro: "Intro one.\n\nIntro two." },
      rooms,
      objects,
      rules: [
        { on: { event: "enter" }, do: { say: "Any room." } },
        { on: { event: "start" }, do: { say: "Start." } },
        { on: { event: "enter", room: "hall" }, do: { say: "The hall." } },
        { on: { event: "enter", room: "attic" }, do: { say: "The attic." } },
      ],
    });
    const game = newGame(pack);
    expect(game.output.map((b) => [b.kind, b.spans.map((s) => s.text).join("")])).toEqual([
      ["text", "Intro one."],
      ["text", "Intro two."],
      ["text", "Start."],
      ["room-title", "Hall"],
      ["text", "A hall."],
      ["text", "You see: lamp, key, wire."],
      ["system", "Exits: north, east."],
      ["text", "Any room."],
      ["text", "The hall."],
    ]);
    expect(game.state.turn).toBe(0);
    expect(game.state.visited).toEqual(["hall"]);
    const r = step(pack, game.state, { verb: "go", object: "north" });
    expect(linesOf(r.output, "text")).toEqual(["Dusty.", "Any room.", "The attic."]);
  });

  it("a goto in a start rule replaces the initial room entry", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [{ on: { event: "start" }, do: { goto: "yard" } }],
    });
    const game = newGame(pack);
    expect(game.state.room).toBe("yard");
    expect(game.state.visited).toEqual(["yard"]);
    expect(linesOf(game.output, "room-title")).toEqual(["Yard"]);
  });

  it("once enter rules fire on the first visit only", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [{ id: "first", once: true, on: { event: "enter", room: "attic" }, do: { say: "First time." } }],
    });
    const { results } = play(pack, ["go north", "go south", "go north"]);
    expect(results.map((r) => linesOf(r.output, "text").includes("First time."))).toEqual([true, false, false]);
  });

  it("turn rules fire after accepted commands, in order, with conditions", () => {
    const pack = makePack({
      start: { room: "hall" },
      counters: { tide: 0 },
      rooms,
      objects,
      rules: [
        {
          on: { event: "turn" },
          when: { counter: { name: "tide", lt: 2 } },
          do: { counter: { name: "tide", add: 1 } },
        },
        { on: { event: "turn" }, when: { counter: { name: "tide", eq: 2 } }, do: { say: "High tide." } },
        { on: { event: "turn", room: "attic" }, do: { say: "Attic tick." } },
      ],
    });
    const { results, state } = play(pack, ["wait", "look lamp", "go north", "wait"]);
    expect(state.counters.tide).toBe(2);
    expect(state.turn).toBe(4);
    expect(
      results.map((r) => linesOf(r.output, "text").filter((t) => t.includes("tide") || t.includes("tick"))),
    ).toEqual([[], ["High tide."], ["High tide.", "Attic tick."], ["High tide.", "Attic tick."]]);
  });

  it("turn rules do not fire while a dialogue is active, nor after the game ended", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [
        { on: { verb: "push", object: "lamp" }, do: { end: "won" } },
        { on: { event: "turn" }, do: { say: "Tick." } },
      ],
      dialogues: {
        ann_talk: {
          start: "a",
          nodes: {
            a: {
              say: "Hi.",
              options: [
                { id: "more", text: "More.", goto: "a" },
                { id: "bye", text: "Bye." },
              ],
            },
          },
        },
      },
    });
    const { results } = play(pack, ["talk ann", "choose more", "choose bye", "push lamp"]);
    expect(results.map((r) => linesOf(r.output, "text").includes("Tick."))).toEqual([false, false, true, false]);
  });

  it("guards against unbounded rule recursion", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      rules: [
        { on: { event: "enter", room: "attic" }, do: { goto: "yard" } },
        { on: { event: "enter", room: "yard" }, do: { goto: "attic" } },
        { on: { event: "turn" }, do: { say: "Tick." } },
      ],
    });
    const r = step(pack, newGame(pack).state, { verb: "go", object: "north" });
    expect(r.status).toBe("ok");
    expect(linesOf(r.output, "system")).toContain("internal: rule recursion limit");
    expect(linesOf(r.output, "text")).not.toContain("Tick.");
    expect(linesOf(r.output, "room-title").length).toBe(16);
  });

  it("bounds the total work of one step, not only its nesting depth", () => {
    // Each room's enter rule enters the next room six times: 6^14 entries without a work budget.
    const fanRooms: Record<string, unknown> = {
      hall: { name: "Hall", description: "A hall.", exits: { north: { to: "r1" } } },
    };
    const fanRules: unknown[] = [];
    for (let i = 1; i <= 15; i++) {
      fanRooms[`r${i}`] = { name: `R${i}`, description: `Room ${i}.`, exits: { south: { to: "hall" } } };
      if (i < 15) fanRules.push({ on: { event: "enter", room: `r${i}` }, do: Array(6).fill({ goto: `r${i + 1}` }) });
    }
    const pack = makePack({ start: { room: "hall" }, rooms: fanRooms, rules: fanRules });
    const t0 = Date.now();
    const r = step(pack, newGame(pack).state, { verb: "go", object: "north" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.status).toBe("ok");
    expect(linesOf(r.output, "system")).toContain("internal: rule work limit");
    expect(linesOf(r.output, "room-title").length).toBeLessThanOrEqual(MAX_WORK);
    // In the pack's language, like every engine message.
    const de = makePack({ language: "de", start: { room: "hall" }, rooms: fanRooms, rules: fanRules });
    const german = step(de, newGame(de).state, { verb: "go", object: "north" });
    expect(linesOf(german.output, "system")).toContain("intern: Regeln brauchen zu viele Schritte");
  });

  it("guards against dialogues that restart themselves forever", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      dialogues: { ann_talk: { start: "a", nodes: { a: { say: "Again.", do: { dialogue: "ann_talk" } } } } },
    });
    const r = step(pack, newGame(pack).state, { verb: "talk", object: "ann" });
    expect(linesOf(r.output, "system")).toContain("internal: rule recursion limit");
  });
});

describe("dialogues", () => {
  const pack = makePack({
    start: { room: "hall" },
    flags: { told: false },
    rooms,
    objects: { ...objects, clue: { name: "rumour", location: "nowhere", clue: true } },
    dialogues: {
      ann_talk: {
        with: "ann",
        start: "hello",
        nodes: {
          hello: {
            say: "Hello.\n\nWhat now?",
            options: [
              { id: "ask", text: "Any news?", once: true, do: { learn: "clue" }, goto: "news" },
              { id: "secret", text: "The secret?", when: { flag: "told" }, goto: "secret" },
              { id: "switch", text: "Other topic.", do: { dialogue: "other" }, goto: "news" },
              { id: "leave", text: "Leave me.", do: { endDialogue: true }, goto: "news" },
              { id: "bye", text: "Bye." },
            ],
          },
          news: {
            say: "A ship came in.",
            do: { set: "told" },
            options: [{ id: "back", text: "I see.", goto: "hello" }],
          },
          secret: { say: "Shh.", do: { end: "won" } },
        },
      },
      other: { start: "o", nodes: { o: { say: "Other.", options: [{ id: "done", text: "Done." }] } } },
    },
  });

  it("node say is printed as npc blocks, options as player blocks", () => {
    const { results } = play(pack, ["talk ann", "choose ask"]);
    const [talk, ask] = results;
    expect(linesOf(talk?.output ?? [], "npc")).toEqual(["Hello.", "What now?"]);
    expect(ask?.output.map((b) => b.kind)).toEqual(["player", "system", "npc"]);
    expect(linesOf(ask?.output ?? [], "player")).toEqual(["Any news?"]);
    expect(ask?.state.objects.clue?.location).toBe("inventory");
  });

  it("once options disappear; when conditions apply; view lists available options with the npc name", () => {
    const { state } = play(pack, ["talk ann", "choose ask", "choose back"]);
    expect(state.chosen).toEqual(["ann_talk.ask"]);
    const v = view(pack, state);
    expect(v.dialogue).toEqual({
      id: "ann_talk",
      npc: "Ann",
      options: [
        { id: "secret", text: "The secret?" },
        { id: "switch", text: "Other topic." },
        { id: "leave", text: "Leave me." },
        { id: "bye", text: "Bye." },
      ],
    });
    expect(step(pack, state, { verb: "choose", object: "ask" }).status).toBe("rejected");
  });

  it("an option without goto ends the dialogue", () => {
    const { state } = play(pack, ["talk ann", "choose bye"]);
    expect(state.dialogue).toBeNull();
    expect(view(pack, state).dialogue).toBeNull();
  });

  it("a node without available options ends the dialogue; end inside a dialogue ends the game", () => {
    const { state, results } = play(pack, ["talk ann", "choose ask", "choose back", "choose secret"]);
    expect(state.ended).toBe("won");
    expect(state.dialogue).toBeNull();
    expect(linesOf(last(results).output, "ending")).toEqual(["Won", "You won."]);
  });

  it("effects that end or switch the dialogue win over the option's goto", () => {
    expect(play(pack, ["talk ann", "choose leave"]).state.dialogue).toBeNull();
    expect(play(pack, ["talk ann", "choose switch"]).state.dialogue).toEqual({ id: "other", node: "o" });
  });

  it("a dialogue whose start node has no options ends at once", () => {
    const p = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      dialogues: { ann_talk: { start: "a", nodes: { a: { say: "Go away." } } } },
    });
    const r = last(play(p, ["talk ann"]).results);
    expect(r.state.dialogue).toBeNull();
    expect(linesOf(r.output, "npc")).toEqual(["Go away."]);
  });

  it("the turn after the final choice fires turn rules", () => {
    const p = makePack({ ...pack, rules: [{ on: { event: "turn" }, do: { say: "Tick." } }] });
    const { results } = play(p, ["talk ann", "choose bye"]);
    expect(results.map((r) => textOf(r.output).includes("Tick."))).toEqual([false, true]);
  });
});

describe("dialogues without available options", () => {
  const base = {
    start: { room: "a" },
    rooms: {
      a: { name: "A", description: "Room.", exits: { north: { to: "b" } } },
      b: { name: "B", description: "B." },
    },
    objects: { guard: { name: "guard", location: "a", npc: true } },
  };

  it("end when a later effect of the same rule takes the last option away", () => {
    const pack = makePack({
      ...base,
      flags: { talked: false },
      rules: [{ id: "talk_guard", on: { verb: "talk", object: "guard" }, do: [{ dialogue: "d" }, { set: "talked" }] }],
      dialogues: {
        d: {
          with: "guard",
          start: "hi",
          nodes: { hi: { say: "Hi.", options: [{ id: "first", text: "Who?", when: { not: { flag: "talked" } } }] } },
        },
      },
    });
    const { results, state } = play(pack, ["talk guard", "go north"]);
    expect(results[0]?.state.dialogue).toBeNull();
    expect(results[1]?.status).toBe("ok");
    expect(state.room).toBe("b");
  });

  it("stop turn rules once one of them starts a dialogue", () => {
    const pack = makePack({
      ...base,
      flags: { f: false },
      rules: [
        { id: "ambush", on: { event: "turn" }, once: true, do: { dialogue: "d" } },
        { id: "later", on: { event: "turn" }, do: { set: "f" } },
      ],
      dialogues: {
        d: {
          with: "guard",
          start: "hi",
          nodes: { hi: { say: "Hi.", options: [{ id: "first", text: "Who?", when: { not: { flag: "f" } } }] } },
        },
      },
    });
    const { results } = play(pack, ["wait", "choose first"]);
    expect(results[0]?.state.dialogue).toEqual({ id: "d", node: "hi" });
    expect(results[0]?.state.flags.f).toBe(false);
    expect(results[1]?.status).toBe("ok");
    expect(results[1]?.state.flags.f).toBe(true);
  });
});

describe("markup in dialogue option texts", () => {
  it("is shown as plain names on buttons and labels, as references in the transcript", () => {
    const pack = makePack({
      start: { room: "hall" },
      rooms,
      objects,
      dialogues: {
        ann_talk: {
          with: "ann",
          start: "a",
          nodes: { a: { say: "Yes?", options: [{ id: "ask", text: "Where is the {lamp|old lamp}? And the {key}?" }] } },
        },
      },
    });
    const talk = step(pack, newGame(pack).state, { verb: "talk", object: "ann" });
    expect(view(pack, talk.state).dialogue?.options).toEqual([
      { id: "ask", text: "Where is the old lamp? And the key?" },
    ]);
    expect(commandLabel(pack, { verb: "choose", object: "ask" })).toBe("Where is the old lamp? And the key?");
    const choose = step(pack, talk.state, { verb: "choose", object: "ask" });
    const player = choose.output.find((b) => b.kind === "player");
    expect(player?.spans.filter((s) => s.ref !== undefined).map((s) => s.ref)).toEqual(["lamp", "key"]);
  });
});
