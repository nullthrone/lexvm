/**
 * Traversal helpers for the analyzer: every place in a pack that holds
 * conditions, effects or text, visited with its diagnostic path, plus an
 * index of all declared ids.
 */
import { joinPath } from "./diagnostics.ts";
import {
  CORE_VERBS,
  type Condition,
  type Conditions,
  type Effect,
  type Effects,
  type Id,
  type Pack,
  type Text,
} from "./schema.ts";
import { objectDef } from "./text.ts";

/** Where a piece of logic lives; lets checks treat e.g. turn rules specially. */
export type Site =
  | { kind: "intro" }
  | { kind: "verb"; verb: Id }
  | { kind: "room"; room: Id }
  | { kind: "exit"; room: Id; exit: Id }
  | { kind: "object"; object: Id }
  | { kind: "rule"; index: number }
  | { kind: "node"; dialogue: Id; node: Id }
  | { kind: "option"; dialogue: Id; node: Id; index: number }
  | { kind: "ending"; ending: Id }
  | { kind: "hint"; index: number };

export interface Visitor {
  condition?(condition: Condition, path: string, site: Site): void;
  effect?(effect: Effect, path: string, site: Site): void;
  /** Called for every string of a Text (each variant's text separately). */
  text?(text: string, path: string, site: Site): void;
  /** Called once per Text value, before its strings. */
  textBlock?(text: Text, path: string, site: Site): void;
}

export function visitConditions(conditions: Conditions | undefined, path: string, site: Site, v: Visitor): void {
  if (conditions === undefined) return;
  conditions.forEach((c, i) => {
    visitCondition(c, joinPath(path, i), site, v);
  });
}

export function visitCondition(condition: Condition, path: string, site: Site, v: Visitor): void {
  v.condition?.(condition, path, site);
  if ("not" in condition) visitCondition(condition.not, joinPath(path, "not"), site, v);
  else if ("all" in condition)
    condition.all.forEach((c, i) => {
      visitCondition(c, joinPath(joinPath(path, "all"), i), site, v);
    });
  else if ("any" in condition)
    condition.any.forEach((c, i) => {
      visitCondition(c, joinPath(joinPath(path, "any"), i), site, v);
    });
}

export function visitText(text: Text | undefined, path: string, site: Site, v: Visitor): void {
  if (text === undefined) return;
  v.textBlock?.(text, path, site);
  if (typeof text === "string") {
    v.text?.(text, path, site);
    return;
  }
  text.forEach((variant, i) => {
    const p = joinPath(path, i);
    visitConditions(variant.when, joinPath(p, "when"), site, v);
    v.text?.(variant.text, joinPath(p, "text"), site);
  });
}

export function visitEffects(effects: Effects | undefined, path: string, site: Site, v: Visitor): void {
  if (effects === undefined) return;
  effects.forEach((e, i) => {
    visitEffect(e, joinPath(path, i), site, v);
  });
}

export function visitEffect(effect: Effect, path: string, site: Site, v: Visitor): void {
  v.effect?.(effect, path, site);
  if ("say" in effect) visitText(effect.say, joinPath(path, "say"), site, v);
  else if ("if" in effect) {
    const p = joinPath(path, "if");
    visitConditions(effect.if.when, joinPath(p, "when"), site, v);
    visitEffects(effect.if.then, joinPath(p, "then"), site, v);
    visitEffects(effect.if.else, joinPath(p, "else"), site, v);
  }
}

