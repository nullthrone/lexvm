import { describe, expect, it } from "vitest";
import { fill, fmt, joinSpans, messagesFor } from "../src/messages/index.ts";
import { initialState } from "../src/runtime.ts";
import { inlineSpans, markup, objectName, paragraphs, renderPlain, resolveText, textBlocks } from "../src/text.ts";
import type { OutputBlock } from "../src/types.ts";
import { makePack } from "./fixtures/runtime/helpers.ts";

const pack = makePack({
  start: { room: "hall" },
  flags: { lit: false },
  rooms: { hall: { name: "Hall", description: "A hall." } },
  objects: {
    logbook: { name: "logbook", location: "hall" },
    key: { name: "brass key", location: "hall" },
    porter: { name: [{ when: { flag: "lit" }, text: "Graves" }, { text: "porter" }], location: "hall", npc: true },
  },
});

describe("Text resolution", () => {
  const state = initialState(pack);
  const lit = { ...state, flags: { lit: true } };

  it("returns plain strings as they are", () => {
    expect(resolveText(pack, state, "Plain.")).toBe("Plain.");
    expect(resolveText(pack, state, undefined)).toBeNull();
  });

  it("uses the first variant whose when holds", () => {
    const text = [{ when: [{ flag: "lit" }], text: "Bright." }, { text: "Dark." }];
    expect(resolveText(pack, state, text)).toBe("Dark.");
    expect(resolveText(pack, lit, text)).toBe("Bright.");
    expect(resolveText(pack, state, [{ when: [{ flag: "lit" }], text: "Bright." }])).toBeNull();
  });
});

describe("markup", () => {
  it("turns {id} into a reference with the object's name", () => {
    expect(markup(pack, null, "Read the {logbook} now.")).toEqual([
      { text: "Read the " },
      { text: "logbook", ref: "logbook" },
      { text: " now." },
    ]);
  });

  it("turns {id|text} into a reference with custom text", () => {
    expect(markup(pack, null, "{key|Der Schlüssel} glänzt.")).toEqual([
      { text: "Der Schlüssel", ref: "key" },
      { text: " glänzt." },
    ]);
  });

  it("leaves unknown ids and non-markup braces as raw text", () => {
    expect(markup(pack, null, "A {ghost} and {key}.")).toEqual([
      { text: "A {ghost} and " },
      { text: "brass key", ref: "key" },
      { text: "." },
    ]);
    expect(markup(pack, null, "Odd { spaced } and {Upper}.")).toEqual([{ text: "Odd { spaced } and {Upper}." }]);
  });

  it("splits paragraphs on blank lines and keeps single newlines", () => {
    expect(paragraphs("One\nline two.\n\n  \n\nThree.\r\n\r\nFour.\n")).toEqual(["One\nline two.", "Three.", "Four."]);
    const blocks = textBlocks(pack, null, "npc", "Hi {key}.\n\nBye.");
    expect(blocks).toEqual([
      {
        kind: "npc",
        spans: [{ text: "Hi " }, { text: "brass key", ref: "key" }, { text: "." }],
      },
      { kind: "npc", spans: [{ text: "Bye." }] },
    ]);
  });

  it("joins paragraphs into one line for roomText", () => {
    expect(inlineSpans(pack, null, "A {key}.\n\nShiny.")).toEqual([
      { text: "A " },
      { text: "brass key", ref: "key" },
      { text: ". Shiny." },
    ]);
  });
});

describe("name variants", () => {
  const state = initialState(pack);
  const lit = { ...state, flags: { lit: true } };

  it("shows the name of the first variant whose when holds", () => {
    expect(objectName(pack, state, "porter")).toBe("porter");
    expect(objectName(pack, lit, "porter")).toBe("Graves");
    expect(objectName(pack, state, "key")).toBe("brass key");
    expect(objectName(pack, state, "ghost")).toBe("ghost");
  });

  it("uses the first variant without a state", () => {
    expect(objectName(pack, null, "porter")).toBe("Graves");
  });

  it("resolves {id} references against the state", () => {
    expect(markup(pack, state, "The {porter} nods.")[1]).toEqual({ text: "porter", ref: "porter" });
    expect(markup(pack, lit, "The {porter} nods.")[1]).toEqual({ text: "Graves", ref: "porter" });
  });
});

