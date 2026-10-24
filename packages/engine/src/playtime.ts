/**
 * Play time estimate (spec: "Play time estimate").
 *
 * The model, with every parameter an option (defaults in PLAYTIME_DEFAULTS):
 *
 *   minutes_min      = W_path / wpm + (C_path · t_cmd + D_path · t_choice) / 60
 *   minutes_expected = minutes_min + (c · W_optional) / wpm
 *                      + (c · L_unseen · t_cmd + c · O_unchosen · t_choice + f · C_path · t_cmd) / 60
 *
 * - W_path: words output while replaying the walkthrough (blocks of kind text,
 *   room-title, npc, player and ending; not echo, not system).
 * - W_optional: words of pack texts a player can see that the walkthrough never
 *   displayed: object descriptions (the longest variant only), dialogue node
 *   `say` and option texts, command-rule `say` texts (inside `if` too) and room
 *   description variants. "Seen" is decided by rendered-content identity: a
 *   paragraph counts as seen when exactly that plain-text paragraph appeared in
 *   the walkthrough output. Every paragraph is counted at most once.
 * - C_path: walkthrough commands except `choose`; D_path: `choose` steps.
 * - L_unseen: objects with a description the walkthrough never examines
 *   (`look <object>`); O_unchosen: dialogue options the walkthrough never chooses.
 *
 * budgetForMinutes inverts the model with typical ratios of a pack
 * (BUDGET_DEFAULTS) and the reading share of the pack's pacing
 * (PACING_READING_SHARE), so a generator can be given a size budget up front.
 *
 * Pure and deterministic: word counting uses a Unicode regular expression on
 * NFC-normalised text, no Intl or locale-dependent calls.
 */

import { parseCanonical } from "./commands.ts";
import { optionKey } from "./effects.ts";
import { newGame, step } from "./runtime.ts";
import type { Effects, Pacing, Pack, Text } from "./schema.ts";
import { markup, paragraphs } from "./text.ts";
import type {
  BudgetOptions,
  Diagnostic,
  OutputBlock,
  OutputKind,
  PlaytimeBudget,
  PlaytimeOptions,
  PlaytimeReport,
} from "./types.ts";

/** Defaults of the play time model. See the spec for the sources of the reading speeds. */
export const PLAYTIME_DEFAULTS = {
  /**
   * Silent reading speed (words per minute) per primary language subtag.
   * Deliberately below lab values (Brysbaert 2019: 238 wpm non-fiction, 260 wpm
   * fiction for English): phone screens, game context, re-reading. German is
   * slower in words per minute because its words are longer (IReST: 1126 vs
   * 1234 characters per minute for young adults).
   */
  readingSpeeds: { de: 200, en: 230 } as Readonly<Record<string, number>>,
  otherWordsPerMinute: 220,
  secondsPerCommand: 10,
  secondsPerChoice: 6,
  coverage: 0.6,
  /**
   * Unproductive attempts per productive command. The playtests of
   * packs/letzte-nacht-der-reichsmark (74 walkthrough steps, 47 of them
   * commands) logged 180 and 226 commands; after the optional looks and
   * dialogue options the model counts separately, that leaves about 0.9 and 1.8
   * attempts per command. 1.0 is the cautious end of that range.
   */
  failedAttemptsPerCommand: 1,
  tolerance: 0.25,
} as const;

/**
 * Target share of the expected play time spent reading, per pacing (spec
 * section 17). A pack without `pacing` is sized as 'balanced'.
 */
export const PACING_READING_SHARE: Readonly<Record<Pacing, number>> = {
  narrative: 0.6,
  balanced: 0.45,
  puzzle: 0.3,
};

/** Allowed absolute deviation of the reading share from its pacing target (playtime.pacing). */
export const PACING_BAND = 0.1;

export const DEFAULT_PACING: Pacing = "balanced";

/**
 * Typical ratios of a pack, calibrated against packs/locked-study (English)
 * and the German test fixture packages/engine/test/fixtures/runtime/hafen.yaml
 * (pooled over both walkthroughs) and rounded; see the spec, "Play time
 * estimate", for the measured values.
 */
