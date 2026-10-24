/**
 * LexVM content pack schema — the single source of truth for the pack format.
 *
 * Normative prose lives in docs/spec/content-pack.md. This file and the spec
 * must agree; if they disagree, fix whichever is wrong in the same PR.
 *
 * Design rules:
 * - Packs are data, never code. Logic is expressed with a closed set of
 *   conditions and effects so packs can be validated, statically analysed and
 *   executed deterministically, and are safe to load from untrusted sources.
 * - Every condition/effect is a single-key object (`{ has: "key" }`). Unknown
 *   keys are rejected with a precise message so LLM repair loops converge.
 * - A few lenient input forms are accepted (single condition instead of a
 *   list, single effect instead of a list). Parsing normalises them, so the
 *   parsed `Pack` always has one canonical shape.
 */
import { z } from "zod";

// No JIT compilation of schemas: zod would probe `Function("")` (eval) for it, which the web player's
// Content-Security-Policy forbids (and reports as a violation). Packs are small; the interpreter is fast enough.
z.config({ jitless: true });

export const PACK_FORMAT = "lexvm-pack/1" as const;

/** Reserved location names. They cannot be used as room or object ids. */
export const INVENTORY = "inventory" as const;
export const NOWHERE = "nowhere" as const;
export const RESERVED_IDS: readonly string[] = [INVENTORY, NOWHERE];

/** Standard exit ids. They get localized labels and parser synonyms from the engine. */
export const STANDARD_EXITS = [
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
  "up",
  "down",
  "in",
  "out",
] as const;

/** Core verbs implemented by the engine. Packs may relabel them and add synonyms. */
export const CORE_VERBS = [
  "look",
  "take",
  "drop",
  "open",
  "close",
  "use",
  "talk",
  "give",
  "show",
  "push",
  "pull",
  "go",
  "wait",
  "inventory",
  "choose",
] as const;
export type CoreVerb = (typeof CORE_VERBS)[number];

// ---------------------------------------------------------------------------
// Primitive ids
// ---------------------------------------------------------------------------

/** Identifier for rooms, objects, flags, counters, verbs, rules, dialogues, endings, hints. */
export const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "ids must be lower_snake_case and start with a letter (e.g. 'brass_key')");
export type Id = string;

/** Pack id: kebab-case, used in file names and URLs. */
export const PackIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "pack id must be kebab-case (e.g. 'hamburg-1948')");

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, "version must be semver (e.g. '1.0.0')");

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type CounterTest = {
  name: Id;
  eq?: number;
  ne?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
};

/**
 * A condition is an object with exactly one key.
 * Locations are room ids, object ids (containers), "inventory" or "nowhere".
 */
export type Condition =
  | { has: Id } // object is in the player's inventory
  | { at: Id } // player is in this room
  | { here: Id } // object is present: in inventory or visible in the current room
  | { in: { object: Id; location: Id } } // object is exactly at this location
  | { flag: Id } // flag is true
  | { counter: CounterTest } // all given comparisons hold
  | { visited: Id } // player has entered this room at least once
  | { isOpen: Id } // openable object is open
  | { isLocked: Id } // object is locked
  | { not: Condition }
  | { all: Condition[] }
  | { any: Condition[] };

/** Conditions as they appear in a parsed pack: always a list, all must hold. */
export type Conditions = Condition[];

const CounterTestSchema = z.strictObject({
  name: IdSchema,
  eq: z.number().optional(),
  ne: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
});

const CONDITION_KEYS = [
  "has",
  "at",
  "here",
  "in",
  "flag",
  "counter",
  "visited",
  "isOpen",
  "isLocked",
  "not",
  "all",
  "any",
];

function exactlyOneKey(kind: string, keys: string[]) {
  return (value: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const present = Object.keys(value).filter((k) => value[k] !== undefined);
    if (present.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message:
          present.length === 0
            ? `${kind} must have exactly one key, one of: ${keys.join(", ")}`
            : `${kind} must have exactly one key, got ${present.length} (${present.join(", ")}). Split it into separate ${kind}s.`,
      });
    }
  };
}

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z
    .strictObject({
      has: IdSchema.optional(),
      at: IdSchema.optional(),
      here: IdSchema.optional(),
      in: z.strictObject({ object: IdSchema, location: IdSchema }).optional(),
      flag: IdSchema.optional(),
      counter: CounterTestSchema.optional(),
      visited: IdSchema.optional(),
      isOpen: IdSchema.optional(),
      isLocked: IdSchema.optional(),
      not: ConditionSchema.optional(),
      all: z.array(ConditionSchema).optional(),
      any: z.array(ConditionSchema).optional(),
    })
    .superRefine(exactlyOneKey("condition", CONDITION_KEYS)),
) as unknown as z.ZodType<Condition>;