describe("messages", () => {
  it("selects the catalog by language prefix with English fallback", () => {
    expect(messagesFor("de").lang).toBe("de");
    expect(messagesFor("de-AT").lang).toBe("de");
    expect(messagesFor("en-GB").lang).toBe("en");
    expect(messagesFor("fr").lang).toBe("en");
  });

  it("formats templates with references and capitalizes a leading placeholder", () => {
    expect(fmt("Taken: {obj}.", { obj: [{ text: "key", ref: "key" }] })).toEqual([
      { text: "Taken: " },
      { text: "key", ref: "key" },
      { text: "." },
    ]);
    expect(fmt("{npc} is not interested.", { npc: [{ text: "barman", ref: "barman" }] })).toEqual([
      { text: "Barman", ref: "barman" },
      { text: " is not interested." },
    ]);
    expect(fmt("+{n} points.", { n: 3 })).toEqual([{ text: "+3 points." }]);
    expect(fmt("Keep {unknown}.")).toEqual([{ text: "Keep {unknown}." }]);
    expect(fill("Go {dir}", { dir: "north" })).toBe("Go north");
    expect(joinSpans([[{ text: "a", ref: "a" }], [{ text: "b" }]])).toEqual([{ text: "a", ref: "a" }, { text: ", b" }]);
  });

  it("German catalog: no articles around object names, du-form", () => {
    const de = messagesFor("de");
    for (const key of ["taken", "dropped", "opened", "closed", "learned", "unlocked", "hereLies"] as const) {
      expect(de[key]).not.toMatch(/\b(der|die|das|den|dem|des)\s+\{/i);
    }
    expect(de.taken).toBe("Genommen: {obj}.");
    expect(de.rejectNotHere).toBe("Das siehst du hier nicht.");
    expect(de.notTakeable).toBe("Das lässt sich nicht nehmen.");
    expect(de.dropped).toBe("Abgelegt: {obj}.");
    expect(de.locked).toBe("Verschlossen.");
    expect(de.nothingHappens).toBe("Nichts passiert.");
    expect(de.timePasses).toBe("Die Zeit vergeht.");
    expect(de.learned).toBe("Neu im Notizbuch: {obj}.");
    expect(de.pointsGained).toBe("+{n} Punkte.");
    expect(Object.values(de.exitLabels)).toEqual([
      "Norden",
      "Süden",
      "Osten",
      "Westen",
      "Nordosten",
      "Nordwesten",
      "Südosten",
      "Südwesten",
      "hinauf",
      "hinunter",
      "hinein",
      "hinaus",
    ]);
  });
});

describe("renderPlain", () => {
  it("renders every block kind readably", () => {
    const blocks: OutputBlock[] = [
      { kind: "echo", spans: [{ text: "Take key" }] },
      { kind: "room-title", spans: [{ text: "Library" }] },
      { kind: "text", spans: [{ text: "Books " }, { text: "everywhere", ref: "books" }, { text: "." }] },
      { kind: "npc", spans: [{ text: '"Hello."' }] },
      { kind: "player", spans: [{ text: '"Hi."' }] },
      { kind: "system", spans: [{ text: "Exits: east." }] },
      { kind: "ending", spans: [{ text: "The End" }] },
      { kind: "ending", spans: [{ text: "You made it." }] },
    ];
    expect(renderPlain(blocks)).toBe(
      [
        "> Take key",
        "== Library ==",
        "Books everywhere.",
        '"Hello."',
        '"Hi."',
        "(Exits: east.)",
        "*** The End ***",
        "You made it.",
      ].join("\n\n"),
    );
    expect(renderPlain([])).toBe("");
  });
});