export const BUDGET_DEFAULTS = {
  /**
   * W_optional ≈ 0.6 · W_path. The two calibration packs measure 0.3–0.35; a
   * full-length game is expected to carry more side content (custom responses
   * to wrong attempts, dialogue branches), so the budget asks for more.
   */
  optionalWordRatio: 0.6,
  /** D_path ≈ 0.25 · all walkthrough steps (measured: 0.28). */
  choiceShare: 0.25,
  /** L_unseen ≈ 0.5 · C_path (measured: 0.56). */
  unseenLooksPerCommand: 0.5,
  /** O_unchosen ≈ 0.25 · D_path (measured: 0.14; rounded up, longer games have more side topics). */
  unchosenOptionsPerChoice: 0.25,
} as const;

/** Minutes a puzzle typically adds (authoring guide: 6–8 puzzles for 30–45 minutes). Used for guidance only. */
const MINUTES_PER_PUZZLE = { min: 5, max: 8 } as const;

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/**
 * Number of words in plain text: runs of letters and digits, joined by an
 * apostrophe or a hyphen ("don't", "Hafen-Kontor" count as one word). The text
 * is NFC-normalised first, so decomposed umlauts count like composed ones.
 */
export function countWords(text: string): number {
  return text.normalize("NFC").match(WORD)?.length ?? 0;
}

/** Output kinds whose words count as reading: narration, titles, dialogue lines, endings. */
const READ_KINDS: ReadonlySet<OutputKind> = new Set(["text", "room-title", "npc", "player", "ending"]);

function blockText(block: OutputBlock): string {
  return block.spans.map((s) => s.text).join("");
}

/** A pack text string as the player sees it: one plain string per paragraph, markup resolved. */
function renderedParagraphs(pack: Pack, text: string): string[] {
  return paragraphs(text).map((p) =>
    markup(pack, null, p)
      .map((s) => s.text)
      .join(""),
  );
}

function textStrings(text: Text | undefined): string[] {
  if (text === undefined) return [];
  return typeof text === "string" ? [text] : text.map((v) => v.text);
}

function sayTexts(effects: Effects | undefined, out: Text[]): void {
  for (const e of effects ?? []) {
    if ("say" in e) out.push(e.say);
    else if ("if" in e) {
      sayTexts(e.if.then, out);
      sayTexts(e.if.else, out);
    }
  }
}

interface Replay {
  /** Every output block of the replay, the new-game output first. */
  blocks: OutputBlock[];
  commands: number;
  choices: number;
  /** Objects examined with `look <object>`. */
  examined: Set<string>;
  /** "dialogue.option" keys chosen. */
  chosen: Set<string>;
  /** Accepted steps. */
  accepted: number;
  /** Every step accepted and a winning ending reached at the last step. */
  ok: boolean;
}

/** Replay the walkthrough like runWalkthrough, keeping the output blocks. Stops at the first problem. */
function replay(pack: Pack): Replay {
  const game = newGame(pack);
  let state = game.state;
  const r: Replay = {
    blocks: [...game.output],
    commands: 0,
    choices: 0,
    examined: new Set(),
    chosen: new Set(),
    accepted: 0,
    ok: false,
  };
  let failed = false;
  for (const text of pack.walkthrough) {
    const cmd = state.ended === null ? parseCanonical(text) : null;
    if (cmd === null) {
      failed = true;
      break;
    }
    const dialogue = state.dialogue?.id;
    const result = step(pack, state, cmd);
    if (result.status !== "ok") {
      failed = true;
      break;
    }
    r.accepted++;
    r.blocks.push(...result.output);
    if (cmd.verb === "choose") {
      r.choices++;
      if (dialogue !== undefined && cmd.object !== undefined) r.chosen.add(optionKey(dialogue, cmd.object));
    } else {
      r.commands++;
      if (cmd.verb === "look" && cmd.object !== undefined) r.examined.add(cmd.object);
    }
    state = result.state;
  }
  r.ok = !failed && state.ended !== null && pack.endings[state.ended]?.win === true;
  return r;
}

