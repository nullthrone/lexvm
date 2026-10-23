import { describe, expect, it } from "vitest";
import { newGame, step } from "../src/runtime.ts";
import type { Command, GameState } from "../src/types.ts";
import { deepFreeze, last, linesOf, makePack, play, textOf } from "./fixtures/runtime/helpers.ts";

const pack = makePack({
  start: { room: "hall" },
  flags: { secret: false, storm: false },
  verbs: {
    read: { label: "Read", default: "Nothing to read." },
    knock: { label: "Knock" },
    push: { label: "Push", default: "It does not budge." },
  },
  rooms: {
    hall: {
      name: "Hall",
      description: "A hall.",
      exits: {
        north: { to: "study", door: "door", blocked: "The oak door is closed." },
        east: { to: "garden", when: { not: { flag: "storm" } } },
        cellar: { to: "cellar", label: "cellar stairs" },
        hatch: { to: "vault", label: "hatch", visibleWhen: { flag: "secret" } },
      },
    },
    study: { name: "Study", description: "A study.", exits: { south: { to: "hall", door: "door" } } },
    garden: { name: "Garden", description: "Green." },
    cellar: { name: "Cellar", description: "Dark." },
    vault: { name: "Vault", description: "Gold." },
  },
  objects: {
    key: { name: "brass key", location: "hall", portable: true, description: "Small and brass." },
    door: {
      name: "oak door",
      location: "hall",
      alsoIn: ["study"],
      openable: true,
      locked: true,
      unlockedBy: "key",
    },
    box: { name: "box", location: "hall", container: true, openable: true, description: "A box." },
    coin: { name: "coin", location: "box", portable: true },
    shelf: { name: "shelf", location: "hall", container: true },
    vase: { name: "vase", location: "hall", container: true },
    cup: { name: "cup", location: "shelf", portable: true },
    statue: { name: "statue", location: "hall", roomText: "A {statue} stares at you." },
    rug: { name: "rug", location: "hall" },
    graves: { name: "Graves", location: "hall", npc: true, dialogue: "chat" },
    mute: { name: "Mute Max", location: "hall", npc: true },
    clue: { name: "odd clue", location: "hall", clue: true },
    note: { name: "note", location: "inventory", portable: true },
    known: { name: "known fact", location: "inventory", clue: true },
    bag: { name: "bag", location: "inventory", portable: true, container: true, openable: true, open: true },
    pebble: { name: "pebble", location: "bag", portable: true },
    far: { name: "far thing", location: "garden", portable: true },
  },
  dialogues: {
    chat: { with: "graves", start: "hi", nodes: { hi: { say: "Yes?", options: [{ id: "bye", text: "Bye." }] } } },
  },
});

function run(commands: string[]) {
  return last(play(pack, commands).results);
}

function text(commands: string[]): string {
  return textOf(run(commands).output);
}

