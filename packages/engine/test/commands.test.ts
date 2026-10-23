import { describe, expect, it } from "vitest";
import { commandLabel, formatCommand, parseCanonical } from "../src/commands.ts";
import { loadFixture, loadLockedStudy, makePack } from "./fixtures/runtime/helpers.ts";

describe("canonical commands", () => {
  it("formats verb [object [with]]", () => {
    expect(formatCommand({ verb: "wait" })).toBe("wait");
    expect(formatCommand({ verb: "take", object: "brass_key" })).toBe("take brass_key");
    expect(formatCommand({ verb: "use", object: "brass_key", with: "study_door" })).toBe("use brass_key study_door");
  });

  it("parses the canonical form", () => {
    expect(parseCanonical("wait")).toEqual({ verb: "wait" });
    expect(parseCanonical("go north")).toEqual({ verb: "go", object: "north" });
    expect(parseCanonical("use brass_key study_door")).toEqual({
      verb: "use",
      object: "brass_key",
      with: "study_door",
    });
    expect(parseCanonical("  take key  ")).toEqual({ verb: "take", object: "key" });
  });

  it("rejects malformed strings", () => {
    for (const bad of [
      "",
      "   ",
      "Take key",
      "take  key",
      "take key door extra",
      "take brass-key",
      "1take",
      "take\tkey",
      "take _key",
      "use a b c",
    ]) {
      expect(parseCanonical(bad), bad).toBeNull();
    }
  });

  it("round-trips", () => {
    for (const text of ["look", "look desk", "give photo barman", "choose ask_uncle"]) {
      const cmd = parseCanonical(text);
      expect(cmd && formatCommand(cmd)).toBe(text);
    }
  });
});

describe("commandLabel", () => {
  const de = makePack({
    language: "de",
    start: { room: "kneipe" },
    verbs: { lesen: { label: "Lesen" }, kleben: { label: "Kleben", arity: 2, prep: "an" } },
    rooms: {
      kneipe: {
        name: "Kneipe",
        description: "Rauch.",
        exits: { north: { to: "kneipe" }, up: { to: "kneipe" }, keller: { to: "kneipe", label: "Kellertreppe" } },
      },
    },
    objects: {
      logbuch: { name: "Logbuch", location: "kneipe" },
      schluessel: { name: "Schlüssel", location: "kneipe" },
      tuer: { name: "Tür", location: "kneipe" },
      foto: { name: "Foto", location: "kneipe" },
      wirt: { name: "Wirt", location: "kneipe", npc: true },
    },
    dialogues: {
      d: { start: "a", nodes: { a: { say: "Ja?", options: [{ id: "frage", text: "»Kennen Sie Brandt?«" }] } } },
    },
  });

  it("German imperatives", () => {
    const l = (verb: string, object?: string, w?: string) =>
      commandLabel(de, { verb, ...(object ? { object } : {}), ...(w ? { with: w } : {}) });
    expect(l("take", "logbuch")).toBe("Nimm Logbuch");
    expect(l("use", "schluessel", "tuer")).toBe("Benutze Schlüssel mit Tür");
    expect(l("use", "schluessel")).toBe("Benutze Schlüssel");
    expect(l("give", "foto", "wirt")).toBe("Gib Foto an Wirt");
    expect(l("show", "foto", "wirt")).toBe("Zeige Foto: Wirt");
    expect(l("talk", "wirt")).toBe("Sprich mit Wirt");
    expect(l("look", "logbuch")).toBe("Untersuche Logbuch");
    expect(l("look")).toBe("Sieh dich um");
    expect(l("go", "north")).toBe("Geh nach Norden");
    expect(l("go", "up")).toBe("Geh hinauf");
    expect(l("go", "keller")).toBe("Geh: Kellertreppe");
    expect(l("wait")).toBe("Warte");
    expect(l("inventory")).toBe("Inventar");
    expect(l("drop", "foto")).toBe("Leg Foto ab");
    expect(l("open", "tuer")).toBe("Öffne Tür");
    expect(l("close", "tuer")).toBe("Schließe Tür");
    expect(l("push", "tuer")).toBe("Drücke Tür");
    expect(l("pull", "tuer")).toBe("Ziehe Tür");
    expect(l("lesen", "logbuch")).toBe("Lesen Logbuch");
    expect(l("kleben", "foto", "tuer")).toBe("Kleben Foto an Tür");
    expect(l("choose", "frage")).toBe("»Kennen Sie Brandt?«");
    expect(l("take", "unknown_thing")).toBe("Nimm unknown_thing");
  });

  it("English labels", () => {
    const en = loadLockedStudy();
    expect(commandLabel(en, { verb: "take", object: "brass_key" })).toBe("Take brass key");
    expect(commandLabel(en, { verb: "use", object: "brass_key", with: "study_door" })).toBe(
      "Use brass key with oak door",
    );
    expect(commandLabel(en, { verb: "give", object: "letter", with: "graves" })).toBe("Give letter to Graves");
    expect(commandLabel(en, { verb: "show", object: "letter", with: "graves" })).toBe("Show letter to Graves");
    expect(commandLabel(en, { verb: "talk", object: "graves" })).toBe("Talk to Graves");
    expect(commandLabel(en, { verb: "look", object: "letter" })).toBe("Examine letter");
    expect(commandLabel(en, { verb: "look" })).toBe("Look around");
    expect(commandLabel(en, { verb: "go", object: "north" })).toBe("Go north");
    expect(commandLabel(en, { verb: "read", object: "letter" })).toBe("Read letter");
    expect(commandLabel(en, { verb: "choose", object: "ask_uncle" })).toBe('"Where is my uncle?"');
  });

  it("relabelled core verbs use the pack label", () => {
    const p = makePack({
      start: { room: "r" },
      verbs: { push: { label: "Turn" }, use: { label: "Combine", prep: "and" } },
      rooms: { r: { name: "R", description: "R." } },
      objects: { wheel: { name: "wheel", location: "r" }, rope: { name: "rope", location: "r" } },
    });
    expect(commandLabel(p, { verb: "push", object: "wheel" })).toBe("Turn wheel");
    expect(commandLabel(p, { verb: "use", object: "rope", with: "wheel" })).toBe("Combine rope and wheel");
    const same = makePack({ ...de, verbs: { look: { label: "Untersuchen", synonyms: ["durchsuche"] } } });
    expect(commandLabel(same, { verb: "look", object: "logbuch" })).toBe("Untersuche Logbuch");
  });

  it("German fixture labels", () => {
    const hafen = loadFixture("hafen.yaml");
    expect(commandLabel(hafen, { verb: "kombinieren", object: "aussage_wirt", with: "notiz" })).toBe(
      "Kombinieren Aussage des Wirts mit Notiz",
    );
  });
});
