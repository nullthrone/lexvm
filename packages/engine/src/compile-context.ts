/**
 * What kind of pack element a schema path points at, which keys it accepts
 * and what values it expects. Used to turn raw schema issues into messages
 * that tell an author (or an LLM repair loop) exactly how to fix the input.
 *
 * Valid keys are read from the zod schemas themselves, so schema.ts stays the
 * single source of truth.
 */
import type { PathSegment } from "./diagnostics.ts";
import {
  ConditionSchema,
  DialogueNodeSchema,
  DialogueOptionSchema,
  DialogueSchema,
  EffectSchema,
  EndingSchema,
  ExitSchema,
  HintSchema,
  ObjectSchema,
  PackSchema,
  RoomSchema,
  RuleSchema,
  TextSchema,
  VerbSchema,
} from "./schema.ts";

export type NodeKind =
  | "pack"
  | "start"
  | "generator"
  | "verbs"
  | "verb"
  | "rooms"
  | "room"
  | "exits"
  | "exit"
  | "objects"
  | "object"
  | "flags"
  | "counters"
  | "rules"
  | "rule"
  | "trigger"
  | "dialogues"
  | "dialogue"
  | "nodes"
  | "node"
  | "options"
  | "option"
  | "endings"
  | "ending"
  | "hints"
  | "hint"
  | "walkthrough"
  | "conditions"
  | "condition"
  | "conditionList"
  | "counterTest"
  | "inCondition"
  | "effects"
  | "effect"
  | "move"
  | "counterEffect"
  | "ifEffect"
  | "text"
  | "variant"
  | "value";

const PACK_CHILDREN: Partial<Record<string, NodeKind>> = {
  start: "start",
  generator: "generator",
  verbs: "verbs",
  rooms: "rooms",
  objects: "objects",
  flags: "flags",
  counters: "counters",
  rules: "rules",
  dialogues: "dialogues",
  endings: "endings",
  hints: "hints",
  walkthrough: "walkthrough",
};

function childKind(kind: NodeKind, segment: PathSegment): NodeKind {
  const key = typeof segment === "string" ? segment : null;
  switch (kind) {
    case "pack":
      return (key !== null && PACK_CHILDREN[key]) || "value";
    case "start":
      return key === "intro" ? "text" : "value";
    case "verbs":
      return "verb";
    case "verb":
      return key === "default" ? "text" : "value";
    case "rooms":
      return "room";
    case "room":
      return key === "description" ? "text" : key === "exits" ? "exits" : "value";
    case "exits":
      return "exit";
    case "exit":
      return key === "when" || key === "visibleWhen" ? "conditions" : key === "blocked" ? "text" : "value";
    case "objects":
      return "object";
    case "object":
      return key === "description" || key === "roomText" ? "text" : "value";
    case "rules":
      return typeof segment === "number" ? "rule" : "value";
    case "rule":
      return key === "on" ? "trigger" : key === "when" ? "conditions" : key === "do" ? "effects" : "value";
    case "dialogues":
      return "dialogue";
    case "dialogue":
      return key === "nodes" ? "nodes" : "value";
    case "nodes":
      return "node";
    case "node":
      return key === "say" ? "text" : key === "do" ? "effects" : key === "options" ? "options" : "value";
    case "options":
      return typeof segment === "number" ? "option" : "value";
    case "option":
      return key === "when" ? "conditions" : key === "do" ? "effects" : "value";
    case "endings":
      return "ending";
    case "ending":
      return key === "text" ? "text" : "value";
    case "hints":
      return typeof segment === "number" ? "hint" : "value";
    case "hint":
      return key === "when" || key === "until" ? "conditions" : "value";
    case "conditions":
      // A single condition may stand in for a list.
      return typeof segment === "number" ? "condition" : childKind("condition", segment);
    case "conditionList":
      return typeof segment === "number" ? "condition" : "value";
    case "condition":
      if (key === "not") return "condition";
      if (key === "all" || key === "any") return "conditionList";
      if (key === "counter") return "counterTest";
      if (key === "in") return "inCondition";
      return "value";
    case "effects":
      return typeof segment === "number" ? "effect" : childKind("effect", segment);
    case "effect":
      if (key === "say") return "text";
      if (key === "move") return "move";
      if (key === "counter") return "counterEffect";
      if (key === "if") return "ifEffect";
      return "value";
    case "ifEffect":
      return key === "when" ? "conditions" : key === "then" || key === "else" ? "effects" : "value";
    case "text":
      return typeof segment === "number" ? "variant" : "value";
    case "variant":
      return key === "when" ? "conditions" : "value";
    default:
      return "value";
  }
}

/** Kind of the element at `path`. */
export function kindAt(path: readonly PathSegment[]): NodeKind {
  let kind: NodeKind = "pack";
  for (const segment of path) kind = childKind(kind, segment);
  return kind;
}

/**
 * Lists that also accept a single element resolve to the element kind when
 * the actual value is not a list (`when: { flag: x }` is one condition).
 */
export function effectiveKind(kind: NodeKind, value: unknown): NodeKind {
  if (Array.isArray(value)) return kind;
  if (kind === "conditions") return "condition";
  if (kind === "effects") return "effect";
  return kind;
}

// ---------------------------------------------------------------------------
// Valid keys, read from the zod schemas
// ---------------------------------------------------------------------------

interface ZodLike {
  _zod: { def: Record<string, unknown> & { type: string } };
}

function isZodLike(value: unknown): value is ZodLike {
  return typeof value === "object" && value !== null && "_zod" in value;
}

