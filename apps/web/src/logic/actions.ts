/**
 * Pure UI logic for object-first interaction: which verbs an object's action
 * sheet offers, and how the second object of a two-object verb is chosen.
 * Works only on the engine's View, so it is testable without a DOM.
 */
import type { Command, Id, ObjectView, VerbView, View } from "@lexvm/engine";

export type Placement = "here" | "inventory";

export interface SheetVerb {
  verb: Id;
  label: string;
  /** The verb needs a second object, chosen in a follow-up step. */
  needsTarget: boolean;
}

export interface SheetModel {
  object: ObjectView;
  placement: Placement;
  verbs: SheetVerb[];
}

/** Core verbs that take a second object. `use` also works alone ("just use it"). */
export const TWO_OBJECT_CORE_VERBS: readonly Id[] = ["use", "give", "show"];

/**
 * Texts for combining clues, in the pack's language (they sit next to the
 * pack's verb labels). For clues, `use` is presented as combining: that is
 * how deductions are made, and "use" alone does not suggest it.
 */
const CLUE_TEXTS = {
  de: {
    combine: "Kombinieren mit",
    prompt: (name: string) => `${name} kombinieren mit`,
    explainer: "Tippe einen Eintrag an und wähle »Kombinieren mit …«, um Schlüsse zu ziehen.",
  },
  en: {
    combine: "Combine with",
    prompt: (name: string) => `Combine ${name} with`,
    explainer: "Tap an entry and choose “Combine with …” to draw conclusions.",
  },
} as const;

export function clueTexts(lang: string): (typeof CLUE_TEXTS)["de" | "en"] {
  return lang.toLowerCase().split("-")[0] === "de" ? CLUE_TEXTS.de : CLUE_TEXTS.en;
}

/** Combining is `use` with a clue: its label and target list differ from other objects. */
function isCombine(object: ObjectView, verb: Id): boolean {
  return object.kind === "clue" && verb === "use";
}
const NPC_RECEIVER_VERBS: readonly Id[] = ["give", "show"];

export function findObject(view: View, id: Id): { object: ObjectView; placement: Placement } | null {
  const inventory = view.inventory.find((o) => o.id === id);
  if (inventory) return { object: inventory, placement: "inventory" };
  const here = view.objects.find((o) => o.id === id);
  if (here) return { object: here, placement: "here" };
  return null;
}

export function verbView(view: View, verb: Id): VerbView | undefined {
  return view.verbs.find((v) => v.id === verb);
}

export function verbLabel(view: View, verb: Id): string {
  return verbView(view, verb)?.label ?? verb;
}

export function needsTarget(verb: Id, vv: VerbView | undefined): boolean {
  return TWO_OBJECT_CORE_VERBS.includes(verb) || vv?.arity === 2;
}

/**
 * The action sheet for an object, or null if the object is not present.
 * `lang` is the pack's language (for the "Combine with" label of clues).
 */
export function sheetFor(view: View, objectId: Id, lang = "en"): SheetModel | null {
  const found = findObject(view, objectId);
  if (!found) return null;
  const seen = new Set<Id>();
  const verbs: SheetVerb[] = [];
  for (const verb of found.object.verbs) {
    if (seen.has(verb)) continue;
    seen.add(verb);
    const vv = verbView(view, verb);
    const label = isCombine(found.object, verb) ? clueTexts(lang).combine : (vv?.label ?? verb);
    verbs.push({ verb, label, needsTarget: needsTarget(verb, vv) });
  }
  return { object: found.object, placement: found.placement, verbs };
}

export type TargetGroupId = "here" | "inventory" | "notebook";

export interface TargetGroup {
  group: TargetGroupId;
  items: ObjectView[];
}

export interface TargetModel {
  verb: Id;
  /**
   * Which command slot the chosen object fills:
   * - "with": the tapped object is `object`, the choice is `with` ("use key with …").
   * - "object": the tapped object is the receiver (`with`), the choice is `object` ("show … to Graves").
   */
  slot: "with" | "object";
  source: ObjectView;
  groups: TargetGroup[];
  /** Offer "just use it" (a one-object command). */
  allowSolo: boolean;
  /** Prompt around the ellipsis, in the pack's language: `${before} … ${after}`. */
  prompt: { before: string; after: string };
  /** Why there is nothing to choose, if so. */
  empty: "nobody" | "nothing" | null;
}