/** Accepts a single condition or a list; parses to a list. */
export const ConditionsSchema = z
  .union([z.array(ConditionSchema), ConditionSchema])
  .transform((c): Conditions => (Array.isArray(c) ? c : [c]));

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Text is a string or a list of conditional variants; the first variant whose
 * `when` holds is used (a variant without `when` always holds).
 *
 * Inline markup inside strings:
 * - `{object_id}` renders the object's name as a tappable reference.
 * - `{object_id|display text}` renders custom text (e.g. an inflected form) as a reference.
 * - A blank line (`\n\n`) separates paragraphs.
 * No other markup exists; text is never interpreted as HTML.
 */
export type TextVariant = { when?: Conditions; text: string };
export type Text = string | TextVariant[];

export const TextSchema = z.union([
  z.string().min(1),
  z
    .array(
      z.strictObject({
        when: ConditionsSchema.optional(),
        text: z.string().min(1),
      }),
    )
    .min(1),
]);

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type Effect =
  | { say: Text } // print text
  | { move: { object: Id; to: Id } } // to: room id, container object id, "inventory" or "nowhere"
  | { goto: Id } // move the player to a room (prints the room, fires enter rules)
  | { set: Id } // set flag to true
  | { clear: Id } // set flag to false
  | { counter: { name: Id; add?: number; set?: number } }
  | { open: Id }
  | { close: Id }
  | { lock: Id }
  | { unlock: Id }
  | { reveal: Id } // make a hidden object visible
  | { hide: Id } // make an object hidden
  | { learn: Id } // put a clue object into the inventory (notebook) and announce it
  | { dialogue: Id } // start a dialogue
  | { endDialogue: true } // leave the current dialogue
  | { score: number } // add points
  | { end: Id } // end the game with this ending
  | { look: true } // print the current room description
  | { if: { when: Conditions; then: Effect[]; else?: Effect[] } };

export type Effects = Effect[];

const EFFECT_KEYS = [
  "say",
  "move",
  "goto",
  "set",
  "clear",
  "counter",
  "open",
  "close",
  "lock",
  "unlock",
  "reveal",
  "hide",
  "learn",
  "dialogue",
  "endDialogue",
  "score",
  "end",
  "look",
  "if",
];

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z
    .strictObject({
      say: TextSchema.optional(),
      move: z.strictObject({ object: IdSchema, to: IdSchema }).optional(),
      goto: IdSchema.optional(),
      set: IdSchema.optional(),
      clear: IdSchema.optional(),
      counter: z
        .strictObject({ name: IdSchema, add: z.number().int().optional(), set: z.number().int().optional() })
        .refine(
          (c) => (c.add === undefined) !== (c.set === undefined),
          "counter effect needs exactly one of 'add' or 'set'",
        )
        .optional(),
      open: IdSchema.optional(),
      close: IdSchema.optional(),
      lock: IdSchema.optional(),
      unlock: IdSchema.optional(),
      reveal: IdSchema.optional(),
      hide: IdSchema.optional(),
      learn: IdSchema.optional(),
      dialogue: IdSchema.optional(),
      endDialogue: z.literal(true).optional(),
      score: z.number().int().optional(),
      end: IdSchema.optional(),
      look: z.literal(true).optional(),
      if: z
        .strictObject({
          when: ConditionsSchema,
          // biome-ignore lint/suspicious/noThenProperty: data key, never a function, so not a thenable
          then: z.lazy(() => EffectsSchema),
          else: z.lazy(() => EffectsSchema).optional(),
        })
        .optional(),
    })
    .superRefine(exactlyOneKey("effect", EFFECT_KEYS)),
) as unknown as z.ZodType<Effect>;

/** Accepts a single effect or a list; parses to a list. */
export const EffectsSchema: z.ZodType<Effects> = z
  .union([z.array(EffectSchema), EffectSchema])
  .transform((e): Effects => (Array.isArray(e) ? e : [e])) as unknown as z.ZodType<Effects>;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export const ExitSchema = z.strictObject({
  /** Destination room id. */
  to: IdSchema,
  /** Label for the exit chip. Required for non-standard exit ids. */
  label: z.string().min(1).optional(),
  /** Extra parser words for this exit. */
  synonyms: z.array(z.string().min(1)).optional(),
  /** Exit is listed only while this holds (secret passages). Default: always listed. */
  visibleWhen: ConditionsSchema.optional(),
  /** Exit can be used only while this holds. */
  when: ConditionsSchema.optional(),
  /** Door object: the exit can be used only while the door is open. */
  door: IdSchema.optional(),
  /** Printed when the exit is listed but cannot be used. */
  blocked: TextSchema.optional(),
});
export type Exit = z.output<typeof ExitSchema>;

