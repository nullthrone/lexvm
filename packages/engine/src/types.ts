/**
 * Runtime contract of the LexVM engine: game state, commands, output and views.
 *
 * Invariants:
 * - The engine is a pure function of (pack, state, command). No clocks, no
 *   randomness, no I/O. The same inputs always produce the same outputs.
 * - GameState is plain JSON (no Maps, Sets, classes, undefined values) so it
 *   can be saved, hashed, compared and sent anywhere.
 * - Functions never mutate their inputs; they return new state.
 */
import type { Id, Pacing } from "./schema.ts";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface ObjectState {
  /** Room id, container object id, "inventory" or "nowhere". */
  location: Id;
  open: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface GameState {
  /** State format version. */
  v: 1;
  pack: { id: string; version: string };
  /** Number of accepted commands. Not part of the logical state (see stateKey). */
  turn: number;
  /** Current room id. */
  room: Id;
  objects: Record<Id, ObjectState>;
  flags: Record<Id, boolean>;
  counters: Record<Id, number>;
  /** Rooms entered at least once, in first-visit order. */
  visited: Id[];
  /** Ids of `once` rules that have fired. */
  fired: Id[];
  /** "dialogueId.optionId" of chosen `once` dialogue options. */
  chosen: string[];
  /** Active dialogue, if any. While active, only `choose` commands are accepted. */
  dialogue: { id: Id; node: Id } | null;
  score: number;
  /** Ending id once the game is over. No further commands are accepted. */
  ended: Id | null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * A structured player command, produced by taps or by the parser.
 * - `go`: object is the exit id.
 * - `choose`: object is the dialogue option id.
 * - arity-2 verbs (use … with …, give … to …, show … to …): `with` is the second object.
 *
 * Canonical string form (used by walkthroughs and save logs): space-separated ids,
 * `verb [object [with]]`, e.g. "use brass_key cellar_door".
 */
export interface Command {
  verb: Id;
  object?: Id;
  with?: Id;
}

/** Commands handled by the host (UI or terminal), not by the game state machine. */
export type MetaCommand = "undo" | "restart" | "hint" | "help" | "save" | "load" | "quit";

export type ParseResult =
  | { ok: true; command: Command }
  | { ok: true; meta: MetaCommand }
  | {
      ok: false;
      error: "empty" | "unknown-verb" | "unknown-object" | "ambiguous" | "incomplete" | "not-here";
      /** Localized message suitable for display. */
      message: string;
      /** For 'ambiguous': the objects the input could mean. */
      candidates?: Array<{ id: Id; name: string }>;
    };

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A run of text; `ref` makes it a tappable reference to an object. */
export type Span = { text: string; ref?: Id };

export type OutputKind =
  | "echo" // the player's command, e.g. "› Nimm Logbuch"
  | "room-title" // room name when a room is described
  | "text" // narration
  | "npc" // a line spoken in dialogue (dialogue node `say`)
  | "player" // the player's dialogue choice
  | "system" // engine notices: exits list, score changes, new clue, errors
  | "ending"; // ending title and text

export interface OutputBlock {
  kind: OutputKind;
  /** One paragraph. Multi-paragraph texts produce multiple blocks. */
  spans: Span[];
}

export type StepStatus =
  /** The command was carried out (possibly with a default "nothing happens" response). Turn advanced. */
  | "ok"
  /** The command was invalid in this state (object not here, unknown exit, game over…). State unchanged. */
  | "rejected";

export interface StepResult {
  state: GameState;
  output: OutputBlock[];
  status: StepStatus;
}

// ---------------------------------------------------------------------------
// View (what the UI needs to render affordances)
// ---------------------------------------------------------------------------

export type ObjectKind = "item" | "clue" | "npc" | "container" | "scenery";

export interface ObjectView {
  id: Id;
  name: string;
  kind: ObjectKind;
  /** Verbs offered in this object's action sheet, in display order. */
  verbs: Id[];
}

export interface VerbView {
  id: Id;
  label: string;
  /** 0: no object (wait, inventory, look around). 1: one object. 2: object + second object. */
  arity: 0 | 1 | 2;
  /** For arity 2: connecting word, e.g. "mit". */
  prep?: string;
}

export interface View {
  room: { id: Id; name: string };
  /** Objects present in the current room (not in the inventory), in pack order. */
  objects: ObjectView[];
  /** Inventory items and clues, in pack order. */
  inventory: ObjectView[];
  /** Listed exits (visibleWhen holds), usable or not. */
  exits: Array<{ id: Id; label: string }>;
  /** All verbs the engine knows for this pack (core + pack verbs). */
  verbs: VerbView[];
  dialogue: null | {
    id: Id;
    /** NPC display name, if the dialogue declares `with`. */
    npc?: string;
    options: Array<{ id: Id; text: string }>;
  };
  ended: null | { id: Id; title: string; win: boolean };
  score: null | { value: number; max: number };
  turn: number;
}

export interface HintView {
  id: Id;
  steps: string[];
}

// ---------------------------------------------------------------------------
// Diagnostics and verification
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable code, e.g. "ref.unknown-object", "walkthrough.rejected". */
  code: string;
  /** Location in the pack, e.g. "rules[3].do[0].move.object" or "objects.brass_key". */
  path: string;
  /** Human- and LLM-readable explanation including how to fix it. */
  message: string;
  /** Source file the problem was found in, when known (compile only). */
  file?: string;
  /** 1-based line in `file`, when known. */
  line?: number;
}

export interface SourceFile {
  /** File name, used in diagnostics (e.g. "pack.yaml", "rooms.yaml"). */
  name: string;
  text: string;
}

export interface CompileResult {
  /** Null when there are errors. */
  pack: import("./schema.ts").Pack | null;
  diagnostics: Diagnostic[];
}

export interface WalkthroughStep {
  command: string;
  status: StepStatus;
  /** Plain-text rendering of the output, cut after STEP_OUTPUT_MAX (4000) characters of text. */
  output: string;
}

export interface WalkthroughReport {
  /** True when every step was accepted and the game ended with a winning ending. */
  ok: boolean;
  steps: WalkthroughStep[];
  ending: Id | null;
  score: number;
  diagnostics: Diagnostic[];
}

export interface ExploreOptions {
  /** Upper bound on distinct logical states. Default 200_000. */
  maxStates?: number;
  /** Also explore 'drop' commands (much larger state space). Default false. */
  includeDrop?: boolean;
}

export interface ExploreReport {
  /** True when the whole reachable state space was explored within limits. */
  complete: boolean;
  states: number;
  /** A winning ending is reachable from the start. */
  winnable: boolean;
  /** Shortest winning command sequence found (canonical strings). */
  shortestWin: string[] | null;
  /** Reachable, not-ended states from which no winning ending is reachable (dead ends). Path from start. */
  deadEnds: Array<{ path: string[] }>;
  /** Reachable non-winning endings. Path from start. */
  losingEndings: Array<{ ending: Id; path: string[] }>;
  /** Content never reached in any explored state (rooms, objects never present, rules never fired, endings, dialogue options). */
  unreached: { rooms: Id[]; endings: Id[]; rules: string[]; options: string[] };
  diagnostics: Diagnostic[];
}

/** Persisted save game. */
export interface SaveGame {
  format: "lexvm-save/1";
  pack: { id: string; version: string; hash: string };
  state: GameState;
  /** Accepted commands since the start, canonical strings. Allows replay after pack updates. */
  log: string[];
  /** ISO timestamp, set by the host. */
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Play time estimate
// ---------------------------------------------------------------------------

/**
 * Parameters of the play time model (spec: "Play time estimate"). Every field
 * is optional; the defaults are listed in PLAYTIME_DEFAULTS.
 */
export interface PlaytimeOptions {
  /** Silent reading speed in words per minute. Overrides the per-language default. */
  wordsPerMinute?: number;
  /** Reading speed per primary language subtag, merged over the defaults (de 200, en 230). */
  readingSpeeds?: Record<string, number>;
  /** Reading speed for languages without an entry in readingSpeeds. Default 220. */
  otherWordsPerMinute?: number;
  /** t_cmd: seconds per command (perceive the scene, tap object, pick verb). Default 10. */
  secondsPerCommand?: number;
  /** t_choice: seconds per dialogue choice. Default 6. */
  secondsPerChoice?: number;
  /** c: share of the optional content a typical player sees. Default 0.6. */
  coverage?: number;
  /** f: unproductive attempts per productive command. Default 1. */
  failedAttemptsPerCommand?: number;
  /** Allowed relative deviation of the expected time from the target. Default 0.25. */
  tolerance?: number;
  /** Target in minutes; overrides pack.playtime. */
  targetMinutes?: number;
}

export interface PlaytimeReport {
  /** pack.language. */
  language: string;
  /** Reading speed used (wpm). */
  wordsPerMinute: number;
  words: {
    /** W_path: words shown while replaying the walkthrough (narration, titles, dialogue, ending). */
    path: number;
    /** W_optional: words of pack texts a player can see that the walkthrough never shows. */
    optional: number;
  };
  commands: {
    /** C_path: accepted walkthrough commands except `choose`. */
    path: number;
    /** D_path: accepted `choose` steps. */
    choices: number;
    /** L_unseen: objects with a description the walkthrough never examines. */
    unseenLooks: number;
    /** O_unchosen: dialogue options the walkthrough never chooses. */
    unchosenOptions: number;
    /** f · C_path: expected unproductive attempts. */
    failedAttempts: number;
  };
  /** min: speedrun along the walkthrough; expected: a typical first play. Rounded to 0.01. */
  minutes: { min: number; expected: number; reading: number };
  /** Share of the expected time spent reading (reading / expected), rounded to 0.001. */
  readingShare: number;
  /** pack.pacing, or null when the pack declares none. */
  pacing: Pacing | null;
  /** options.targetMinutes ?? pack.playtime ?? null. */
  target: number | null;
  /** expected / target - 1, rounded to 0.001; null without a target. */
  deviation: number | null;
  /** playtime.estimate (always), playtime.no-target, playtime.too-short, playtime.too-long, playtime.pacing. */
  diagnostics: Diagnostic[];
}

/** Typical ratios of a pack, used to turn a target length into a budget. Defaults in BUDGET_DEFAULTS. */
export interface BudgetOptions extends PlaytimeOptions {
  /** W_optional / W_path. Default 0.6. */
  optionalWordRatio?: number;
  /** D_path / all walkthrough steps. Default 0.25. */
  choiceShare?: number;
  /** Pacing whose reading share sizes the budget. Default 'balanced'. */
  pacing?: Pacing;
  /** Share of the minutes spent reading, between 0 and 1; overrides pacing. */
  readingShare?: number;
  /** L_unseen / C_path. */
  unseenLooksPerCommand?: number;
  /** O_unchosen / D_path. */
  unchosenOptionsPerChoice?: number;
}

export interface PlaytimeBudget {
  /** Player-visible words in the whole pack (walkthrough path and optional text). */
  words: { min: number; max: number };
  /** Walkthrough steps, `choose` steps included. */
  walkthroughSteps: { min: number; max: number };
  /** Human- and LLM-readable guidance derived from the budget. */
  notes: string[];
}