interface Params {
  wpm: number;
  tCmd: number;
  tChoice: number;
  c: number;
  f: number;
  tolerance: number;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`playtime: ${name} must be a positive number`);
  return value;
}

function share(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`playtime: ${name} must not be negative`);
  return value;
}

/** Reading speed for a BCP 47 tag: explicit option, then the table by primary subtag, then the fallback. */
function readingSpeed(language: string, options: PlaytimeOptions): number {
  if (options.wordsPerMinute !== undefined) return positive(options.wordsPerMinute, "wordsPerMinute");
  const base = language.toLowerCase().split("-")[0] ?? "";
  const table: Record<string, number> = { ...PLAYTIME_DEFAULTS.readingSpeeds, ...options.readingSpeeds };
  const wpm = Object.hasOwn(table, base) ? table[base] : undefined;
  return positive(wpm ?? options.otherWordsPerMinute ?? PLAYTIME_DEFAULTS.otherWordsPerMinute, "reading speed");
}

function params(language: string, options: PlaytimeOptions): Params {
  return {
    wpm: readingSpeed(language, options),
    tCmd: share(options.secondsPerCommand ?? PLAYTIME_DEFAULTS.secondsPerCommand, "secondsPerCommand"),
    tChoice: share(options.secondsPerChoice ?? PLAYTIME_DEFAULTS.secondsPerChoice, "secondsPerChoice"),
    c: share(options.coverage ?? PLAYTIME_DEFAULTS.coverage, "coverage"),
    f: share(
      options.failedAttemptsPerCommand ?? PLAYTIME_DEFAULTS.failedAttemptsPerCommand,
      "failedAttemptsPerCommand",
    ),
    tolerance: share(options.tolerance ?? PLAYTIME_DEFAULTS.tolerance, "tolerance"),
  };
}

interface Counts {
  wPath: number;
  wOptional: number;
  cPath: number;
  dPath: number;
  lUnseen: number;
  oUnchosen: number;
}

/** The two model formulas, plus the reading part of the expected time. */
function modelMinutes(n: Counts, p: Params): { min: number; expected: number; reading: number } {
  const min = n.wPath / p.wpm + (n.cPath * p.tCmd + n.dPath * p.tChoice) / 60;
  const expected =
    min +
    (p.c * n.wOptional) / p.wpm +
    (p.c * n.lUnseen * p.tCmd + p.c * n.oUnchosen * p.tChoice + p.f * n.cPath * p.tCmd) / 60;
  return { min, expected, reading: (n.wPath + p.c * n.wOptional) / p.wpm };
}

/** Count everything the model needs from a pack. */
function measure(pack: Pack): { counts: Counts; replay: Replay } {
  const r = replay(pack);
  // Paragraph text → word count; repeated output (a long `say` on every step) is counted once.
  const seen = new Map<string, number>();
  let wPath = 0;
  for (const block of r.blocks) {
    if (block.kind === "echo") continue;
    const text = blockText(block);
    let words = seen.get(text);
    if (words === undefined) {
      words = READ_KINDS.has(block.kind) ? countWords(text) : 0;
      seen.set(text, words);
    }
    if (READ_KINDS.has(block.kind)) wPath += words;
  }

  const counted = new Set<string>();
  let wOptional = 0;
  const addString = (text: string) => {
    for (const p of renderedParagraphs(pack, text)) {
      if (seen.has(p) || counted.has(p)) continue;
      counted.add(p);
      wOptional += countWords(p);
    }
  };
  const addText = (text: Text | undefined) => {
    for (const s of textStrings(text)) addString(s);
  };

  let lUnseen = 0;
  for (const [id, object] of Object.entries(pack.objects)) {
    if (object.description === undefined) continue;
    if (!r.examined.has(id)) lUnseen++;
    // Several variants describe one object in different states; a player usually reads one of them.
    let longest: string | undefined;
    let longestWords = -1;
    for (const s of textStrings(object.description)) {
      const words = renderedParagraphs(pack, s).reduce((sum, p) => sum + countWords(p), 0);
      if (words > longestWords) {
        longest = s;
        longestWords = words;
      }
    }
    if (longest !== undefined) addString(longest);
  }
  const allOptions = new Set<string>();
  for (const [dialogueId, dialogue] of Object.entries(pack.dialogues)) {
    for (const node of Object.values(dialogue.nodes)) {
      addText(node.say);
      for (const option of node.options ?? []) {
        allOptions.add(optionKey(dialogueId, option.id));
        addString(option.text);
      }
    }
  }
  const oUnchosen = [...allOptions].filter((key) => !r.chosen.has(key)).length;
  for (const rule of pack.rules) {
    if (!("verb" in rule.on)) continue;
    const says: Text[] = [];
    sayTexts(rule.do, says);
    for (const say of says) addText(say);
  }
  for (const room of Object.values(pack.rooms)) addText(room.description);

  return {
    counts: { wPath, wOptional, cPath: r.commands, dPath: r.choices, lUnseen, oUnchosen },
    replay: r,
  };
}

