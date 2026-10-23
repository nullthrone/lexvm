import { describe, expect, it } from "vitest";
import { parseCanonical } from "../src/commands.ts";
import { hint, newGame, step, view } from "../src/runtime.ts";
import type { GameState, OutputBlock } from "../src/types.ts";
import {
  deepFreeze,
  last,
  linesOf,
  loadFixture,
  loadLockedStudy,
  makePack,
  play,
  textOf,
} from "./fixtures/runtime/helpers.ts";

describe("newGame", () => {
  it("builds the initial state from the pack", () => {
    const pack = makePack({
      start: { room: "hall" },
      flags: { a: true, b: false },
      counters: { c: 7 },
      rooms: { hall: { name: "Hall", description: "A hall." } },
      objects: {
        box: { name: "box", location: "hall", container: true, openable: true, open: true, locked: false },
        door: { name: "door", location: "hall", openable: true, locked: true },
        ghost: { name: "ghost", location: "nowhere", hidden: true },
      },
    });
    const { state } = newGame(pack);
    expect(state).toEqual({
      v: 1,
      pack: { id: "test-pack", version: "1.0.0" },
      turn: 0,
      room: "hall",
      objects: {
        box: { location: "hall", open: true, locked: false, hidden: false },
        door: { location: "hall", open: false, locked: true, hidden: false },
        ghost: { location: "nowhere", open: false, locked: false, hidden: true },
      },
      flags: { a: true, b: false },
      counters: { c: 7 },
      visited: ["hall"],
      fired: [],
      chosen: [],
      dialogue: null,
      score: 0,
      ended: null,
    });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("view", () => {
  const pack = makePack({
    start: { room: "hall" },
    maxScore: 5,
    verbs: { read: { label: "Read" }, splice: { label: "Splice", arity: 2, prep: "onto" }, look: { label: "Inspect" } },
    rooms: {
      hall: {
        name: "Hall",
        description: "A hall.",
        exits: {
          north: { to: "hall" },
          up: { to: "hall", label: "Up the stairs" },
          hatch: { to: "hall", label: "hatch", visibleWhen: { flag: "never" } },
        },
      },
    },
    flags: { never: false },
    objects: {
      ann: { name: "Ann", location: "hall", npc: true, verbs: ["read", "talk"] },
      box: { name: "box", location: "hall", container: true, openable: true, open: true },
      coin: { name: "coin", location: "box", portable: true },
      statue: { name: "statue", location: "hall", verbs: ["push", "go", "bogus"] },
      clue_hall: { name: "footprint", location: "hall", clue: true },
      note: { name: "note", location: "inventory", portable: true, verbs: ["read"] },
      bag: { name: "bag", location: "inventory", portable: true, container: true, openable: true, open: true },
      pebble: { name: "pebble", location: "bag", portable: true },
      fact: { name: "fact", location: "inventory", clue: true },
      far: { name: "far", location: "nowhere", portable: true },
    },
  });

  it("lists present objects with kinds and action-sheet verbs in pack order", () => {
    const v = view(pack, newGame(pack).state);
    expect(v.room).toEqual({ id: "hall", name: "Hall" });
    expect(v.objects).toEqual([
      { id: "ann", name: "Ann", kind: "npc", verbs: ["look", "talk", "read"] },
      { id: "box", name: "box", kind: "container", verbs: ["look", "close", "use"] },
      { id: "coin", name: "coin", kind: "item", verbs: ["look", "take", "use"] },
      { id: "statue", name: "statue", kind: "scenery", verbs: ["look", "use", "push"] },
      { id: "clue_hall", name: "footprint", kind: "clue", verbs: ["look", "take", "use"] },
    ]);
  });

  it("lists the inventory: items (top level, then nested), then clues", () => {
    const v = view(pack, newGame(pack).state);
    expect(v.inventory).toEqual([
      { id: "note", name: "note", kind: "item", verbs: ["look", "use", "show", "give", "drop", "read"] },
      { id: "bag", name: "bag", kind: "container", verbs: ["look", "use", "close", "show", "give", "drop"] },
      { id: "pebble", name: "pebble", kind: "item", verbs: ["look", "use", "show", "give", "drop"] },
      { id: "fact", name: "fact", kind: "clue", verbs: ["look", "use", "show"] },
    ]);
  });

  it("offers give/show only when an npc is present", () => {
    const s = newGame(pack).state;
    const noNpc: GameState = { ...s, objects: { ...s.objects, ann: { ...s.objects.ann!, location: "nowhere" } } };
    const v = view(pack, noNpc);
    expect(v.inventory.find((o) => o.id === "note")?.verbs).toEqual(["look", "use", "drop", "read"]);
    expect(v.inventory.find((o) => o.id === "fact")?.verbs).toEqual(["look", "use"]);
  });

  it("lists exits, verbs, score, ending and turn", () => {
    const s = newGame(pack).state;
    const v = view(pack, s);
    expect(v.exits).toEqual([
      { id: "north", label: "north" },
      { id: "up", label: "Up the stairs" },
    ]);
    expect(v.verbs).toEqual([
      { id: "look", label: "Inspect", arity: 1 },
      { id: "take", label: "Take", arity: 1 },
      { id: "drop", label: "Drop", arity: 1 },
      { id: "open", label: "Open", arity: 1 },
      { id: "close", label: "Close", arity: 1 },
      { id: "use", label: "Use", arity: 2, prep: "with" },
      { id: "talk", label: "Talk to", arity: 1 },
      { id: "give", label: "Give", arity: 2, prep: "to" },
      { id: "show", label: "Show", arity: 2, prep: "to" },
      { id: "push", label: "Push", arity: 1 },
      { id: "pull", label: "Pull", arity: 1 },
      { id: "wait", label: "Wait", arity: 0 },
      { id: "inventory", label: "Inventory", arity: 0 },
      { id: "read", label: "Read", arity: 1 },
      { id: "splice", label: "Splice", arity: 2, prep: "onto" },
    ]);
    expect(v.score).toEqual({ value: 0, max: 5 });
    expect(v.dialogue).toBeNull();
    expect(v.ended).toBeNull();
    expect(v.turn).toBe(0);
    expect(view(pack, { ...s, ended: "won", turn: 9 }).ended).toEqual({ id: "won", title: "Won", win: true });
    expect(view(makePack({ ...pack, maxScore: undefined }), s).score).toBeNull();
  });

  it("uses German labels for German packs", () => {
    const de = loadFixture("hafen.yaml");
    const v = view(de, newGame(de).state);
    expect(v.exits).toEqual([
      { id: "north", label: "Norden" },
      { id: "keller", label: "Kellertreppe" },
    ]);
    expect(v.verbs.map((x) => x.label)).toEqual([
      "Untersuchen",
      "Nehmen",
      "Ablegen",
      "Öffnen",
      "Schließen",
      "Benutzen",
      "Sprechen",
      "Geben",
      "Zeigen",
      "Drücken",
      "Ziehen",
      "Warten",
      "Inventar",
      "Lesen",
      "Kombinieren",
    ]);
    expect(v.verbs.find((x) => x.id === "use")?.prep).toBe("mit");
    expect(v.verbs.find((x) => x.id === "give")?.prep).toBe("an");
  });
});

describe("hint", () => {
  const pack = makePack({
    start: { room: "hall" },
    flags: { a: false, b: false, never_true: false },
    rooms: { hall: { name: "Hall", description: "A hall." } },
    objects: { button: { name: "button", location: "hall" } },
    rules: [
      { on: { verb: "push", object: "button" }, do: { set: "a" } },
      { on: { verb: "pull", object: "button" }, do: [{ set: "b" }, { end: "won" }] },
    ],
    hints: [
      { id: "later", when: { flag: "b" }, until: { flag: "never_true" }, steps: ["x"] },
      { id: "push_it", until: { flag: "a" }, steps: ["Try the button.", "Push it."] },
      { id: "pull_it", when: { flag: "a" }, until: { flag: "b" }, steps: ["Pull it."] },
    ],
  });

  it("returns the first hint whose when holds and whose until does not", () => {
    const p = pack;
    const { state } = play(p, []);
    expect(hint(p, state)).toEqual({ id: "push_it", steps: ["Try the button.", "Push it."] });
    const pushed = play(p, ["push button"]).state;
    expect(hint(p, pushed)?.id).toBe("pull_it");
    expect(hint(p, play(p, ["push button", "pull button"]).state)).toBeNull();
  });
});

describe("German messages", () => {
  const de = loadFixture("hafen.yaml");

  it("prints localized default messages", () => {
    const { start, results } = play(de, [
      "take logbuch",
      "take kiste",
      "open luke",
      "open kiste",
      "take foto",
      "drop foto",
      "wait",
      "inventory",
      "go keller",
      "use schluessel luke",
      "push kiste",
    ]);
    expect(linesOf(start, "text")).toEqual([
      "Hamburg, 1948. Es regnet.",
      "Ein enger Raum voller Aktenschränke. Eine Luke führt in den Keller.",
      "Hier liegt: Logbuch, Messingschlüssel.",
    ]);
    expect(linesOf(start, "system")).toEqual(["Ausgänge: Norden, Kellertreppe."]);
    expect(results.map((r) => linesOf(r.output, "echo"))).toEqual([
      ["Nimm Logbuch"],
      ["Nimm Kiste"],
      ["Öffne Luke"],
      ["Öffne Kiste"],
      ["Nimm Foto"],
      ["Leg Foto ab"],
      ["Warte"],
      ["Inventar"],
      ["Geh: Kellertreppe"],
      ["Benutze Messingschlüssel mit Luke"],
      ["Drücke Kiste"],
    ]);
    expect(results.map((r) => linesOf(r.output, "text"))).toEqual([
      ["Genommen: Logbuch."],
      ["Das lässt sich nicht nehmen."],
      ["Verschlossen."],
      ["Geöffnet: Kiste.", "In Kiste: Foto."],
      ["Genommen: Foto."],
      ["Abgelegt: Foto."],
      ["Die Zeit vergeht."],
      ["Du trägst: Logbuch."],
      ["Die Luke ist zu."],
      ["Aufgeschlossen: Luke."],
      ["Nichts passiert."],
    ]);
  });

  it("announces clues, points and the ending in German", () => {
    const { results, state } = play(de, de.walkthrough);
    expect(state.ended).toBe("geloest");
    expect(linesOf(results[1]?.output ?? [], "system")).toEqual(["Neu im Notizbuch: Notiz."]);
    const final = last(results);
    expect(linesOf(final.output, "system")).toEqual(["+2 Punkte.", "Punkte: 2 von 2."]);
    expect(linesOf(final.output, "ending")).toEqual(["Fall gelöst", "Der Regen hört auf."]);
    expect(linesOf(final.output, "echo")).toEqual(["Kombinieren Aussage des Wirts mit Notiz"]);
  });

  it("uses German rejections and refusals", () => {
    const s = newGame(de).state;
    expect(textOf(step(de, s, { verb: "take", object: "rotes_buch" }).output)).toBe("Das siehst du hier nicht.");
    expect(textOf(step(de, s, { verb: "go", object: "south" }).output)).toBe("Dahin geht es nicht.");
    expect(textOf(step(de, s, { verb: "choose", object: "x" }).output)).toBe("Gerade führst du kein Gespräch.");
    const r = last(
      play(de, ["take schluessel", "open luke", "go keller", "take rotes_buch", "go up", "drop rotes_buch"]).results,
    );
    expect(linesOf(r.output, "text")).toEqual(["Abgelegt: rotes Buch."]);
    const room = last(play(de, ["go north"]).results);
    expect(linesOf(room.output, "text")).toEqual([
      "Möwen kreischen über dem Wasser.",
      "Ein Mann mit Schürze lehnt an einem Poller.",
    ]);
    expect(room.output.find((b) => b.spans.some((s) => s.ref === "wirt"))?.spans).toContainEqual({
      text: "Mann",
      ref: "wirt",
    });
    expect(linesOf(last(play(de, ["take logbuch", "take logbuch"]).results).output, "text")).toEqual([
      "Das hast du schon.",
    ]);
    expect(linesOf(last(play(de, ["go north", "take wirt"]).results).output, "text")).toEqual([
      "Das lässt sich nicht nehmen.",
    ]);
    expect(linesOf(last(play(de, ["take logbuch", "go north", "give logbuch wirt"]).results).output, "text")).toEqual([
      "Wirt zeigt kein Interesse.",
    ]);
  });
});

describe("determinism and immutability", () => {
  const pack = loadLockedStudy();
  const commands = [...pack.walkthrough.slice(0, 8), "look", "inventory", ...pack.walkthrough.slice(8)];

  function transcript(): { states: GameState[]; outputs: OutputBlock[][] } {
    const game = newGame(pack);
    const states = [game.state];
    const outputs = [game.output];
    let state = game.state;
    for (const c of commands) {
      const r = step(pack, state, parseCanonical(c)!);
      states.push(r.state);
      outputs.push(r.output);
      state = r.state;
    }
    return { states, outputs };
  }

  it("two runs of the same commands give deep-equal states and outputs", () => {
    const a = transcript();
    const b = transcript();
    expect(a.states).toEqual(b.states);
    expect(a.outputs).toEqual(b.outputs);
    expect(last([{ state: a.states.at(-1)!, output: [], status: "ok" }]).state.ended).toBe("found_uncle");
  });

  it("never mutates the input state", () => {
    let state = deepFreeze(newGame(pack).state);
    for (const c of commands) {
      const before = JSON.stringify(state);
      const r = step(pack, state, parseCanonical(c)!);
      expect(JSON.stringify(state)).toBe(before);
      state = deepFreeze(r.state);
    }
    expect(state.ended).toBe("found_uncle");
  });

  it("does not mutate the pack", () => {
    const frozen = deepFreeze(loadLockedStudy());
    const { state } = play(frozen, frozen.walkthrough);
    expect(state.ended).toBe("found_uncle");
    expect(view(frozen, state).ended?.win).toBe(true);
  });
});
