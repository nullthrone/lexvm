import { describe, expect, it } from "vitest";
import { fold, foldWord, parseCommand } from "../src/parser.ts";
import { newGame, step } from "../src/runtime.ts";
import type { Pack } from "../src/schema.ts";
import type { Command, GameState, ParseResult } from "../src/types.ts";
import { loadFixture, loadLockedStudy, loadRepoPack, makePack, play } from "./fixtures/runtime/helpers.ts";

function cmd(r: ParseResult): Command | string {
  if (!r.ok) return `error:${r.error}`;
  return "command" in r ? r.command : `meta:${r.meta}`;
}

function parser(pack: Pack, state: GameState) {
  return (input: string) => cmd(parseCommand(pack, state, input));
}

describe("normalisation", () => {
  it("folds case, umlauts, ß, diacritics and punctuation", () => {
    expect(foldWord("Schlüssel")).toBe("schluessel");
    expect(foldWord("ÖFFNE")).toBe("oeffne");
    expect(foldWord("Straße")).toBe("strasse");
    expect(foldWord("Café")).toBe("cafe");
    expect(fold("  Nimm   den Schlüssel!  ")).toBe("nimm den schluessel");
    expect(fold("»Kennen Sie Brandt?«")).toBe("kennen sie brandt");
  });
});