// ---------------------------------------------------------------------------
// Formatting (deterministic, no Intl)
// ---------------------------------------------------------------------------

/** 1234567 → "1,234,567". */
function thousands(n: number): string {
  const digits = String(Math.round(Math.abs(n)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `-${grouped}` : grouped;
}

/** Whole minutes for messages, at least 1. */
function wholeMinutes(m: number): number {
  return Math.max(1, Math.round(m));
}

/** Word counts in guidance: nearest 10 below 200, nearest 50 above. */
function roundWords(n: number): number {
  const step = n < 200 ? 10 : 50;
  return Math.max(step, Math.round(n / step) * step);
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function plural(n: number, one: string, many: string): string {
  return `${thousands(n)} ${n === 1 ? one : many}`;
}

/** 0.5, "object", "command" → "about 1 object for every 2 commands"; 2 → "about 2 objects per command". */
function perUnit(ratio: number, thing: string, unit: string): string {
  if (ratio <= 0) return `no ${thing}s`;
  if (ratio >= 1) return `about ${round(ratio, 1)} ${ratio === 1 ? thing : `${thing}s`} per ${unit}`;
  const every = Math.round(1 / ratio);
  return `about 1 ${thing} for every ${every === 1 ? unit : `${every} ${unit}s`}`;
}

function puzzleRange(deltaMinutes: number): string | null {
  if (deltaMinutes < MINUTES_PER_PUZZLE.min * 0.8) return null;
  const lo = Math.max(1, Math.floor(deltaMinutes / MINUTES_PER_PUZZLE.max));
  const hi = Math.max(lo, Math.round(deltaMinutes / MINUTES_PER_PUZZLE.min));
  return lo === hi ? plural(lo, "puzzle", "puzzles") : `${lo}-${hi} puzzles`;
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

/**
 * Estimate how long a pack takes to play, from its walkthrough and its texts.
 * Diagnostics (path "playtime"): info playtime.estimate (always), info
 * playtime.no-target (no target set), warning playtime.too-short /
 * playtime.too-long when |expected / target - 1| exceeds the tolerance. A
 * walkthrough that does not reach a winning ending is measured up to its first
 * failing step; the deviation warnings and the playtime suggestion are then
 * left out (the walkthrough diagnostics come first).
 */
export function estimatePlaytime(pack: Pack, options: PlaytimeOptions = {}): PlaytimeReport {
  const p = params(pack.language, options);
  const { counts: n, replay: r } = measure(pack);
  const minutes = modelMinutes(n, p);
  const target =
    options.targetMinutes !== undefined ? positive(options.targetMinutes, "targetMinutes") : (pack.playtime ?? null);
  const rawDeviation = target === null ? null : minutes.expected / target - 1;
  const readingShare = minutes.expected > 0 ? minutes.reading / minutes.expected : 0;
  const pacing = pack.pacing ?? null;

  const diagnostics: Diagnostic[] = [];
  const expectedText = `≈ ${wholeMinutes(minutes.expected)} min expected (speedrun ${wholeMinutes(minutes.min)} min)`;
  const basis =
    `Walkthrough: ${plural(n.wPath, "word", "words")}, ${plural(n.cPath, "command", "commands")}, ` +
    `${plural(n.dPath, "dialogue choice", "dialogue choices")}; optional: ${plural(n.wOptional, "word", "words")}, ` +
    `${plural(n.lUnseen, "unexamined object", "unexamined objects")}, ` +
    `${plural(n.oUnchosen, "unchosen dialogue option", "unchosen dialogue options")}; ` +
    `reading speed ${p.wpm} words/min (${pack.language}); reading ${Math.round(readingShare * 100)}% of the expected time` +
    `${pacing === null ? "" : ` (pacing ${pacing}: target ${Math.round(PACING_READING_SHARE[pacing] * 100)}%)`}.`;
  const partial = r.ok
    ? ""
    : ` The walkthrough does not reach a winning ending, so this covers only its first ${plural(r.accepted, "accepted step", "accepted steps")}.`;
  diagnostics.push({
    severity: "info",
    code: "playtime.estimate",
    path: "playtime",
    message: `${expectedText}; ${target === null ? "no target" : `target ${target} min`}. ${basis}${partial}`,
  });

  if (r.ok && target === null) {
    diagnostics.push({
      severity: "info",
      code: "playtime.no-target",
      path: "playtime",
      message:
        `The pack sets no playtime. Suggest playtime: ${wholeMinutes(minutes.expected)} ` +
        "(the expected estimate, rounded), so the library can show it and checks can compare against it.",
    });
  }
  if (r.ok && target !== null && rawDeviation !== null && Math.abs(rawDeviation) > p.tolerance) {
    diagnostics.push(
      deviationWarning(
        n,
        p,
        minutes,
        target,
        rawDeviation,
        options.targetMinutes === undefined,
        pacing ?? DEFAULT_PACING,
      ),
    );
  }
  if (r.ok && pacing !== null) {
    const warning = pacingWarning(minutes, readingShare, pacing, p);
    if (warning !== null) diagnostics.push(warning);
  }

  return {
    language: pack.language,
    wordsPerMinute: p.wpm,
    words: { path: n.wPath, optional: n.wOptional },
    commands: {
      path: n.cPath,
      choices: n.dPath,
      unseenLooks: n.lUnseen,
      unchosenOptions: n.oUnchosen,
      failedAttempts: round(p.f * n.cPath, 2),
    },
    minutes: { min: round(minutes.min, 2), expected: round(minutes.expected, 2), reading: round(minutes.reading, 2) },
    readingShare: round(readingShare, 3),
    pacing,
    target,
    deviation: rawDeviation === null ? null : round(rawDeviation, 3),
    diagnostics,
  };
}

/** too-short / too-long with concrete numbers, derived from the pack's own proportions. */
function deviationWarning(
  n: Counts,
  p: Params,
  minutes: { min: number; expected: number },
  target: number,
  deviation: number,
  targetFromPack: boolean,
  pacing: Pacing,
): Diagnostic {
  const delta = Math.abs(target - minutes.expected);
  const steps = n.cPath + n.dPath;
  // Minutes per walkthrough step, text and side content included, as in this pack (else as in a typical pack).
  const perStep =
    steps > 0 ? minutes.expected / steps : typicalMinutesPerStep(p, ratios({}), PACING_READING_SHARE[pacing]);
  const commands = Math.max(1, Math.round(delta / perStep));
  const pct = Math.round(Math.abs(deviation) * 100);
  const head =
    `Estimated play time ≈ ${wholeMinutes(minutes.expected)} min (speedrun ${wholeMinutes(minutes.min)} min) is ` +
    `${pct}% ${deviation < 0 ? "below" : "above"} the target of ${target} min (tolerance ±${Math.round(p.tolerance * 100)}%)`;
  const own = targetFromPack ? ` If the length is intended, set playtime: ${wholeMinutes(minutes.expected)}.` : "";
  if (deviation < 0) {
    const optionalWords = roundWords((delta * p.wpm) / Math.max(p.c, 0.01));
    const puzzles = puzzleRange(delta);
    const mechanics = [
      puzzles === null ? null : `add ${puzzles}`,
      `${puzzles === null ? "add " : ""}≈ ${plural(commands, "walkthrough command", "walkthrough commands")}`,
    ];
    // A narrative pack grows by its scenes first: prose the walkthrough shows (read in full) or optional text.
    const ways = (
      pacing === "narrative"
        ? [
            `add ≈ ${thousands(roundWords(delta * p.wpm))} words of scene prose along the walkthrough (or ≈ ${thousands(optionalWords)} of optional dialogue/description)`,
            ...mechanics,
          ]
        : [...mechanics, `≈ ${thousands(optionalWords)} words of optional dialogue/description`]
    ).filter((w) => w !== null);
    return {
      severity: "warning",
      code: "playtime.too-short",
      path: "playtime",
      message:
        `${head}: ≈ ${wholeMinutes(delta)} min short: ${ways.join(", or ")}. ` +
        `Keep the walkthrough, hints and maxScore in step with new content.${own}`,
    };
  }
  // Reading minutes per word of text, as mixed in this pack (path words read fully, optional words partly).
  const totalWords = n.wPath + n.wOptional;
  const readMinutes = (n.wPath + p.c * n.wOptional) / p.wpm;
  const perWord = totalWords > 0 && readMinutes > 0 ? readMinutes / totalWords : 1 / p.wpm;
  const trimWords = roundWords(delta / perWord);
  // Cutting more than half of all text is not a realistic way to shorten a game; then only commands are suggested.
  const words = trimWords <= totalWords / 2 ? `trim ≈ ${thousands(trimWords)} words or ` : "cut ";
  return {
    severity: "warning",
    code: "playtime.too-long",
    path: "playtime",
    message:
      `${head}: ≈ ${wholeMinutes(delta)} min too long: ${words}≈ ${plural(commands, "command", "commands")} ` +
      `(for example a side puzzle), keeping the walkthrough, hints and maxScore consistent.${own}`,
  };
}

/** playtime.pacing: the reading share is outside the band of the declared pacing. */
function pacingWarning(
  minutes: { expected: number; reading: number },
  readingShare: number,
  pacing: Pacing,
  p: Params,
): Diagnostic | null {
  const goal = PACING_READING_SHARE[pacing];
  if (Math.abs(readingShare - goal) <= PACING_BAND) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const head =
    `Reading is ${pct(readingShare)} of the expected play time; pacing ${pacing} aims at ${pct(goal)} ` +
    `(${pct(goal - PACING_BAND)}–${pct(goal + PACING_BAND)})`;
  const interaction = minutes.expected - minutes.reading;
  if (readingShare < goal) {
    // Reading minutes needed so that reading / (reading + interaction) reaches the lower edge of the band.
    const low = goal - PACING_BAND;
    const words = roundWords(((low * interaction) / (1 - low) - minutes.reading) * p.wpm);
    return {
      severity: "warning",
      code: "playtime.pacing",
      path: "pacing",
      message:
        `${head}: the story is told too thinly for its mechanics. Write out the scenes along the walkthrough ` +
        `(≈ ${thousands(words)} more words: arrivals, turning points of conversations, what a clue means, transitions ` +
        "between acts), or cut commands that tell nothing. Do not pad descriptions with adjectives.",
    };
  }
  return {
    severity: "warning",
    code: "playtime.pacing",
    path: "pacing",
    message:
      `${head}: the player reads much more than they act. Give scenes something to do (an examination, a dialogue ` +
      "choice), trim description, or declare a pacing that fits the pack.",
  };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

interface Ratios {
  optionalWordRatio: number;
  choiceShare: number;
  unseenLooksPerCommand: number;
  unchosenOptionsPerChoice: number;
}

function ratios(options: BudgetOptions): Ratios {
  const choiceShare = share(options.choiceShare ?? BUDGET_DEFAULTS.choiceShare, "choiceShare");
  if (choiceShare >= 1) throw new RangeError("playtime: choiceShare must be below 1");
  return {
    optionalWordRatio: share(options.optionalWordRatio ?? BUDGET_DEFAULTS.optionalWordRatio, "optionalWordRatio"),
    choiceShare,
    unseenLooksPerCommand: share(
      options.unseenLooksPerCommand ?? BUDGET_DEFAULTS.unseenLooksPerCommand,
      "unseenLooksPerCommand",
    ),
    unchosenOptionsPerChoice: share(
      options.unchosenOptionsPerChoice ?? BUDGET_DEFAULTS.unchosenOptionsPerChoice,
      "unchosenOptionsPerChoice",
    ),
  };
}

/** Interaction minutes per walkthrough step under typical ratios: tapping, wrong attempts, side looks and options. */
function interactionPerStep(p: Params, q: Ratios): number {
  const perCommand = (p.tCmd * (1 + p.f + p.c * q.unseenLooksPerCommand)) / 60;
  const perChoice = (p.tChoice * (1 + p.c * q.unchosenOptionsPerChoice)) / 60;
  return (1 - q.choiceShare) * perCommand + q.choiceShare * perChoice;
}

/** Expected minutes per walkthrough step, reading included, for a pack whose reading share is `share`. */
function typicalMinutesPerStep(p: Params, q: Ratios, share: number): number {
  return interactionPerStep(p, q) / (1 - share);
}

function readingShareOf(options: BudgetOptions): number {
  const value = options.readingShare ?? PACING_READING_SHARE[options.pacing ?? DEFAULT_PACING];
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError("playtime: readingShare must be between 0 and 1");
  }
  return value;
}

/**
 * A size budget for a target length: the inverse of the model. The reading
 * share of the pacing splits the minutes into reading and interaction:
 * interaction sizes the walkthrough (steps · interactionPerStep), reading
 * sizes the text (W_path + c · W_optional = reading minutes · wpm, with
 * W_optional = o · W_path). The ranges span ±tolerance/2 around the target, so
 * any combination of words and steps inside them lands within the tolerance
 * (the model is increasing in both).
 */
export function budgetForMinutes(minutes: number, language: string, options: BudgetOptions = {}): PlaytimeBudget {
  positive(minutes, "minutes");
  const p = params(language, options);
  const q = ratios(options);
  const readShare = readingShareOf(options);
  const steps = ((1 - readShare) * minutes) / interactionPerStep(p, q);
  const pathWords = (readShare * minutes * p.wpm) / (1 + p.c * q.optionalWordRatio);
  const words = pathWords * (1 + q.optionalWordRatio);
  const wordsPerCommand = pathWords / Math.max(1, (1 - q.choiceShare) * steps);
  const band = p.tolerance / 2;
  const stepRange = {
    min: Math.max(1, Math.ceil(steps * (1 - band))),
    max: Math.max(1, Math.floor(steps * (1 + band))),
  };
  if (stepRange.max < stepRange.min) stepRange.max = stepRange.min;
  const wordStep = words < 2000 ? 10 : 50;
  const wordRange = {
    min: Math.ceil((words * (1 - band)) / wordStep) * wordStep,
    max: Math.max(wordStep, Math.floor((words * (1 + band)) / wordStep) * wordStep),
  };
  if (wordRange.max < wordRange.min) wordRange.max = wordRange.min;

  const pathShare = Math.round(100 / (1 + q.optionalWordRatio));
  const notes = [
    `Target: about ${round(minutes, 1)} minutes for a typical first play (reading speed ${p.wpm} words per minute, language ${language}), ` +
      `about ${Math.round(readShare * 100)}% of it reading${options.pacing === undefined ? "" : ` (pacing ${options.pacing})`}.`,
    `Walkthrough: ${stepRange.min}–${stepRange.max} steps, about ${Math.round(q.choiceShare * 100)}% of them dialogue choices (choose).`,
    `Text: ${thousands(wordRange.min)}–${thousands(wordRange.max)} player-visible words in the whole pack, about ${pathShare}% of them ` +
      `shown along the walkthrough (about ${Math.round(wordsPerCommand)} words of new text per command), the rest in optional ` +
      "descriptions, dialogue branches and custom responses to wrong attempts.",
    `Side content: ${perUnit(q.unseenLooksPerCommand, "described object", "walkthrough command")} that the walkthrough never ` +
      `examines, and ${perUnit(q.unchosenOptionsPerChoice, "dialogue option", "dialogue choice")} that it never chooses.`,
  ];
  return { words: wordRange, walkthroughSteps: stepRange, notes };
}
