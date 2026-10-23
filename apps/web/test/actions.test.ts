import { describe, expect, it } from "vitest";
import {
  clueTexts,
  findObject,
  inventoryCounts,
  needsTarget,
  optionByNumber,
  sheetFor,
  showNotebook,
  soloCommand,
  targetCommand,
  targetModel,
} from "../src/logic/actions.ts";
import { sampleView } from "./fixtures.ts";

describe("sheetFor", () => {
  it("lists the object's verbs with labels, marking two-object verbs", () => {
    const sheet = sheetFor(sampleView(), "study_door");
    expect(sheet?.placement).toBe("here");
    expect(sheet?.verbs).toEqual([
      { verb: "look", label: "Examine", needsTarget: false },
      { verb: "open", label: "Open", needsTarget: false },
      { verb: "use", label: "Use", needsTarget: true },
    ]);
  });

  it("finds inventory objects and returns null for absent ones", () => {
    expect(sheetFor(sampleView(), "brass_key")?.placement).toBe("inventory");
    expect(sheetFor(sampleView(), "red_book")).toBeNull();
    expect(findObject(sampleView(), "letter")?.object.name).toBe("letter");
  });

  it("falls back to the verb id when the view has no label", () => {
    const view = sampleView({ objects: [{ id: "x", name: "x", kind: "item", verbs: ["frobnicate"] }] });
    expect(sheetFor(view, "x")?.verbs).toEqual([{ verb: "frobnicate", label: "frobnicate", needsTarget: false }]);
  });

  it("treats use/give/show and pack verbs of arity 2 as two-object verbs", () => {
    expect(needsTarget("use", undefined)).toBe(true);
    expect(needsTarget("give", undefined)).toBe(true);
    expect(needsTarget("combine", { id: "combine", label: "Combine", arity: 2 })).toBe(true);
    expect(needsTarget("read", { id: "read", label: "Read", arity: 1 })).toBe(false);
  });
});

describe("targetModel", () => {
  it("use on an object here: inventory first, then notebook, then other objects here; 'just use it' allowed", () => {
    const model = targetModel(sampleView(), "study_door", "use");
    expect(model?.slot).toBe("with");
    expect(model?.allowSolo).toBe(true);
    expect(model?.prompt).toEqual({ before: "Use oak door with", after: "" });
    expect(model?.groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["inventory", ["brass_key", "letter"]],
      ["notebook", ["clue_password"]],
      ["here", ["graves"]],
    ]);
    expect(model && targetCommand(model, "brass_key")).toEqual({
      verb: "use",
      object: "study_door",
      with: "brass_key",
    });
    expect(model && soloCommand(model)).toEqual({ verb: "use", object: "study_door" });
  });

  it("use on a held item: objects here first, never the item itself", () => {
    const model = targetModel(sampleView(), "brass_key", "use");
    expect(model?.groups.map((g) => g.group)).toEqual(["here", "inventory", "notebook"]);
    expect(model?.groups.flatMap((g) => g.items.map((i) => i.id))).not.toContain("brass_key");
    expect(model?.prompt.before).toBe("Use brass key with");
  });

  it("give/show an item: only characters here", () => {
    const model = targetModel(sampleView(), "letter", "show");
    expect(model?.slot).toBe("with");
    expect(model?.allowSolo).toBe(false);
    expect(model?.groups).toEqual([{ group: "here", items: [sampleView().objects[0]] }]);
    expect(model && targetCommand(model, "graves")).toEqual({ verb: "show", object: "letter", with: "graves" });
  });

  it("give/show with nobody here reports 'nobody'", () => {
    const view = sampleView({ objects: [] });
    const model = targetModel(view, "letter", "give");
    expect(model?.groups).toEqual([]);
    expect(model?.empty).toBe("nobody");
  });

  it("show to a character: pick an item or clue, the character becomes `with`", () => {
    const model = targetModel(sampleView(), "graves", "show");
    expect(model?.slot).toBe("object");
    expect(model?.prompt).toEqual({ before: "Show", after: "to Graves" });
    expect(model?.groups.map((g) => g.group)).toEqual(["inventory", "notebook"]);
    expect(model && targetCommand(model, "clue_password")).toEqual({
      verb: "show",
      object: "clue_password",
      with: "graves",
    });
  });

  it("pack verbs of arity 2 do not offer 'just use it'", () => {
    const model = targetModel(sampleView(), "clue_password", "combine");
    expect(model?.allowSolo).toBe(false);
    expect(model?.prompt.before).toBe("Combine The password with");
  });

  it("returns null when the source is not present", () => {
    expect(targetModel(sampleView(), "red_book", "use")).toBeNull();
  });
});