export const RoomSchema = z.strictObject({
  name: z.string().min(1),
  description: TextSchema,
  exits: z.record(IdSchema, ExitSchema).optional(),
});
export type Room = z.output<typeof RoomSchema>;

export const ObjectSchema = z.strictObject({
  /** Display name (nominative, without article), shown on chips and in default messages. */
  name: z.string().min(1),
  /** Extra parser words. The name's words are always recognised. */
  synonyms: z.array(z.string().min(1)).optional(),
  /** Printed when the player examines the object. */
  description: TextSchema.optional(),
  /** Sentence appended to the room description while the object lies directly in the current room. */
  roomText: TextSchema.optional(),
  /** Initial location: room id, container object id, "inventory" or "nowhere". */
  location: IdSchema,
  /** Additional rooms where a non-portable object is also present (doors, sky, river). */
  alsoIn: z.array(IdSchema).optional(),
  /** Can be taken and dropped. */
  portable: z.boolean().optional(),
  /** A clue: lives in the notebook section of the inventory, cannot be dropped. */
  clue: z.boolean().optional(),
  /** A character: offers 'talk', receives 'give' and 'show'. */
  npc: z.boolean().optional(),
  /** Dialogue started by the default 'talk' behaviour. */
  dialogue: IdSchema.optional(),
  /** Can contain objects; contents are visible while open (or if not openable). */
  container: z.boolean().optional(),
  openable: z.boolean().optional(),
  open: z.boolean().optional(),
  locked: z.boolean().optional(),
  /** Object that unlocks this one via the default 'use <key> with <this>' behaviour. */
  unlockedBy: IdSchema.optional(),
  /** Hidden objects are absent until revealed. */
  hidden: z.boolean().optional(),
  /** Extra verbs offered in this object's action sheet (core or pack verbs). */
  verbs: z.array(IdSchema).optional(),
});
export type GameObject = z.output<typeof ObjectSchema>;

export const VerbSchema = z.strictObject({
  /** Label in the pack's language, e.g. "Lesen". */
  label: z.string().min(1),
  /** Parser words, e.g. ["lies", "lese", "lesen"]. */
  synonyms: z.array(z.string().min(1)).optional(),
  /** 1: verb object. 2: verb object prep object. Default 1. Ignored for core verbs. */
  arity: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Preposition shown/parsed between the two objects of arity-2 verbs, e.g. "mit". */
  prep: z.string().min(1).optional(),
  /** Response when no rule matches. */
  default: TextSchema.optional(),
});
export type Verb = z.output<typeof VerbSchema>;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const CommandTriggerSchema = z.strictObject({
  /** Verb id. For 'go' the object is the exit id; for 'choose' rules are not used. */
  verb: IdSchema,
  /** Omitted: any object (or none). */
  object: IdSchema.optional(),
  /** Second object for arity-2 verbs. Omitted: any (or none). */
  with: IdSchema.optional(),
});

export const EventTriggerSchema = z.strictObject({
  event: z.enum(["start", "enter", "turn"]),
  /** For 'enter': only this room. Omitted: any room. */
  room: IdSchema.optional(),
});

export const RuleSchema = z.strictObject({
  /** Required for `once` rules; recommended for all. */
  id: IdSchema.optional(),
  on: z.union([CommandTriggerSchema, EventTriggerSchema]),
  when: ConditionsSchema.optional(),
  do: EffectsSchema,
  /** Fire at most once per game. Requires `id`. */
  once: z.boolean().optional(),
});
export type CommandTrigger = z.output<typeof CommandTriggerSchema>;
export type EventTrigger = z.output<typeof EventTriggerSchema>;
export type Rule = z.output<typeof RuleSchema>;

// ---------------------------------------------------------------------------
// Dialogues, endings, hints
// ---------------------------------------------------------------------------

export const DialogueOptionSchema = z.strictObject({
  /** Unique within the dialogue. */
  id: IdSchema,
  /** The player's line as shown on the choice button. */
  text: z.string().min(1),
  when: ConditionsSchema.optional(),
  /** Hide this option after it was chosen once. */
  once: z.boolean().optional(),
  do: EffectsSchema.optional(),
  /** Next node. Omitted: the dialogue ends after this option. */
  goto: IdSchema.optional(),
});