function joinWords(...parts: Array<string | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join(" ");
}

/**
 * Model for choosing the second object of a two-object verb, or null if
 * `sourceId` is not present. Combining a clue lists the other clues first.
 */
export function targetModel(view: View, sourceId: Id, verb: Id, lang = "en"): TargetModel | null {
  const found = findObject(view, sourceId);
  if (!found) return null;
  const source = found.object;
  const vv = verbView(view, verb);
  const label = vv?.label ?? verb;
  const prep = vv?.prep;
  const others = (list: ObjectView[]) => list.filter((o) => o.id !== source.id);
  const items = others(view.inventory.filter((o) => o.kind !== "clue"));
  const clues = others(view.inventory.filter((o) => o.kind === "clue"));
  const here = others(view.objects);
  const nonEmpty = (groups: TargetGroup[]) => groups.filter((g) => g.items.length > 0);

  if (NPC_RECEIVER_VERBS.includes(verb) && source.kind === "npc") {
    // Tapped a character and chose "show"/"give": pick what to show or give.
    const groups = nonEmpty([
      { group: "inventory", items },
      { group: "notebook", items: clues },
    ]);
    return {
      verb,
      slot: "object",
      source,
      groups,
      allowSolo: false,
      prompt: { before: label, after: joinWords(prep, source.name) },
      empty: groups.length === 0 ? "nothing" : null,
    };
  }

  if (NPC_RECEIVER_VERBS.includes(verb)) {
    // Tapped an item and chose "show"/"give": pick the character.
    const groups = nonEmpty([{ group: "here", items: here.filter((o) => o.kind === "npc") }]);
    return {
      verb,
      slot: "with",
      source,
      groups,
      allowSolo: false,
      prompt: { before: joinWords(label, source.name, prep), after: "" },
      empty: groups.length === 0 ? "nobody" : null,
    };
  }

  const inventoryGroups: TargetGroup[] = [
    { group: "inventory", items },
    { group: "notebook", items: clues },
  ];
  const hereGroup: TargetGroup = { group: "here", items: here };
  const combine = isCombine(source, verb);
  const ordered = combine
    ? [{ group: "notebook" as const, items: clues }, { group: "inventory" as const, items }, hereGroup]
    : found.placement === "inventory"
      ? [hereGroup, ...inventoryGroups]
      : [...inventoryGroups, hereGroup];
  const groups = nonEmpty(ordered);
  return {
    verb,
    slot: "with",
    source,
    groups,
    allowSolo: verb === "use",
    prompt: { before: combine ? clueTexts(lang).prompt(source.name) : joinWords(label, source.name, prep), after: "" },
    empty: groups.length === 0 ? "nothing" : null,
  };
}

export function targetCommand(model: TargetModel, choiceId: Id): Command {
  return model.slot === "with"
    ? { verb: model.verb, object: model.source.id, with: choiceId }
    : { verb: model.verb, object: choiceId, with: model.source.id };
}

export function soloCommand(model: TargetModel): Command {
  return { verb: model.verb, object: model.source.id };
}

export function inventoryCounts(view: View): { items: number; clues: number } {
  let items = 0;
  let clues = 0;
  for (const o of view.inventory) {
    if (o.kind === "clue") clues += 1;
    else items += 1;
  }
  return { items, clues };
}

/** The notebook button is shown when the pack defines clues or the player holds any. */
export function showNotebook(packHasClues: boolean, view: View): boolean {
  return packHasClues || view.inventory.some((o) => o.kind === "clue");
}

/** Dialogue option chosen by typing its number ("2"), or null. */
export function optionByNumber(view: View, input: string): Id | null {
  const match = /^\s*(\d{1,2})\s*\.?\s*$/.exec(input);
  if (!match || !view.dialogue) return null;
  const index = Number(match[1]) - 1;
  return view.dialogue.options[index]?.id ?? null;
}