describe("German parser", () => {
  const de = loadFixture("hafen.yaml");
  const kontor = newGame(de).state;
  const p = parser(de, kontor);

  it("parses core verbs with articles and umlauts", () => {
    expect(p("nimm das Logbuch")).toEqual({ verb: "take", object: "logbuch" });
    expect(p("Nimm Logbuch.")).toEqual({ verb: "take", object: "logbuch" });
    expect(p("nehme den schluessel")).toEqual({ verb: "take", object: "schluessel" });
    expect(p("hol den Schlüssel")).toEqual({ verb: "take", object: "schluessel" });
    expect(p("untersuche die Kiste")).toEqual({ verb: "look", object: "kiste" });
    expect(p("x kiste")).toEqual({ verb: "look", object: "kiste" });
    expect(p("betrachte luke")).toEqual({ verb: "look", object: "luke" });
    expect(p("öffne die Kiste")).toEqual({ verb: "open", object: "kiste" });
    expect(p("oeffne kiste")).toEqual({ verb: "open", object: "kiste" });
    expect(p("schließe die kiste")).toEqual({ verb: "close", object: "kiste" });
    expect(p("schliess kiste")).toEqual({ verb: "close", object: "kiste" });
    expect(p("drück die Luke")).toEqual({ verb: "push", object: "luke" });
    expect(p("ziehe an der luke")).toEqual({ verb: "pull", object: "luke" });
    expect(p("warte")).toEqual({ verb: "wait" });
    expect(p("z")).toEqual({ verb: "wait" });
    expect(p("i")).toEqual({ verb: "inventory" });
    expect(p("Inventar")).toEqual({ verb: "inventory" });
  });

  it("handles separable verbs and particles", () => {
    expect(p("heb das Logbuch auf")).toEqual({ verb: "take", object: "logbuch" });
    expect(p("mach die Kiste auf")).toEqual({ verb: "open", object: "kiste" });
    expect(p("mach kiste zu")).toEqual({ verb: "close", object: "kiste" });
    expect(p("schau dir das Logbuch an")).toEqual({ verb: "look", object: "logbuch" });
    expect(p("sieh logbuch an")).toEqual({ verb: "look", object: "logbuch" });
    expect(p("leg das logbuch ab")).toEqual({ verb: "drop", object: "logbuch" });
    expect(p("nimm logbuch mit")).toEqual({ verb: "take", object: "logbuch" });
    expect(p("schliess die Luke mit dem Schlüssel auf")).toEqual({
      verb: "use",
      object: "schluessel",
      with: "luke",
    });
    expect(p("schließ die Luke auf")).toEqual({ verb: "open", object: "luke" });
  });

  it("looks around", () => {
    expect(p("schau dich um")).toEqual({ verb: "look" });
    expect(p("sieh dich um")).toEqual({ verb: "look" });
    expect(p("l")).toEqual({ verb: "look" });
    expect(p("schau")).toEqual({ verb: "look" });
    expect(p("schau in die Kiste")).toEqual({ verb: "look", object: "kiste" });
  });

  it("uses pack verbs and their synonyms", () => {
    expect(p("lies das Logbuch")).toEqual({ verb: "lesen", object: "logbuch" });
    expect(p("Lesen Logbuch")).toEqual({ verb: "lesen", object: "logbuch" });
  });

  it("matches synonyms and compound heads", () => {
    expect(p("nimm Messingschlüssel")).toEqual({ verb: "take", object: "schluessel" });
    expect(p("nimm das Buch des Kapitäns")).toEqual({ verb: "take", object: "logbuch" });
    expect(p("öffne die Falltür")).toEqual({ verb: "open", object: "luke" });
  });

  it("splits two-object commands on prepositions", () => {
    expect(p("benutze den Schlüssel mit der Luke")).toEqual({ verb: "use", object: "schluessel", with: "luke" });
    expect(p("benutze Schlüssel an Luke")).toEqual({ verb: "use", object: "schluessel", with: "luke" });
    expect(p("verwende schluessel auf luke")).toEqual({ verb: "use", object: "schluessel", with: "luke" });
    expect(p("benutze den Schlüssel")).toEqual({ verb: "use", object: "schluessel" });
    expect(p("benutze Schlüssel und Logbuch")).toEqual({ verb: "use", object: "schluessel", with: "logbuch" });
    // German infinitive pack-verb labels also match their imperatives and win over core synonyms.
    expect(p("kombiniere Schlüssel und Logbuch")).toEqual({
      verb: "kombinieren",
      object: "schluessel",
      with: "logbuch",
    });
  });

  it("parses give and show with and without prepositions, npc swapped into second place", () => {
    const kai = play(de, ["take logbuch", "go north"]).state;
    const q = parser(de, kai);
    expect(q("gib das Logbuch an den Wirt")).toEqual({ verb: "give", object: "logbuch", with: "wirt" });
    expect(q("gib dem Wirt das Logbuch")).toEqual({ verb: "give", object: "logbuch", with: "wirt" });
    expect(q("zeig dem Mann das Logbuch")).toEqual({ verb: "show", object: "logbuch", with: "wirt" });
    expect(q("zeige Logbuch Wirt")).toEqual({ verb: "show", object: "logbuch", with: "wirt" });
    expect(q("gib Logbuch")).toBe("error:incomplete");
    const r = parseCommand(de, kai, "gib logbuch");
    expect(!r.ok && r.message).toBe("An wen?");
  });

  it("parses search, open … mit, take … aus and put … in", () => {
    expect(p("durchsuche die Kiste")).toEqual({ verb: "look", object: "kiste" });
    expect(p("öffne die Luke mit dem Schlüssel")).toEqual({ verb: "use", object: "schluessel", with: "luke" });
    const open = play(de, ["open kiste"]).state;
    const q = parser(de, open);
    expect(q("nimm das Foto aus der Kiste")).toEqual({ verb: "take", object: "foto" });
    expect(q("nimm Foto von Kiste")).toEqual({ verb: "take", object: "foto" });
    expect(q("leg das Logbuch in die Kiste")).toEqual({ verb: "use", object: "logbuch", with: "kiste" });
    expect(q("steck den Schlüssel ins Logbuch")).toEqual({ verb: "use", object: "schluessel", with: "logbuch" });
    // The separable forms keep their meaning.
    expect(q("leg das Logbuch ab")).toEqual({ verb: "drop", object: "logbuch" });
    expect(q("steck das Logbuch ein")).toEqual({ verb: "take", object: "logbuch" });
  });

  it("goes by exit name plus direction word, and by unvisited room names", () => {
    expect(p("geh die Kellertreppe hinunter")).toEqual({ verb: "go", object: "keller" });
    expect(p("geh zum Kai")).toEqual({ verb: "go", object: "north" });
    expect(p("geh hinunter zum Archiv")).toEqual({ verb: "go", object: "keller" });
    expect(parseCommand(de, kontor, "geh ins Hafenkontor")).toMatchObject({
      ok: false,
      error: "unknown-object",
      message: "Da bist du schon.",
    });
  });

  it("talks to characters", () => {
    const kai = play(de, ["go north"]).state;
    const q = parser(de, kai);
    expect(q("sprich mit dem Wirt")).toEqual({ verb: "talk", object: "wirt" });
    expect(q("rede mit wirt")).toEqual({ verb: "talk", object: "wirt" });
    expect(q("frag den Wirt nach Brandt")).toEqual({ verb: "talk", object: "wirt" });
  });

  it("parses directions and exit labels", () => {
    expect(p("n")).toEqual({ verb: "go", object: "north" });
    expect(p("norden")).toEqual({ verb: "go", object: "north" });
    expect(p("nach Norden")).toEqual({ verb: "go", object: "north" });
    expect(p("geh nach norden")).toEqual({ verb: "go", object: "north" });
    expect(p("gehe nach Süden")).toEqual({ verb: "go", object: "south" });
    expect(p("north")).toEqual({ verb: "go", object: "north" });
    expect(p("Kellertreppe")).toEqual({ verb: "go", object: "keller" });
    expect(p("geh die Treppe")).toEqual({ verb: "go", object: "keller" });
    expect(p("geh durch die Luke")).toEqual({ verb: "go", object: "keller" });
    expect(p("o")).toEqual({ verb: "go", object: "east" });
    expect(p("runter")).toEqual({ verb: "go", object: "down" });
    expect(p("nach oben")).toEqual({ verb: "go", object: "up" });
    expect(p("geh")).toBe("error:incomplete");
    expect(p("geh nach Paris")).toBe("error:unknown-object");
  });

  it("goes to visited rooms by name", () => {
    const back = play(de, ["go north", "go south"]).state;
    expect(parser(de, back)("geh zum Kai")).toEqual({ verb: "go", object: "north" });
  });

  it("reports ambiguity, absence, unknown words and missing objects", () => {
    const archiv = play(de, ["take schluessel", "open luke", "go keller"]).state;
    const r = parseCommand(de, archiv, "nimm das Buch");
    expect(r).toMatchObject({
      ok: false,
      error: "ambiguous",
      candidates: [
        { id: "rotes_buch", name: "rotes Buch" },
        { id: "blaues_buch", name: "blaues Buch" },
      ],
    });
    expect(!r.ok && r.message).toBe("Was meinst du: rotes Buch oder blaues Buch?");
    expect(parser(de, archiv)("nimm das rote Buch")).toEqual({ verb: "take", object: "rotes_buch" });
    expect(parser(de, archiv)("nimm roten buch")).toEqual({ verb: "take", object: "rotes_buch" });
    expect(parser(de, archiv)("nimm blaues")).toEqual({ verb: "take", object: "blaues_buch" });

    const notHere = parseCommand(de, kontor, "nimm das rote Buch");
    expect(notHere).toMatchObject({ ok: false, error: "not-here", message: "Das siehst du hier nicht." });
    const unknownObject = parseCommand(de, kontor, "nimm den Regenschirm");
    expect(unknownObject).toMatchObject({ ok: false, error: "unknown-object" });
    expect(!unknownObject.ok && unknownObject.message).toBe("„Regenschirm“ kenne ich nicht.");
    const unknownVerb = parseCommand(de, kontor, "tanze mit der Kiste");
    expect(unknownVerb).toMatchObject({ ok: false, error: "unknown-verb" });
    expect(!unknownVerb.ok && unknownVerb.message).toBe("Das Verb „tanze“ kenne ich nicht.");
    const incomplete = parseCommand(de, kontor, "nimm");
    expect(incomplete).toMatchObject({ ok: false, error: "incomplete", message: "Nehmen – was?" });
    expect(parseCommand(de, kontor, "   ")).toMatchObject({ ok: false, error: "empty" });
    expect(parseCommand(de, kontor, "!!!")).toMatchObject({ ok: false, error: "empty" });
  });

  it("recognises meta commands", () => {
    // "zurück" means "go back" to players, never "undo".
    expect(p("zurück")).toBe("error:unknown-verb");
    expect(p("Rückgängig")).toBe("meta:undo");
    expect(p("undo")).toBe("meta:undo");
    expect(p("neustart")).toBe("meta:restart");
    expect(p("tipp")).toBe("meta:hint");
    expect(p("Hinweis")).toBe("meta:hint");
    expect(p("hilfe")).toBe("meta:help");
    expect(p("?")).toBe("meta:help");
    expect(p("speichern")).toBe("meta:save");
    expect(p("laden")).toBe("meta:load");
    expect(p("beenden")).toBe("meta:quit");
    expect(p("q")).toBe("meta:quit");
  });

  it("chooses dialogue options by number or by words", () => {
    const withPhoto = play(de, ["open kiste", "take foto", "go north", "talk wirt"]).state;
    const q = parser(de, withPhoto);
    expect(q("1")).toEqual({ verb: "choose", object: "frage_brandt" });
    expect(q("2")).toEqual({ verb: "choose", object: "zeige_foto" });
    expect(q("3")).toEqual({ verb: "choose", object: "tschuess" });
    expect(q("9")).toBe("error:unknown-object");
    expect(q("Kennen Sie Karl Brandt")).toEqual({ verb: "choose", object: "frage_brandt" });
    expect(q("brandt")).toEqual({ verb: "choose", object: "frage_brandt" });
    expect(q("gesehen")).toEqual({ verb: "choose", object: "zeige_foto" });
    expect(q("hilfe")).toBe("meta:help");
    const none = parseCommand(de, withPhoto, "nimm logbuch");
    expect(none).toMatchObject({ ok: false });
    expect(!none.ok && none.message).toBe("Wähle eine Antwort (1–3).");
  });

  it("produces commands the runtime accepts", () => {
    const inputs = ["nimm logbuch", "lies logbuch", "n", "sprich mit dem wirt", "1", "1", "2"];
    let state = kontor;
    for (const input of inputs) {
      const r = parseCommand(de, state, input);
      if (!r.ok || !("command" in r)) throw new Error(`parse failed: ${input}`);
      const s = step(de, state, r.command);
      expect(s.status, input).toBe("ok");
      state = s.state;
    }
    const final = parseCommand(de, state, "kombiniere die Aussage des Wirts mit der Notiz");
    expect(final).toEqual({ ok: true, command: { verb: "kombinieren", object: "aussage_wirt", with: "notiz" } });
    const verknuepfe = parseCommand(de, state, "verknüpfe Aussage mit Notiz");
    expect(verknuepfe).toEqual({ ok: true, command: { verb: "kombinieren", object: "aussage_wirt", with: "notiz" } });
  });
});