/** Visit every condition, effect and text in the pack, in a deterministic order. */
export function walkPack(pack: Pack, v: Visitor): void {
  visitText(pack.start.intro, "start.intro", { kind: "intro" }, v);
  for (const [id, verb] of Object.entries(pack.verbs)) {
    visitText(verb.default, `verbs.${id}.default`, { kind: "verb", verb: id }, v);
  }
  for (const [roomId, room] of Object.entries(pack.rooms)) {
    visitText(room.description, `rooms.${roomId}.description`, { kind: "room", room: roomId }, v);
    for (const [exitId, exit] of Object.entries(room.exits ?? {})) {
      const p = `rooms.${roomId}.exits.${exitId}`;
      const site: Site = { kind: "exit", room: roomId, exit: exitId };
      visitConditions(exit.visibleWhen, `${p}.visibleWhen`, site, v);
      visitConditions(exit.when, `${p}.when`, site, v);
      visitText(exit.blocked, `${p}.blocked`, site, v);
    }
  }
  for (const [id, object] of Object.entries(pack.objects)) {
    const site: Site = { kind: "object", object: id };
    visitText(object.description, `objects.${id}.description`, site, v);
    visitText(object.roomText, `objects.${id}.roomText`, site, v);
  }
  pack.rules.forEach((rule, index) => {
    const site: Site = { kind: "rule", index };
    visitConditions(rule.when, `rules[${index}].when`, site, v);
    visitEffects(rule.do, `rules[${index}].do`, site, v);
  });
  for (const [dialogueId, dialogue] of Object.entries(pack.dialogues)) {
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      const p = `dialogues.${dialogueId}.nodes.${nodeId}`;
      const site: Site = { kind: "node", dialogue: dialogueId, node: nodeId };
      visitText(node.say, `${p}.say`, site, v);
      visitEffects(node.do, `${p}.do`, site, v);
      (node.options ?? []).forEach((option, index) => {
        const op = `${p}.options[${index}]`;
        const optionSite: Site = { kind: "option", dialogue: dialogueId, node: nodeId, index };
        visitConditions(option.when, `${op}.when`, optionSite, v);
        visitText(option.text, `${op}.text`, optionSite, v);
        visitEffects(option.do, `${op}.do`, optionSite, v);
      });
    }
  }
  for (const [id, ending] of Object.entries(pack.endings)) {
    visitText(ending.text, `endings.${id}.text`, { kind: "ending", ending: id }, v);
  }
  pack.hints.forEach((hint, index) => {
    const site: Site = { kind: "hint", index };
    visitConditions(hint.when, `hints[${index}].when`, site, v);
    visitConditions(hint.until, `hints[${index}].until`, site, v);
    hint.steps.forEach((step, i) => {
      visitText(step, `hints[${index}].steps[${i}]`, site, v);
    });
  });
}

/** All ids declared in a pack. */
export interface PackIndex {
  pack: Pack;
  rooms: Set<Id>;
  objects: Set<Id>;
  flags: Set<Id>;
  counters: Set<Id>;
  dialogues: Set<Id>;
  endings: Set<Id>;
  /** Core verbs and pack verbs. */
  verbs: Set<Id>;
  /** Exit ids used in any room. */
  exits: Set<Id>;
  /** Dialogue option ids used in any dialogue. */
  options: Set<Id>;
}

export function indexPack(pack: Pack): PackIndex {
  const exits = new Set<Id>();
  for (const room of Object.values(pack.rooms)) for (const exitId of Object.keys(room.exits ?? {})) exits.add(exitId);
  const options = new Set<Id>();
  for (const dialogue of Object.values(pack.dialogues))
    for (const node of Object.values(dialogue.nodes)) for (const option of node.options ?? []) options.add(option.id);
  return {
    pack,
    rooms: new Set(Object.keys(pack.rooms)),
    objects: new Set(Object.keys(pack.objects)),
    flags: new Set(Object.keys(pack.flags)),
    counters: new Set(Object.keys(pack.counters)),
    dialogues: new Set(Object.keys(pack.dialogues)),
    endings: new Set(Object.keys(pack.endings)),
    verbs: new Set<Id>([...CORE_VERBS, ...Object.keys(pack.verbs)]),
    exits,
    options,
  };
}

/** Object ids referenced by `{id}` / `{id|display}` markup in a string. */
export function markupRefs(text: string): Array<{ id: string; display?: string; raw: string }> {
  const refs: Array<{ id: string; display?: string; raw: string }> = [];
  for (const m of text.matchAll(/\{([^{}|]*)(?:\|([^{}]*))?\}/g)) {
    const ref: { id: string; display?: string; raw: string } = { id: m[1]!.trim(), raw: m[0] };
    if (m[2] !== undefined) ref.display = m[2];
    refs.push(ref);
  }
  return refs;
}

/** Text as the player sees it: markup replaced by display text or object names. */
export function renderedText(text: string, pack: Pack): string {
  return text.replace(
    /\{([^{}|]*)(?:\|([^{}]*))?\}/g,
    (_, id: string, display?: string) => display ?? objectDef(pack, id.trim())?.name ?? id,
  );
}

/** All strings of a Text (each variant). */
export function textStrings(text: Text | undefined): string[] {
  if (text === undefined) return [];
  return typeof text === "string" ? [text] : text.map((v) => v.text);
}