export const DialogueNodeSchema = z.strictObject({
  /** Printed when the node is entered (usually the NPC speaking). */
  say: TextSchema.optional(),
  /** Run when the node is entered, after `say`. */
  do: EffectsSchema.optional(),
  /** Available choices. A node without available options ends the dialogue. */
  options: z.array(DialogueOptionSchema).optional(),
});

export const DialogueSchema = z.strictObject({
  /** NPC object id speaking in this dialogue (used for display). */
  with: IdSchema.optional(),
  start: IdSchema,
  nodes: z.record(IdSchema, DialogueNodeSchema),
});
export type DialogueOption = z.output<typeof DialogueOptionSchema>;
export type DialogueNode = z.output<typeof DialogueNodeSchema>;
export type Dialogue = z.output<typeof DialogueSchema>;

export const EndingSchema = z.strictObject({
  title: z.string().min(1),
  text: TextSchema,
  /** Winning ending. Under the 'forgiving' policy every ending must be a win. */
  win: z.boolean(),
});
export type Ending = z.output<typeof EndingSchema>;

export const HintSchema = z.strictObject({
  id: IdSchema,
  /** The hint is relevant while `when` holds (default: always) ... */
  when: ConditionsSchema.optional(),
  /** ... and until `until` holds (the puzzle is solved). */
  until: ConditionsSchema,
  /** Progressive steps from a gentle nudge to the explicit solution. */
  steps: z.array(z.string().min(1)).min(1),
});
export type Hint = z.output<typeof HintSchema>;

// ---------------------------------------------------------------------------
// Pack
// ---------------------------------------------------------------------------

export const PackSchema = z.strictObject({
  format: z.literal(PACK_FORMAT),
  id: PackIdSchema,
  version: SemverSchema,
  title: z.string().min(1),
  subtitle: z.string().min(1).optional(),
  description: z.string().min(1),
  /** BCP 47 language tag of all player-facing text, e.g. "de" or "en". */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "language must be a BCP 47 tag like 'de' or 'en-GB'"),
  author: z.string().min(1),
  /** SPDX license identifier for the pack content, e.g. "CC-BY-4.0". */
  license: z.string().min(1),
  /** 'forgiving': no losing endings, no dead ends (LucasArts rule). Enforced by `lexvm check`. */
  policy: z.literal("forgiving").default("forgiving"),
  /** Provenance of generated content. Free text, never executed. */
  generator: z.strictObject({ pipeline: z.string().min(1).optional(), notes: z.string().min(1).optional() }).optional(),
  /** Target play time in minutes; `lexvm check` compares its play time estimate against it (spec section 17). */
  playtime: z.number().int().positive().optional(),
  /**
   * How the play time divides between reading and interaction (spec section 17):
   * 'narrative' (about 60% reading), 'balanced' (about 45%), 'puzzle' (about 30%).
   * Sizes the budget, sets the text budgets (section 4) and, when declared,
   * makes `lexvm check` compare the reading share against it.
   */
  pacing: z.enum(["narrative", "balanced", "puzzle"]).optional(),
  maxScore: z.number().int().positive().optional(),
  start: z.strictObject({
    room: IdSchema,
    /** Printed once before the first room description. */
    intro: TextSchema.optional(),
  }),
  verbs: z.record(IdSchema, VerbSchema).default({}),
  rooms: z.record(IdSchema, RoomSchema),
  objects: z.record(IdSchema, ObjectSchema).default({}),
  /** Declared flags with initial values. Undeclared flags are an error. */
  flags: z.record(IdSchema, z.boolean()).default({}),
  /** Declared counters with initial values. */
  counters: z.record(IdSchema, z.number().int()).default({}),
  rules: z.array(RuleSchema).default([]),
  dialogues: z.record(IdSchema, DialogueSchema).default({}),
  endings: z.record(IdSchema, EndingSchema),
  hints: z.array(HintSchema).default([]),
  /**
   * Canonical solution as command strings ("take brass_key", "use brass_key cellar_door",
   * "go north", "choose ask_alibi"). `lexvm check` replays it and requires a winning ending.
   */
  walkthrough: z.array(z.string().min(1)).min(1),
});

/** A parsed, normalised pack. */
export type Pack = z.output<typeof PackSchema>;
/** How the play time divides between reading and interaction. */
export type Pacing = NonNullable<Pack["pacing"]>;
/** What authors (and LLMs) write, before normalisation. */
export type PackInput = z.input<typeof PackSchema>;