describe("English parser", () => {
  const en = loadLockedStudy();
  const hall = newGame(en).state;
  const p = parser(en, hall);

  it("parses core verbs and phrasal verbs", () => {
    expect(p("talk to Graves")).toEqual({ verb: "talk", object: "graves" });
    expect(p("speak with the butler")).toEqual({ verb: "talk", object: "graves" });
    expect(p("ask graves about uncle")).toEqual({ verb: "talk", object: "graves" });
    expect(p("examine the oak door")).toEqual({ verb: "look", object: "study_door" });
    expect(p("x door")).toEqual({ verb: "look", object: "study_door" });
    expect(p("look at the door")).toEqual({ verb: "look", object: "study_door" });
    expect(p("look")).toEqual({ verb: "look" });
    expect(p("look around")).toEqual({ verb: "look" });
    expect(p("open the door")).toEqual({ verb: "open", object: "study_door" });
    expect(p("shut door")).toEqual({ verb: "close", object: "study_door" });
    expect(p("wait")).toEqual({ verb: "wait" });
    expect(p("z")).toEqual({ verb: "wait" });
    expect(p("i")).toEqual({ verb: "inventory" });
  });

  it("parses take/drop variants and pack verbs", () => {
    const library = play(en, ["go west", "pull red_book"]).state;
    const q = parser(en, library);
    expect(q("take the brass key")).toEqual({ verb: "take", object: "brass_key" });
    expect(q("get key")).toEqual({ verb: "take", object: "brass_key" });
    expect(q("pick up the key")).toEqual({ verb: "take", object: "brass_key" });
    expect(q("pick key up")).toEqual({ verb: "take", object: "brass_key" });
    expect(q("pull the red book")).toEqual({ verb: "pull", object: "red_book" });
    expect(q("pull book")).toEqual({ verb: "pull", object: "red_book" });
    const holding = play(en, ["go west", "pull red_book", "take brass_key"]).state;
    expect(parser(en, holding)("put down the key")).toEqual({ verb: "drop", object: "brass_key" });
    expect(parser(en, holding)("put key down")).toEqual({ verb: "drop", object: "brass_key" });
    expect(parser(en, holding)("drop keys")).toEqual({ verb: "drop", object: "brass_key" });
    const study = play(en, ["go west", "pull red_book", "take brass_key", "go east", "open study_door", "go north"]);
    expect(parser(en, study.state)("read the letter")).toBe("error:not-here");
    const opened = step(en, study.state, { verb: "open", object: "desk" }).state;
    expect(parser(en, opened)("read the letter")).toEqual({ verb: "read", object: "letter" });
    expect(parser(en, opened)("peruse note")).toEqual({ verb: "read", object: "letter" });
  });

  it("parses use and unlock with prepositions", () => {
    const holding = play(en, ["go west", "pull red_book", "take brass_key", "go east"]).state;
    const q = parser(en, holding);
    expect(q("use the key with the door")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("use key on door")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("unlock the door with the key")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("unlock door")).toEqual({ verb: "open", object: "study_door" });
    expect(q("show the key to Graves")).toEqual({ verb: "show", object: "brass_key", with: "graves" });
    expect(q("give graves the key")).toEqual({ verb: "give", object: "brass_key", with: "graves" });
    expect(q("give key to")).toBe("error:incomplete");
    expect(q("open the door with the key")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("put the key in the door")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("insert key into door")).toEqual({ verb: "use", object: "brass_key", with: "study_door" });
    expect(q("put key down")).toEqual({ verb: "drop", object: "brass_key" });
    // A missing second object is reported as such, not as an unknown two-word name.
    expect(parseCommand(en, holding, "show graves the letter")).toMatchObject({ ok: false, error: "not-here" });
  });

  it("parses search and take … from", () => {
    const study = play(en, ["go west", "pull red_book", "take brass_key", "go east", "open study_door", "go north"]);
    const opened = step(en, study.state, { verb: "open", object: "desk" }).state;
    const q = parser(en, opened);
    expect(q("search the desk")).toEqual({ verb: "look", object: "desk" });
    expect(q("take the letter from the desk")).toEqual({ verb: "take", object: "letter" });
    expect(q("take letter out of drawer")).toEqual({ verb: "take", object: "letter" });
    expect(q("get the letter off the desk")).toEqual({ verb: "take", object: "letter" });
  });

  it("goes to rooms by name, visited or not, and knows where the player is", () => {
    expect(p("go to the library")).toEqual({ verb: "go", object: "west" });
    expect(p("enter the study")).toEqual({ verb: "go", object: "north" });
    expect(parseCommand(en, hall, "go to the entrance hall")).toMatchObject({
      ok: false,
      message: "You are already there.",
    });
    const study = play(en, ["go west", "pull red_book", "take brass_key", "go east", "open study_door", "go north"]);
    const q = parser(en, study.state);
    // "study" is also a word of the door's synonym "study door"; the room name wins.
    expect(parseCommand(en, study.state, "enter study")).toMatchObject({ ok: false, error: "unknown-object" });
    expect(q("go through the study door")).toEqual({ verb: "go", object: "south" });
    // The study has a single exit and no 'out' exit: "leave" takes it.
    expect(q("leave")).toEqual({ verb: "go", object: "south" });
    expect(p("leave")).toEqual({ verb: "go", object: "out" });
    expect(q("go back to the hall")).toEqual({ verb: "go", object: "south" });
    expect(parseCommand(en, study.state, "ask graves about the password")).toMatchObject({ error: "not-here" });
  });

  it("parses directions", () => {
    expect(p("w")).toEqual({ verb: "go", object: "west" });
    expect(p("west")).toEqual({ verb: "go", object: "west" });
    expect(p("go west")).toEqual({ verb: "go", object: "west" });
    expect(p("walk north")).toEqual({ verb: "go", object: "north" });
    expect(p("go to the north")).toEqual({ verb: "go", object: "north" });
    expect(p("go through the door")).toEqual({ verb: "go", object: "north" });
    expect(p("westen")).toEqual({ verb: "go", object: "west" });
    // A direction that is not an exit here is still parsed; the runtime rejects it.
    expect(p("s")).toEqual({ verb: "go", object: "south" });
    expect(step(en, hall, { verb: "go", object: "south" }).status).toBe("rejected");
  });

  it("reports errors in English", () => {
    expect(parseCommand(en, hall, "dance")).toMatchObject({
      ok: false,
      error: "unknown-verb",
      message: 'I don\'t know the verb "dance".',
    });
    expect(parseCommand(en, hall, "take")).toMatchObject({ ok: false, error: "incomplete", message: "Take what?" });
    expect(parseCommand(en, hall, "take the letter")).toMatchObject({ ok: false, error: "not-here" });
    expect(parseCommand(en, hall, "take the umbrella")).toMatchObject({
      ok: false,
      error: "unknown-object",
      message: 'I don\'t know what "umbrella" is.',
    });
    expect(parseCommand(en, hall, "go")).toMatchObject({ ok: false, error: "incomplete", message: "Where to?" });
  });

  it("recognises meta commands", () => {
    for (const [input, meta] of [
      ["undo", "undo"],
      ["restart", "restart"],
      ["hint", "hint"],
      ["help", "help"],
      ["?", "help"],
      ["save", "save"],
      ["restore", "load"],
      ["quit", "quit"],
      ["q", "quit"],
    ] as const) {
      expect(p(input)).toBe(`meta:${meta}`);
    }
  });

  it("chooses dialogue options", () => {
    const talking = step(en, hall, { verb: "talk", object: "graves" }).state;
    const q = parser(en, talking);
    expect(q("1")).toEqual({ verb: "choose", object: "ask_uncle" });
    expect(q("2")).toEqual({ verb: "choose", object: "bye" });
    expect(q("where is my uncle")).toEqual({ verb: "choose", object: "ask_uncle" });
    expect(q("nothing")).toEqual({ verb: "choose", object: "bye" });
  });

  it("reports ambiguous dialogue choices", () => {
    const pack = makePack({
      start: { room: "r" },
      rooms: { r: { name: "R", description: "R." } },
      objects: { ann: { name: "Ann", location: "r", npc: true, dialogue: "d" } },
      dialogues: {
        d: {
          start: "a",
          nodes: {
            a: {
              say: "?",
              options: [
                { id: "red", text: "The red door." },
                { id: "blue", text: "The blue door." },
              ],
            },
          },
        },
      },
    });
    const talking = step(pack, newGame(pack).state, { verb: "talk", object: "ann" }).state;
    const r = parseCommand(pack, talking, "door");
    expect(r).toMatchObject({
      ok: false,
      error: "ambiguous",
      candidates: [
        { id: "red", name: "The red door." },
        { id: "blue", name: "The blue door." },
      ],
    });
    expect(parseCommand(pack, talking, "blue")).toEqual({ ok: true, command: { verb: "choose", object: "blue" } });
  });

  it("prefers the most specific object match", () => {
    const pack = makePack({
      start: { room: "r" },
      rooms: { r: { name: "R", description: "R." } },
      objects: {
        door: { name: "door", location: "r" },
        cellar_door: { name: "cellar door", synonyms: ["door"], location: "r" },
        key: { name: "key", location: "r", portable: true },
        key_ring: { name: "key ring", location: "r", portable: true },
      },
    });
    const q = parser(pack, newGame(pack).state);
    expect(q("open door")).toEqual({ verb: "open", object: "door" });
    expect(q("open cellar door")).toEqual({ verb: "open", object: "cellar_door" });
    expect(q("take key")).toEqual({ verb: "take", object: "key" });
    expect(q("take key ring")).toEqual({ verb: "take", object: "key_ring" });
    expect(q("take ring")).toEqual({ verb: "take", object: "key_ring" });
  });

  it("lets pack verbs override core phrases, even the internal unlock shortcut", () => {
    const pack = makePack({
      start: { room: "r" },
      verbs: { unlock: { label: "Unlock" }, read: { label: "Read", synonyms: ["study"] } },
      rooms: { r: { name: "R", description: "R." } },
      objects: { safe: { name: "safe", location: "r", verbs: ["unlock"] } },
    });
    const q = parser(pack, newGame(pack).state);
    expect(q("unlock the safe")).toEqual({ verb: "unlock", object: "safe" });
    expect(q("read safe")).toEqual({ verb: "read", object: "safe" });
    expect(q("study safe")).toEqual({ verb: "read", object: "safe" });
  });

  it("prefers the object named as written over one that matches only after stemming", () => {
    const en = makePack({
      start: { room: "r" },
      rooms: { r: { name: "R", description: "R." } },
      objects: {
        book: { name: "red book", location: "r", portable: true },
        books: { name: "books", location: "r" },
        key: { name: "brass key", location: "r", portable: true },
        keys: { name: "keys", location: "r", portable: true },
        box: { name: "box", location: "r", openable: true, container: true },
      },
    });
    const q = parser(en, newGame(en).state);
    expect(q("take book")).toEqual({ verb: "take", object: "book" });
    expect(q("take books")).toEqual({ verb: "take", object: "books" });
    expect(q("take key")).toEqual({ verb: "take", object: "key" });
    expect(q("take keys")).toEqual({ verb: "take", object: "keys" });
    expect(q("open box with key")).toEqual({ verb: "use", object: "key", with: "box" });
    const de = makePack({
      language: "de",
      start: { room: "r" },
      rooms: { r: { name: "Raum", description: "R." } },
      objects: {
        brief: { name: "alter Brief", location: "r", portable: true },
        briefe: { name: "Briefe", location: "r", portable: true },
        kiste: { name: "kleine Kiste", location: "r", openable: true },
        kisten: { name: "Kisten", location: "r" },
      },
    });
    const d = parser(de, newGame(de).state);
    expect(d("nimm den Brief")).toEqual({ verb: "take", object: "brief" });
    expect(d("nimm den alten Brief")).toEqual({ verb: "take", object: "brief" });
    expect(d("nimm die Briefe")).toEqual({ verb: "take", object: "briefe" });
    expect(d("öffne die Kiste")).toEqual({ verb: "open", object: "kiste" });
  });

  it("accepts short direction words of other languages only for n, s, e, w", () => {
    const rooms = {
      r: {
        name: "R",
        description: "R.",
        exits: { northeast: { to: "a" }, southeast: { to: "a" }, east: { to: "a" }, up: { to: "a" } },
      },
      a: { name: "A", description: "A." },
    };
    const en = makePack({ start: { room: "r" }, rooms });
    const q = parser(en, newGame(en).state);
    for (const word of ["no", "so", "o"]) expect(q(word)).toBe("error:unknown-verb");
    expect(q("oben")).toEqual({ verb: "go", object: "up" });
    expect(q("ne")).toEqual({ verb: "go", object: "northeast" });
    const de = makePack({ language: "de", start: { room: "r" }, rooms });
    const d = parser(de, newGame(de).state);
    expect(d("no")).toEqual({ verb: "go", object: "northeast" });
    expect(d("o")).toEqual({ verb: "go", object: "east" });
    expect(d("e")).toEqual({ verb: "go", object: "east" });
    expect(d("north")).toEqual({ verb: "go", object: "north" });
    expect(d("ne")).toBe("error:unknown-verb");
  });

  it("maps German particle verbs and lets exit labels win over meta words", () => {
    const de = makePack({
      language: "de",
      start: { room: "r" },
      rooms: {
        r: { name: "Gasse", description: "R.", exits: { laden: { to: "a", label: "Laden" } } },
        a: { name: "Laden", description: "A." },
      },
      objects: {
        brief: { name: "Brief", location: "inventory", portable: true },
        tuer: { name: "Tür", location: "r", openable: true },
      },
    });
    const d = parser(de, newGame(de).state);
    expect(d("leg den Brief hin")).toEqual({ verb: "drop", object: "brief" });
    expect(d("leg den Brief ab")).toEqual({ verb: "drop", object: "brief" });
    expect(d("schließ die Tür ab")).toBe("error:unknown-verb");
    expect(d("zieh den Brief aus der Tür")).toEqual({ verb: "take", object: "brief" });
    expect(d("zieh die Tür")).toEqual({ verb: "pull", object: "tuer" });
    expect(d("schließ die Tür")).toEqual({ verb: "close", object: "tuer" });
    expect(d("Laden")).toEqual({ verb: "go", object: "laden" });
    expect(d("speichern")).toBe("meta:save");
  });

  it("falls back to English vocabulary for other languages", () => {
    const pack = makePack({
      language: "fr",
      start: { room: "r" },
      rooms: { r: { name: "R", description: "R." } },
      objects: { cle: { name: "clé", location: "r", portable: true } },
    });
    expect(parser(pack, newGame(pack).state)("take cle")).toEqual({ verb: "take", object: "cle" });
  });
});

