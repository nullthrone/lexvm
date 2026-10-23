/**
 * Localized engine messages, labels and parser vocabulary.
 *
 * One catalog per language. The catalog is selected by the language prefix of
 * `pack.language` (`de`, `de-AT` → German); unknown languages fall back to
 * English. Default messages deliberately avoid articles and inflected object
 * names ("Genommen: Logbuch.") so they work for any object name.
 */
import type { CoreVerb, STANDARD_EXITS } from "../schema.ts";
import type { MetaCommand, Span } from "../types.ts";
import { de } from "./de.ts";
import { en } from "./en.ts";

export type StandardExit = (typeof STANDARD_EXITS)[number];

/** Parser word lists. Phrases are written naturally; the parser folds them (umlauts, case). */
export interface Vocabulary {
  /**
   * Verb phrases: [phrase, verb id] or [phrase, verb id, particle]. With a
   * particle the entry only matches when the particle closes the sentence
   * ("mach Tür auf") or directly follows the phrase. The pseudo verb "@unlock"
   * becomes `open x` or `use key with x`; "@none" marks a phrase that has no
   * command (the parser reports it as an unknown verb).
   */
  verbs: Array<[string, string] | [string, string, string]>;
  /** Words that mean "examine" only when the pack has no `read` verb ("lies", "read"). */
  readWords: string[];
  /**
   * Direction words for standard exits. The parser also accepts the words of
   * the other languages, except their abbreviations other than n, s, e, w.
   */
  directions: Record<StandardExit, string[]>;
  stopwords: string[];
  /** Prepositions that separate the two objects of a two-object command. */
  splitPreps: string[];
  /**
   * Prepositions naming where an object is taken from ("take letter from desk",
   * "nimm Foto aus Kiste"). When the whole phrase names no object, the part
   * before the first of these words is tried alone.
   */
  sourcePreps: string[];
  /** Separable verb particles that may close a sentence ("heb Lampe auf"). */
  particles: string[];
  meta: Record<MetaCommand, string[]>;
}

export interface Messages {
  lang: "de" | "en";

  // Turn results. Placeholders: {obj}, {key}, {npc} (object references), {list}, {n}, {max}.
  taken: string;
  alreadyHeld: string;
  notTakeable: string;
  dropped: string;
  notHeld: string;
  cannotDropClue: string;
  opened: string;
  unlockedAndOpened: string;
  alreadyOpen: string;
  notOpenable: string;
  locked: string;
  closed: string;
  alreadyClosed: string;
  notClosable: string;
  unlocked: string;
  alreadyUnlocked: string;
  doesNotWork: string;
  nothingHappens: string;
  noAnswer: string;
  notInterested: string;
  blocked: string;
  timePasses: string;
  carrying: string;
  carryingNothing: string;
  notebook: string;
  hereLies: string;
  contents: string;
  isEmpty: string;
  isClosed: string;
  exits: string;
  nothingSpecial: string;
  learned: string;
  pointGained: string;
  pointsGained: string;
  pointsLost: string;
  finalScore: string;

  // Rejections (status 'rejected'). Placeholders: {verb}, {id}.
  rejectGameOver: string;
  rejectInDialogue: string;
  rejectOptionUnavailable: string;
  rejectNoDialogue: string;
  rejectUnknownVerb: string;
  rejectUnknownObject: string;
  rejectNotHere: string;
  rejectNoExit: string;
  rejectNeedsObject: string;
  rejectNeedsSecond: string;
  rejectTooMany: string;
  rejectSameObject: string;

  // Labels
  exitLabels: Record<StandardExit, string>;
  verbLabels: Record<CoreVerb, string>;
  /** Connecting words of the core two-object verbs, as shown in the UI. */
  preps: { use: string; give: string; show: string };

  /** Echo labels for commands. Placeholders: {obj}, {with}, {dir}, {label}, {verb}, {prep}. */
  cmd: {
    look0: string;
    look: string;
    take: string;
    drop: string;
    open: string;
    close: string;
    use: string;
    useWith: string;
    talk: string;
    give: string;
    show: string;
    push: string;
    pull: string;
    /** Compass directions ("Geh nach Norden"). */
    goCompass: string;
    /** up/down/in/out ("Geh hinauf"). */
    goPlain: string;
    /** Custom exit labels ("Geh: Kellertreppe"). */
    goLabel: string;
    wait: string;
    inventory: string;
    generic1: string;
    generic2: string;
  };

  /** Parser errors. Placeholders: {word}, {words}, {verb}, {list}, {n}. */
  parse: {
    empty: string;
    unknownVerb: string;
    unknownObject: string;
    unknownDirection: string;
    notHere: string;
    ambiguous: string;
    or: string;
    incomplete: string;
    incompleteWhom: string;
    incompleteWith: string;
    incompleteWhere: string;
    /** "go <name of the current room>". */
    alreadyHere: string;
    chooseOption: string;
    /** A dialogue option number that is not on the list. Placeholders: {n} (typed), {max}. */
    noSuchOption: string;
  };

  vocab: Vocabulary;
}

const catalogs: Record<string, Messages> = { de, en };

/** Message catalog for a BCP 47 language tag; English when the language is not supported. */
export function messagesFor(language: string): Messages {
  const prefix = language.toLowerCase().split("-")[0] ?? "";
  return catalogs[prefix] ?? en;
}

/** All catalogs (the parser accepts direction words of every language). */
export function allCatalogs(): Messages[] {
  return [de, en];
}

export type FmtArg = string | number | Span[];

/**
 * Fill a message template. Span arguments keep their `ref` (tappable object
 * names); adjacent plain text is merged. A template that starts with a
 * placeholder gets its first letter capitalized ("Oak door is closed.").
 */
export function fmt(template: string, args: Record<string, FmtArg> = {}): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) pushText(spans, template.slice(last, m.index));
    const value = args[m[1] ?? ""];
    if (value === undefined) pushText(spans, m[0]);
    else if (typeof value === "string" || typeof value === "number") pushText(spans, String(value));
    else
      for (const s of value) {
        if (s.ref !== undefined) spans.push({ text: s.text, ref: s.ref });
        else pushText(spans, s.text);
      }
    last = m.index + m[0].length;
  }
  if (last < template.length) pushText(spans, template.slice(last));
  const first = spans[0];
  if (template.startsWith("{") && first && first.text.length > 0) {
    first.text = first.text.charAt(0).toUpperCase() + first.text.slice(1);
  }
  return spans;
}

/** Fill a template with plain strings (labels, parser messages). */
export function fill(template: string, args: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = args[name];
    return v === undefined ? whole : String(v);
  });
}

/** Join span lists with ", " (object lists in messages). */
export function joinSpans(items: Span[][], sep = ", "): Span[] {
  const out: Span[] = [];
  items.forEach((item, i) => {
    if (i > 0) pushText(out, sep);
    for (const s of item) {
      if (s.ref !== undefined) out.push({ text: s.text, ref: s.ref });
      else pushText(out, s.text);
    }
  });
  return out;
}

function pushText(spans: Span[], text: string): void {
  if (text.length === 0) return;
  const last = spans[spans.length - 1];
  if (last && last.ref === undefined) last.text += text;
  else spans.push({ text });
}