describe("default behaviours", () => {
  it("look describes the room: title, description, roomText, loose items, open containers, exits", () => {
    const r = run(["look"]);
    expect(r.output.map((b) => b.kind)).toEqual(["echo", "room-title", "text", "text", "text", "text", "system"]);
    expect(linesOf(r.output, "echo")).toEqual(["Look around"]);
    expect(linesOf(r.output, "text")).toEqual([
      "A hall.",
      "A statue stares at you.",
      "You see: brass key, odd clue.",
      "In the shelf: cup.",
    ]);
    expect(linesOf(r.output, "system")).toEqual(["Exits: north, east, cellar stairs."]);
    const loose = r.output[4];
    expect(loose?.spans).toContainEqual({ text: "brass key", ref: "key" });
  });

  it("look obj prints the description, or 'nothing special'", () => {
    expect(linesOf(run(["look key"]).output, "text")).toEqual(["Small and brass."]);
    expect(linesOf(run(["look rug"]).output, "text")).toEqual(["You see nothing special."]);
    expect(linesOf(run(["look key"]).output, "echo")).toEqual(["Examine brass key"]);
  });

  it("look on containers: closed, contents, empty", () => {
    expect(linesOf(run(["look box"]).output, "text")).toEqual(["A box.", "It's closed."]);
    expect(linesOf(run(["open box", "look box"]).output, "text")).toEqual(["A box.", "In the box: coin."]);
    expect(linesOf(run(["look vase"]).output, "text")).toEqual(["You see nothing special.", "It's empty."]);
    expect(linesOf(run(["look shelf"]).output, "text")).toEqual(["You see nothing special.", "In the shelf: cup."]);
  });

  it("take: portable objects, already held, not takeable, clues go to the notebook", () => {
    const r = run(["take key"]);
    expect(r.state.objects.key?.location).toBe("inventory");
    expect(linesOf(r.output, "text")).toEqual(["Taken: brass key."]);
    expect(text(["take note"])).toContain("You already have that.");
    expect(text(["take rug"])).toContain("You can't take that.");
    expect(text(["take graves"])).toContain("You can't take that.");
    const c = run(["take clue"]);
    expect(c.state.objects.clue?.location).toBe("inventory");
    expect(linesOf(c.output, "system")).toEqual(["New in your notebook: odd clue."]);
  });

  it("take moves an object out of a carried container to the top level", () => {
    expect(run(["take pebble"]).state.objects.pebble?.location).toBe("inventory");
  });

  it("drop: held objects go to the room; clues and objects not held are refused", () => {
    const r = run(["drop note"]);
    expect(r.state.objects.note?.location).toBe("hall");
    expect(linesOf(r.output, "text")).toEqual(["Dropped: note."]);
    expect(run(["drop pebble"]).state.objects.pebble?.location).toBe("hall");
    const clue = run(["drop known"]);
    expect(clue.state.objects.known?.location).toBe("inventory");
    expect(textOf(clue.output)).toContain("You can't drop that.");
    expect(text(["drop key"])).toContain("You don't have that.");
  });

  it("open: not openable, already open, locked without key, locked with key", () => {
    expect(text(["open rug"])).toContain("You can't open that.");
    expect(text(["open bag"])).toContain("That's already open.");
    const locked = run(["open door"]);
    expect(linesOf(locked.output, "text")).toEqual(["It's locked."]);
    expect(locked.state.objects.door).toMatchObject({ open: false, locked: true });
    const withKey = run(["take key", "open door"]);
    expect(withKey.state.objects.door).toMatchObject({ open: true, locked: false });
    expect(linesOf(withKey.output, "text")).toEqual(["Unlocked with brass key and opened: oak door."]);
    expect(withKey.output.find((b) => b.kind === "text")?.spans).toContainEqual({ text: "brass key", ref: "key" });
  });

  it("open lists the contents of a container", () => {
    const r = run(["open box"]);
    expect(r.state.objects.box?.open).toBe(true);
    expect(linesOf(r.output, "text")).toEqual(["Opened: box.", "In the box: coin."]);
  });

  it("close: openable and open only", () => {
    const r = run(["open box", "close box"]);
    expect(r.state.objects.box?.open).toBe(false);
    expect(linesOf(r.output, "text")).toEqual(["Closed: box."]);
    expect(text(["close box"])).toContain("That's already closed.");
    expect(text(["close rug"])).toContain("You can't close that.");
  });

  it("use key with lock unlocks without opening; both orders work", () => {
    const r = run(["use key door"]);
    expect(r.state.objects.door).toMatchObject({ locked: false, open: false });
    expect(linesOf(r.output, "text")).toEqual(["Unlocked: oak door."]);
    expect(linesOf(r.output, "echo")).toEqual(["Use brass key with oak door"]);
    expect(run(["use door key"]).state.objects.door?.locked).toBe(false);
    expect(text(["use key door", "use key door"])).toContain("That's already unlocked.");
    expect(text(["use key rug"])).toContain("That doesn't work.");
  });

  it("use a, push, pull: nothing happens (or the pack's verb default)", () => {
    expect(text(["use rug"])).toContain("Nothing happens.");
    expect(text(["pull rug"])).toContain("Nothing happens.");
    expect(text(["push rug"])).toContain("It does not budge.");
  });

  it("talk starts the npc's dialogue; otherwise there is no answer", () => {
    const r = run(["talk graves"]);
    expect(r.state.dialogue).toEqual({ id: "chat", node: "hi" });
    expect(linesOf(r.output, "npc")).toEqual(["Yes?"]);
    expect(linesOf(r.output, "echo")).toEqual(["Talk to Graves"]);
    expect(text(["talk mute"])).toContain("There is no answer.");
    expect(text(["talk rug"])).toContain("There is no answer.");
  });

  it("give/show: the object must be held (clues count for show), then the npc is not interested", () => {
    const notHeld = run(["give key graves"]);
    expect(notHeld.status).toBe("ok");
    expect(linesOf(notHeld.output, "text")).toEqual(["You don't have that."]);
    expect(text(["give note graves"])).toContain("Graves is not interested.");
    expect(text(["show note graves"])).toContain("Graves is not interested.");
    expect(text(["show clue graves"])).toContain("Graves is not interested.");
    expect(text(["give clue graves"])).toContain("You don't have that.");
    expect(text(["give note rug"])).toContain("That doesn't work.");
    expect(linesOf(run(["give note graves"]).output, "echo")).toEqual(["Give note to Graves"]);
    expect(linesOf(run(["show note graves"]).output, "echo")).toEqual(["Show note to Graves"]);
  });

  it("go: moves through usable exits", () => {
    const r = run(["go cellar"]);
    expect(r.state.room).toBe("cellar");
    expect(r.state.visited).toEqual(["hall", "cellar"]);
    expect(linesOf(r.output, "echo")).toEqual(["Go: cellar stairs"]);
    expect(linesOf(r.output, "room-title")).toEqual(["Cellar"]);
  });

  it("go: a closed door prints the blocked text, a failing when the default; both are accepted turns", () => {
    const door = run(["go north"]);
    expect(door.status).toBe("ok");
    expect(door.state.room).toBe("hall");
    expect(door.state.turn).toBe(1);
    expect(linesOf(door.output, "text")).toEqual(["The oak door is closed."]);
    const stormy = makePack({ ...pack, flags: { secret: false, storm: true } });
    const s = last(play(stormy, ["go east"]).results);
    expect(s.state.room).toBe("hall");
    expect(linesOf(s.output, "text")).toEqual(["You can't get through."]);
    expect(run(["take key", "open door", "go north"]).state.room).toBe("study");
  });

  it("go: exits must be listed (visibleWhen)", () => {
    const r = run(["go hatch"]);
    expect(r.status).toBe("rejected");
    expect(textOf(r.output)).toBe("You can't go that way.");
    expect(run(["go west"]).status).toBe("rejected");
  });

  it("wait and inventory", () => {
    expect(text(["wait"])).toContain("Time passes.");
    const inv = run(["inventory"]);
    expect(linesOf(inv.output, "text")).toEqual([
      "You are carrying: note, bag.",
      "In the bag: pebble.",
      "Notebook: known fact.",
    ]);
  });

  it("pack verbs print their default text or 'nothing happens'", () => {
    expect(linesOf(run(["read note"]).output, "text")).toEqual(["Nothing to read."]);
    expect(linesOf(run(["read note"]).output, "echo")).toEqual(["Read note"]);
    expect(linesOf(run(["knock rug"]).output, "text")).toEqual(["Nothing happens."]);
  });
});