describe("exits and vehicles from playtests", () => {
  const rooms = {
    kai: {
      name: "Am Kai",
      description: "Der Kai.",
      exits: {
        strassenbahn: { to: "siedlung", label: "Straßenbahn zur Siedlung", synonyms: ["Straßenbahn", "Bahn", "Tram"] },
        ueberfahrt: {
          to: "speicher",
          label: "Mit Tadeusz übersetzen",
          synonyms: ["Boot", "übersetzen"],
          visibleWhen: { flag: "rudert" },
        },
        hintertuer: { to: "hof", label: "Durch die Hintertür" },
      },
    },
    siedlung: { name: "Siedlung", description: "S." },
    speicher: { name: "Speicher", description: "S." },
    hof: { name: "Hof", description: "H." },
  };
  const de = makePack({
    language: "de",
    start: { room: "kai" },
    flags: { rudert: false },
    rooms,
    objects: {
      laterne: { name: "Sturmlaterne", synonyms: ["Laterne"], location: "inventory", portable: true },
      streichhoelzer: { name: "Streichhölzer", synonyms: ["Streichholz"], location: "inventory", portable: true },
      anweisung: { name: "Anweisung", location: "inventory", clue: true },
      persilschein: { name: "Persilschein", location: "inventory", clue: true },
    },
  });
  const start = newGame(de).state;
  const rowing: GameState = { ...start, flags: { ...start.flags, rudert: true } };

  it("accepts bare ids and labels of listed exits, also exits revealed later", () => {
    const d = parser(de, start);
    expect(d("ueberfahrt")).toBe("error:unknown-verb");
    const r = parser(de, rowing);
    expect(r("ueberfahrt")).toEqual({ verb: "go", object: "ueberfahrt" });
    expect(r("Überfahrt")).toEqual({ verb: "go", object: "ueberfahrt" });
    expect(r("Mit Tadeusz übersetzen")).toEqual({ verb: "go", object: "ueberfahrt" });
    expect(r("geh ueberfahrt")).toEqual({ verb: "go", object: "ueberfahrt" });
    expect(d("hintertuer")).toEqual({ verb: "go", object: "hintertuer" });
    expect(d("durch die Hintertür")).toEqual({ verb: "go", object: "hintertuer" });
    expect(d("Straßenbahn zur Siedlung")).toEqual({ verb: "go", object: "strassenbahn" });
  });

  it("every exit listed in a room of the repository packs parses on its own", () => {
    for (const pack of [loadLockedStudy(), loadRepoPack("letzte-nacht-der-reichsmark")]) {
      const state = newGame(pack).state;
      for (const [roomId, room] of Object.entries(pack.rooms)) {
        // Every exit as if visible: the parser must take exits that appear mid-game the same way.
        const here: GameState = { ...state, room: roomId, dialogue: null };
        for (const [id, exit] of Object.entries(room.exits ?? {})) {
          const visible = {
            ...pack,
            rooms: { ...pack.rooms, [roomId]: { ...room, exits: { [id]: { ...exit, visibleWhen: undefined } } } },
          };
          const q = parser(visible as Pack, here);
          expect(q(id), `${pack.id}: ${roomId}.${id}`).toEqual({ verb: "go", object: id });
          if (exit.label !== undefined)
            expect(q(exit.label), `${pack.id}: ${exit.label}`).toEqual({ verb: "go", object: id });
        }
      }
    }
  });

  it("maps lighting, comparing and connecting to use", () => {
    const d = parser(de, start);
    expect(d("zünde die Laterne mit den Streichhölzern an")).toEqual({
      verb: "use",
      object: "laterne",
      with: "streichhoelzer",
    });
    expect(d("zünde ein Streichholz an")).toEqual({ verb: "use", object: "streichhoelzer" });
    expect(d("zünde Laterne an")).toEqual({ verb: "use", object: "laterne" });
    expect(d("entzünde das Streichholz")).toEqual({ verb: "use", object: "streichhoelzer" });
    expect(d("vergleiche die Anweisung mit dem Persilschein")).toEqual({
      verb: "use",
      object: "anweisung",
      with: "persilschein",
    });
    expect(d("verbinde Anweisung mit Persilschein")).toEqual({
      verb: "use",
      object: "anweisung",
      with: "persilschein",
    });
    expect(d("notizbuch")).toEqual({ verb: "inventory" });
  });

  it("lights in either order: use a b falls back to the rule for use b a", () => {
    const pack = makePack({
      ...{ language: "de", start: { room: "kai" }, flags: { rudert: false, an: false }, rooms },
      objects: (de as Pack).objects,
      rules: [
        { on: { verb: "use", object: "streichhoelzer", with: "laterne" }, do: [{ set: "an" }, { say: "Brennt." }] },
      ],
    });
    const q = parser(pack, newGame(pack).state);
    const cmdLight = q("zünde die Laterne mit den Streichhölzern an") as Command;
    const r = step(pack, newGame(pack).state, cmdLight);
    expect(r.state.flags.an).toBe(true);
  });

  it("takes vehicles named like a listed exit", () => {
    const d = parser(de, rowing);
    expect(d("fahr mit der Straßenbahn")).toEqual({ verb: "go", object: "strassenbahn" });
    expect(d("fahre mit der Bahn")).toEqual({ verb: "go", object: "strassenbahn" });
    expect(d("steig in die Straßenbahn")).toEqual({ verb: "go", object: "strassenbahn" });
    expect(d("steig in die Tram ein")).toEqual({ verb: "go", object: "strassenbahn" });
    expect(d("steig ins Boot")).toEqual({ verb: "go", object: "ueberfahrt" });
    expect(d("nimm die Straßenbahn")).toEqual({ verb: "go", object: "strassenbahn" });
    expect(d("nimm die Laterne")).toEqual({ verb: "take", object: "laterne" });
    // No such exit here: the take error stays.
    expect(d("nimm den Bus")).toBe("error:unknown-object");

    const en = makePack({
      start: { room: "stop" },
      rooms: {
        stop: {
          name: "Tram stop",
          description: "A stop.",
          exits: {
            tram: { to: "town", label: "Tram to town", synonyms: ["tram"] },
            ferry: { to: "isle", label: "Ferry", synonyms: ["boat"] },
          },
        },
        town: { name: "Town", description: "T." },
        isle: { name: "Isle", description: "I." },
      },
      objects: { ticket: { name: "ticket", location: "stop", portable: true } },
    });
    const q = parser(en, newGame(en).state);
    expect(q("take the tram")).toEqual({ verb: "go", object: "tram" });
    expect(q("ride the tram")).toEqual({ verb: "go", object: "tram" });
    expect(q("board the boat")).toEqual({ verb: "go", object: "ferry" });
    expect(q("get in the boat")).toEqual({ verb: "go", object: "ferry" });
    expect(q("take the ticket")).toEqual({ verb: "take", object: "ticket" });
  });

  it("says which dialogue number does not exist, in the pack's language", () => {
    const talk = makePack({
      language: "de",
      start: { room: "r" },
      rooms: { r: { name: "R", description: "R." } },
      objects: { anni: { name: "Anni", location: "r", npc: true, dialogue: "d" } },
      dialogues: {
        d: { with: "anni", start: "a", nodes: { a: { say: "Ja?", options: [{ id: "x", text: "Nichts." }] } } },
      },
    });
    const state = step(talk, newGame(talk).state, { verb: "talk", object: "anni" }).state;
    expect(parseCommand(talk, state, "3")).toMatchObject({
      ok: false,
      message: "Antwort 3 gibt es nicht. Wähle eine Antwort (1–1).",
    });
    expect(parseCommand({ ...talk, language: "en" }, state, "3")).toMatchObject({
      ok: false,
      message: "There is no reply 3. Choose a reply (1–1).",
    });
  });
});