describe("misc view helpers", () => {
  it("counts items and clues", () => {
    expect(inventoryCounts(sampleView())).toEqual({ items: 2, clues: 1 });
  });

  it("shows the notebook when the pack has clues or clues are held", () => {
    expect(showNotebook(false, sampleView())).toBe(true);
    expect(showNotebook(false, sampleView({ inventory: [] }))).toBe(false);
    expect(showNotebook(true, sampleView({ inventory: [] }))).toBe(true);
  });

  it("maps typed numbers to dialogue options", () => {
    const view = sampleView({
      dialogue: {
        id: "graves_talk",
        npc: "Graves",
        options: [
          { id: "ask_uncle", text: "Where is my uncle?" },
          { id: "bye", text: "Nothing, thank you." },
        ],
      },
    });
    expect(optionByNumber(view, "2")).toBe("bye");
    expect(optionByNumber(view, " 1. ")).toBe("ask_uncle");
    expect(optionByNumber(view, "3")).toBeNull();
    expect(optionByNumber(view, "take key")).toBeNull();
    expect(optionByNumber(sampleView(), "1")).toBeNull();
  });
});

describe("combining clues", () => {
  const withClues = () =>
    sampleView({
      inventory: [
        { id: "brass_key", name: "brass key", kind: "item", verbs: ["look", "drop", "use", "give", "show"] },
        { id: "clue_lot", name: "Lot 4471", kind: "clue", verbs: ["look", "use", "show"] },
        { id: "clue_list", name: "Shipping list", kind: "clue", verbs: ["look", "use", "show"] },
      ],
    });

  it("labels use on a clue as combining, in the pack's language", () => {
    expect(sheetFor(withClues(), "clue_lot")?.verbs).toContainEqual({
      verb: "use",
      label: "Combine with",
      needsTarget: true,
    });
    expect(sheetFor(withClues(), "clue_lot", "de")?.verbs).toContainEqual({
      verb: "use",
      label: "Kombinieren mit",
      needsTarget: true,
    });
    // Other objects keep the pack's label.
    expect(sheetFor(withClues(), "brass_key", "de")?.verbs).toContainEqual({
      verb: "use",
      label: "Use",
      needsTarget: true,
    });
  });

  it("lists the other clues first and still sends use", () => {
    const model = targetModel(withClues(), "clue_lot", "use", "de");
    expect(model?.prompt).toEqual({ before: "Lot 4471 kombinieren mit", after: "" });
    expect(model?.groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["notebook", ["clue_list"]],
      ["inventory", ["brass_key"]],
      ["here", ["graves", "study_door"]],
    ]);
    expect(model && targetCommand(model, "clue_list")).toEqual({ verb: "use", object: "clue_lot", with: "clue_list" });
    expect(targetModel(withClues(), "clue_lot", "use")?.prompt.before).toBe("Combine Lot 4471 with");
  });

  it("explains combining in the notebook in the pack's language", () => {
    expect(clueTexts("de").explainer).toBe(
      "Tippe einen Eintrag an und wähle »Kombinieren mit …«, um Schlüsse zu ziehen.",
    );
    expect(clueTexts("de-AT").combine).toBe("Kombinieren mit");
    expect(clueTexts("en").explainer).toContain("Combine with …");
    expect(clueTexts("fr").combine).toBe("Combine with");
  });
});