describe("validation and rejection", () => {
  const start = newGame(pack).state;
  const reject = (cmd: Command, state: GameState = start) => {
    const r = step(pack, state, cmd);
    expect(r.status).toBe("rejected");
    expect(r.state).toBe(state);
    expect(r.output).toHaveLength(1);
    expect(r.output[0]?.kind).toBe("system");
    return textOf(r.output);
  };

  it("rejects unknown verbs and objects", () => {
    expect(reject({ verb: "dance" })).toBe("Unknown verb: dance.");
    expect(reject({ verb: "take", object: "unicorn" })).toBe("Unknown object: unicorn.");
  });

  it("rejects objects that are not present", () => {
    expect(reject({ verb: "take", object: "far" })).toBe("You don't see that here.");
    expect(reject({ verb: "take", object: "coin" })).toBe("You don't see that here.");
    expect(reject({ verb: "use", object: "note", with: "far" })).toBe("You don't see that here.");
  });

  it("checks arity", () => {
    expect(reject({ verb: "take" })).toBe("That needs an object.");
    expect(reject({ verb: "give", object: "note" })).toBe("That needs a second object.");
    expect(reject({ verb: "wait", object: "note" })).toBe("Too many objects for that command.");
    expect(reject({ verb: "take", object: "key", with: "note" })).toBe("Too many objects for that command.");
    expect(reject({ verb: "look", object: "key", with: "note" })).toBe("Too many objects for that command.");
    expect(reject({ verb: "go" })).toBe("That needs an object.");
    expect(reject({ verb: "read" })).toBe("That needs an object.");
    expect(reject({ verb: "use", with: "note" })).toBe("That needs an object.");
    expect(reject({ verb: "use", object: "note", with: "note" })).toBe("You can't do that with itself.");
  });

  it("rejects choose outside a dialogue and other verbs inside one", () => {
    expect(reject({ verb: "choose", object: "bye" })).toBe("You are not in a conversation.");
    const talking = step(pack, start, { verb: "talk", object: "graves" }).state;
    expect(reject({ verb: "look" }, talking)).toBe("You are in a conversation. Choose a reply.");
    expect(reject({ verb: "choose", object: "nope" }, talking)).toBe("That reply is not available right now.");
    expect(step(pack, talking, { verb: "choose", object: "bye" }).status).toBe("ok");
  });

  it("rejects everything once the game is over", () => {
    const over: GameState = { ...start, ended: "won" };
    expect(reject({ verb: "look" }, over)).toBe("The game is over.");
  });

  it("a rejected command does not advance the turn or fire turn rules", () => {
    const withTurn = makePack({ ...pack, rules: [{ on: { event: "turn" }, do: { say: "tick" } }] });
    const s = newGame(withTurn).state;
    const r = step(withTurn, deepFreeze(s), { verb: "take", object: "far" });
    expect(r.status).toBe("rejected");
    expect(r.state.turn).toBe(0);
    expect(textOf(r.output)).not.toContain("tick");
  });
});