/** Object keys accepted by a schema, looking through wrappers, lazies, pipes, unions and arrays. */
export function schemaKeys(schema: unknown, depth = 0): string[] {
  if (!isZodLike(schema) || depth > 10) return [];
  const def = schema._zod.def;
  switch (def.type) {
    case "object":
      return Object.keys(def.shape as Record<string, unknown>);
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "nonoptional":
    case "readonly":
    case "catch":
      return schemaKeys(def.innerType, depth + 1);
    case "lazy":
      return schemaKeys((def.getter as () => unknown)(), depth + 1);
    case "pipe":
      return schemaKeys(def.in, depth + 1);
    case "array":
      return schemaKeys(def.element, depth + 1);
    case "union": {
      const keys = new Set<string>();
      for (const option of def.options as unknown[]) for (const k of schemaKeys(option, depth + 1)) keys.add(k);
      return [...keys];
    }
    default:
      return [];
  }
}

/** The schema of property `key` of an object schema (through wrappers). */
function propertySchema(schema: unknown, key: string, depth = 0): unknown {
  if (!isZodLike(schema) || depth > 10) return undefined;
  const def = schema._zod.def;
  switch (def.type) {
    case "object":
      return (def.shape as Record<string, unknown>)[key];
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "nonoptional":
    case "readonly":
    case "catch":
      return propertySchema(def.innerType, key, depth + 1);
    case "lazy":
      return propertySchema((def.getter as () => unknown)(), key, depth + 1);
    case "pipe":
      return propertySchema(def.in, key, depth + 1);
    default:
      return undefined;
  }
}

const KIND_SCHEMAS: Partial<Record<NodeKind, () => unknown>> = {
  pack: () => PackSchema,
  start: () => propertySchema(PackSchema, "start"),
  generator: () => propertySchema(PackSchema, "generator"),
  verb: () => VerbSchema,
  room: () => RoomSchema,
  exit: () => ExitSchema,
  object: () => ObjectSchema,
  rule: () => RuleSchema,
  trigger: () => propertySchema(RuleSchema, "on"),
  dialogue: () => DialogueSchema,
  node: () => DialogueNodeSchema,
  option: () => DialogueOptionSchema,
  ending: () => EndingSchema,
  hint: () => HintSchema,
  condition: () => ConditionSchema,
  counterTest: () => propertySchema(ConditionSchema, "counter"),
  inCondition: () => propertySchema(ConditionSchema, "in"),
  effect: () => EffectSchema,
  move: () => propertySchema(EffectSchema, "move"),
  counterEffect: () => propertySchema(EffectSchema, "counter"),
  ifEffect: () => propertySchema(EffectSchema, "if"),
  variant: () => TextSchema,
};

const keyCache = new Map<NodeKind, readonly string[]>();

/** Keys accepted by elements of this kind ([] if not an object kind). */
export function validKeys(kind: NodeKind): readonly string[] {
  let keys = keyCache.get(kind);
  if (keys === undefined) {
    const schema = KIND_SCHEMAS[kind]?.();
    keys = schema === undefined ? [] : schemaKeys(schema);
    keyCache.set(kind, keys);
  }
  return keys;
}

const NOUNS: Partial<Record<NodeKind, string>> = {
  pack: "the top level of the pack",
  start: "'start'",
  generator: "'generator'",
  verb: "a verb",
  room: "a room",
  exit: "an exit",
  object: "an object",
  rule: "a rule",
  trigger: "a rule trigger ('on')",
  dialogue: "a dialogue",
  node: "a dialogue node",
  option: "a dialogue option",
  ending: "an ending",
  hint: "a hint",
  condition: "a condition",
  counterTest: "a counter condition",
  inCondition: "an 'in' condition",
  effect: "an effect",
  move: "a 'move' effect",
  counterEffect: "a 'counter' effect",
  ifEffect: "an 'if' effect",
  variant: "a text variant",
};

export function kindNoun(kind: NodeKind): string {
  return NOUNS[kind] ?? "this element";
}

/** Single-key elements: conditions and effects. */
export function isSingleKeyKind(kind: NodeKind): boolean {
  return kind === "condition" || kind === "effect";
}

const EXPECTATIONS: Partial<Record<NodeKind, string>> = {
  conditions: "a condition such as { flag: door_open } or a list of conditions",
  conditionList: "a list of conditions such as [{ flag: a }, { has: b }]",
  condition: "a condition: an object with exactly one key such as { flag: door_open } or { has: brass_key }",
  effects: 'an effect such as { say: "…" } or a list of effects',
  effect: 'an effect: an object with exactly one key such as { say: "…" } or { set: door_open }',
  text: 'a non-empty string, or a list of variants like [{ when: { flag: x }, text: "…" }, { text: "…" }]',
  variant: 'a text variant { when?: conditions, text: "…" }',
  trigger:
    "a command trigger { verb: pull, object: red_book } or an event trigger { event: start | enter | turn, room? }",
  rooms: "a map from room id to room",
  objects: "a map from object id to object",
  verbs: "a map from verb id to verb",
  flags: "a map from flag id to true/false",
  counters: "a map from counter id to an integer",
  dialogues: "a map from dialogue id to dialogue",
  endings: "a map from ending id to ending",
  exits: "a map from exit id (north, south, …, or a custom id with a label) to exit",
  nodes: "a map from node id to dialogue node",
  rules: "a list of rules",
  hints: "a list of hints",
  options: "a list of dialogue options",
  walkthrough: 'a list of command strings such as ["take brass_key", "go north"]',
};

/** Human description of what is expected at an element of this kind, if specific. */
export function expectation(kind: NodeKind): string | undefined {
  return EXPECTATIONS[kind];
}
