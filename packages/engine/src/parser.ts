/**
 * Free-text parser for German and English (and the fallback language).
 *
 * The parser only turns text into structured commands; the runtime decides
 * whether a command is valid. Matching works on folded words: lowercase,
 * NFC, ä→ae ö→oe ü→ue ß→ss, other diacritics stripped, punctuation removed.
 * Vocabulary (verbs, object names and synonyms, exit labels) is folded the
 * same way, plus a light suffix stemmer so that "roten Buch" finds "rotes Buch".
 *
 * Order of interpretation:
 * 1. "?" and meta words (undo, restart, hint, help, save, load, quit).
 * 2. In a dialogue: a digit picks the n-th available option, otherwise the
 *    option whose text shares the most words with the input.
 * 3. A bare direction or exit label ("n", "nach Norden", "Kellertreppe").
 * 4. Verb phrase (longest match; separable particles such as "mach … auf"),
 *    then one or two objects. Two-object verbs split on their preposition
 *    (or any known one); give/show without preposition are segmented
 *    greedily and an npc named first is swapped into the second slot.
 *    "open/unlock X with Y" becomes "use Y with X"; "take X from Y" ignores
 *    the source phrase.
 */
import { listedExits } from "./affordances.ts";
import { availableOptions } from "./effects.ts";
import { allCatalogs, fill, type Messages, messagesFor } from "./messages/index.ts";
import { indexPack } from "./pack-index.ts";
import { presentObjects } from "./presence.ts";
import type { Pack } from "./schema.ts";
import type { Command, GameState, MetaCommand, ParseResult } from "./types.ts";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Fold one word for matching. */
export function foldWord(word: string): string {
  return word
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Fold a phrase: folded words separated by single spaces. */
export function fold(text: string): string {
  return splitWords(text).map(foldWord).filter(Boolean).join(" ");
}

function splitWords(text: string): string[] {
  return text
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

interface Token {
  /** Folded form used for matching. */
  f: string;
  /** Original spelling, used in messages. */
  d: string;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const d of splitWords(text)) {
    const f = foldWord(d);
    if (f) out.push({ f, d });
  }
  return out;
}

/** Light suffix stemmer; applied to both input and vocabulary, so it only needs to be consistent. */
function stem(word: string, lang: string): string {
  if (lang === "de") {
    for (const suffix of ["en", "em", "er", "es", "e", "n", "s"]) {
      if (word.length - suffix.length >= 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
    }
    return word;
  }
  if (word.length >= 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// ---------------------------------------------------------------------------
// Tables (built once per pack)
// ---------------------------------------------------------------------------

interface Vocab {
  /** Stemmed content words of the name. */
  name: string[];
  /** Stemmed content words of each synonym. */
  syns: string[][];
  words: Set<string>;
}

interface Tables {
  m: Messages;
  lang: string;
  verbs: Map<string, string>;
  particleVerbs: Map<string, Map<string, string>>;
  maxVerbWords: number;
  stop: Set<string>;
  split: Set<string>;
  source: Set<string>;
  lead: Set<string>;
  particles: Set<string>;
  meta: Map<string, MetaCommand>;
  directions: Map<string, string>;
  objects: Map<string, Vocab>;
}

/** Prepositions that may open an object phrase and are dropped when it does not match otherwise. */
const LEADING_PREPS = [
  "mit",
  "an",
  "auf",
  "in",
  "im",
  "ins",
  "unter",
  "hinter",
  "neben",
  "durch",
  "über",
  "zu",
  "zum",
  "zur",
  "with",
  "to",
  "on",
  "in",
  "into",
  "inside",
  "under",
  "behind",
  "through",
  "at",
  "about",
];

const cache = new WeakMap<Pack, Tables>();

function tablesFor(pack: Pack): Tables {
  let t = cache.get(pack);
  if (!t) {
    t = buildTables(pack);
    cache.set(pack, t);
  }
  return t;
}

function buildTables(pack: Pack): Tables {
  const ix = indexPack(pack);
  const m = messagesFor(pack.language);
  const lang = m.lang;
  const voc = m.vocab;
  const verbs = new Map<string, string>();
  const particleVerbs = new Map<string, Map<string, string>>();
  let maxVerbWords = 1;
  const addVerb = (phrase: string, verb: string, particle?: string) => {
    const p = fold(phrase);
    if (!p) return;
    maxVerbWords = Math.max(maxVerbWords, p.split(" ").length);
    if (particle === undefined) verbs.set(p, verb);
    else {
      const byParticle = particleVerbs.get(p) ?? new Map<string, string>();
      byParticle.set(fold(particle), verb);
      particleVerbs.set(p, byParticle);
    }
  };

  // Core vocabulary first; pack labels and synonyms override identical phrases.
  for (const [phrase, verb, particle] of voc.verbs) addVerb(phrase, verb, particle);
  if (!pack.verbs.read) for (const w of voc.readWords) addVerb(w, "look");
  for (const [id, label] of Object.entries(m.verbLabels)) {
    if (id !== "choose" && !verbs.has(fold(label))) addVerb(label, id);
  }
  for (const [id, def] of Object.entries(pack.verbs)) {
    if (id === "choose") continue;
    // German infinitive labels also yield the imperative forms ("Kombinieren" → "kombiniere", "kombinier").
    const label = fold(def.label);
    if (lang === "de" && /^[a-z]{4,}en$/.test(label)) {
      addVerb(label.slice(0, -1), id);
      addVerb(label.slice(0, -2), id);
    }
    addVerb(def.label, id);
    for (const s of def.synonyms ?? []) addVerb(s, id);
  }

  const stop = new Set(voc.stopwords.map(fold));
  const directions = new Map<string, string>();
  for (const cat of allCatalogs()) {
    for (const [exitId, words] of Object.entries(cat.vocab.directions)) {
      for (const w of words) {
        const f = fold(w);
        if (!directions.has(f)) directions.set(f, exitId);
      }
    }
  }
  // The pack language wins conflicts between languages.
  for (const [exitId, words] of Object.entries(voc.directions)) for (const w of words) directions.set(fold(w), exitId);

  const meta = new Map<string, MetaCommand>();
  for (const cat of [messagesFor("en"), m]) {
    for (const [cmd, words] of Object.entries(cat.vocab.meta)) {
      for (const w of words) meta.set(fold(w), cmd as MetaCommand);
    }
  }

  const t: Tables = {
    m,
    lang,
    verbs,
    particleVerbs,
    maxVerbWords,
    stop,
    split: new Set(voc.splitPreps.map(fold)),
    source: new Set(voc.sourcePreps.map(fold)),
    lead: new Set(LEADING_PREPS.map(fold)),
    particles: new Set(voc.particles.map(fold)),
    meta,
    directions,
    objects: new Map(),
  };
  for (const id of ix.objectIds) {
    const def = pack.objects[id];
    if (def) t.objects.set(id, makeVocab(t, def.name, def.synonyms ?? []));
  }
  return t;
}

function contentWords(t: Tables, phrase: string): string[] {
  return fold(phrase)
    .split(" ")
    .filter((w) => w && !t.stop.has(w))
    .map((w) => stem(w, t.lang));
}

function makeVocab(t: Tables, name: string, synonyms: readonly string[]): Vocab {
  const nameWords = contentWords(t, name);
  const syns = synonyms.map((s) => contentWords(t, s)).filter((s) => s.length > 0);
  const words = new Set<string>(nameWords);
  for (const s of syns) for (const w of s) words.add(w);
  return { name: nameWords, syns, words };
}

/**
 * 0 when some input word is not part of the vocabulary. Otherwise 10 per
 * exact word, 6 per word that ends a longer vocabulary word (German
 * compounds: "schluessel" in "messingschluessel"), +5 when the input is
 * exactly the name, +3 when it is exactly a synonym.
 */
function score(v: Vocab, words: readonly string[]): number {
  if (words.length === 0) return 0;
  let s = 0;
  for (const w of words) {
    if (v.words.has(w)) s += 10;
    else if (w.length >= 4 && [...v.words].some((x) => x.length > w.length && x.endsWith(w))) s += 6;
    else return 0;
  }
  if (sameWords(words, v.name)) s += 5;
  else if (v.syns.some((syn) => sameWords(words, syn))) s += 3;
  return s;
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ParseError = Extract<ParseResult, { ok: false }>;
type ErrorKind = ParseError["error"];

interface PCtx {
  pack: Pack;
  state: GameState;
  t: Tables;
  present: string[];
}

type ObjRes = { ok: true; id: string; score: number } | ParseError;
type ArgRes = { ok: true; id: string | undefined; score: number } | ParseError;

function fail(error: ErrorKind, message: string, candidates?: Array<{ id: string; name: string }>): ParseError {
  return candidates ? { ok: false, error, message, candidates } : { ok: false, error, message };
}

/** Parse free text input in the pack's language into a Command (or a meta command). */
export function parseCommand(pack: Pack, state: GameState, input: string): ParseResult {
  const t = tablesFor(pack);
  const m = t.m;
  const raw = input.trim();
  if (raw === "?") return { ok: true, meta: "help" };
  const tokens = tokenize(raw);
  if (tokens.length === 0) return fail("empty", m.parse.empty);
  const meta = t.meta.get(tokens.map((x) => x.f).join(" "));
  if (meta) return { ok: true, meta };

  const ix = indexPack(pack);
  const present = presentObjects(pack, state, ix.objectIds);
  const pc: PCtx = { pack, state, t, present: [...present.room, ...present.inv] };
  if (state.dialogue) return parseChoice(pc, tokens);

  const bare = exactExit(pc, tokens);
  if (bare) return command({ verb: "go", object: bare });

  const vm = matchVerb(t, tokens);
  if (!vm) return fail("unknown-verb", fill(m.parse.unknownVerb, { word: tokens[0]?.d ?? "" }));
  return parseArgs(pc, vm.verb, vm.rest);
}

function command(cmd: Command): ParseResult {
  return { ok: true, command: cmd };
}

function matchVerb(t: Tables, tokens: Token[]): { verb: string; rest: Token[] } | null {
  for (let len = Math.min(t.maxVerbWords, tokens.length); len >= 1; len--) {
    const phrase = tokens
      .slice(0, len)
      .map((x) => x.f)
      .join(" ");
    const byParticle = t.particleVerbs.get(phrase);
    if (byParticle) {
      const last = tokens[tokens.length - 1];
      const next = tokens[len];
      if (tokens.length > len && last && byParticle.has(last.f)) {
        return { verb: byParticle.get(last.f) as string, rest: tokens.slice(len, -1) };
      }
      if (next && byParticle.has(next.f)) {
        return { verb: byParticle.get(next.f) as string, rest: tokens.slice(len + 1) };
      }
    }
    const verb = t.verbs.get(phrase);
    if (verb !== undefined) return { verb, rest: tokens.slice(len) };
  }
  return null;
}

function parseArgs(pc: PCtx, verb: string, rest: Token[]): ParseResult {
  const { t, pack } = pc;
  const m = t.m;
  const ix = indexPack(pack);
  const label = (v: string) => ix.verbs.get(v)?.label ?? v;

  switch (verb) {
    case "wait":
    case "inventory":
      return command({ verb });
    case "look": {
      const r = objectArg(pc, rest, label("look"), true);
      if (!r.ok) return r;
      return command(r.id === undefined ? { verb } : { verb, object: r.id });
    }
    case "go": {
      if (content(t, rest).length === 0) return fail("incomplete", m.parse.incompleteWhere);
      const exit = lenientExit(pc, rest);
      if (exit === null) return fail("unknown-object", m.parse.unknownDirection);
      return typeof exit === "string" ? command({ verb, object: exit }) : exit;
    }
    case "open": {
      // "open door with key" means "use key with door", like "unlock door with key".
      const withPrep = fold(m.preps.use);
      for (let i = 1; i < rest.length - 1; i++) {
        if (rest[i]?.f !== withPrep) continue;
        const a = objectArg(pc, rest.slice(0, i), label("open"), false);
        const b = objectArg(pc, rest.slice(i + 1), label("open"), false);
        if (a.ok && b.ok && a.id !== undefined && b.id !== undefined) {
          return command({ verb: "use", object: b.id, with: a.id });
        }
      }
      break;
    }
    case "@unlock": {
      const r = twoArgs(pc, rest, { preps: [fold(m.preps.use)], allowSingle: true, verbLabel: label("open") });
      if (!r.ok) return r;
      // "schließ Tür mit Schlüssel auf" → use key with door; a single object → open it.
      return command(r.b === undefined ? { verb: "open", object: r.a } : { verb: "use", object: r.b, with: r.a });
    }
    case "talk": {
      const r = objectArg(pc, rest, label("talk"), false);
      if (r.ok) return command({ verb, object: r.id as string });
      // "frag Wirt nach Foto": fall back to the longest leading phrase naming a character.
      const words = content(t, rest);
      for (let len = words.length - 1; len >= 1; len--) {
        const p = resolveObject(pc, words.slice(0, len));
        if (p.ok && pack.objects[p.id]?.npc) return command({ verb, object: p.id });
      }
      return r;
    }
  }

  const info = ix.verbs.get(verb);
  if (!info) return fail("unknown-verb", fill(m.parse.unknownVerb, { word: verb }));
  if (info.max === 2) {
    const isGiveShow = verb === "give" || verb === "show";
    const r = twoArgs(pc, rest, {
      preps: info.prep !== undefined ? [fold(info.prep)] : [],
      allowSingle: info.min === 1,
      verbLabel: info.label,
      whom: isGiveShow,
    });
    if (!r.ok) return r;
    if (r.b === undefined) return command({ verb, object: r.a });
    let [a, b] = [r.a, r.b];
    if (isGiveShow && pack.objects[a]?.npc && !pack.objects[b]?.npc) [a, b] = [b, a];
    return command({ verb, object: a, with: b });
  }
  const r = objectArg(pc, rest, info.label, info.min === 0);
  if (!r.ok) return r;
  return command(r.id === undefined ? { verb } : { verb, object: r.id });
}

/** Folded tokens without stopwords. */
function content(t: Tables, tokens: readonly Token[]): Token[] {
  return tokens.filter((x) => !t.stop.has(x.f));
}

const RANK: Record<ErrorKind, number> = {
  ambiguous: 5,
  "not-here": 4,
  incomplete: 3,
  "unknown-object": 2,
  "unknown-verb": 1,
  empty: 0,
};

/** The more informative error; on a tie the later one (it comes from a more reduced phrase). */
function better(a: ParseError | null, b: ParseError): ParseError {
  return a === null || RANK[b.error] >= RANK[a.error] ? b : a;
}

/**
 * One object phrase. Tries the phrase as is, then without a trailing
 * separable particle ("heb Lampe auf"), then without a leading preposition
 * ("schau in Kiste").
 */
function objectArg(pc: PCtx, raw: Token[], verbLabel: string, optional: boolean): ArgRes {
  const { t } = pc;
  const variants: Token[][] = [];
  const base = content(t, raw);
  variants.push(base);
  const last = raw[raw.length - 1];
  const noParticle = last && raw.length > 0 && t.particles.has(last.f) ? content(t, raw.slice(0, -1)) : null;
  if (noParticle) variants.push(noParticle);
  for (const v of [base, noParticle]) {
    const first = v?.[0];
    if (v && first && t.lead.has(first.f)) variants.push(v.slice(1));
  }
  // "take letter from desk": the object phrase ends at the source preposition.
  for (const v of [...variants]) {
    const cut = v.findIndex((x, i) => i > 0 && t.source.has(x.f));
    if (cut > 0) variants.push(v.slice(0, cut));
  }
  let err: ParseError | null = null;
  for (const v of variants) {
    if (v.length === 0) {
      if (optional) return { ok: true, id: undefined, score: 0 };
      err = better(err, fail("incomplete", fill(t.m.parse.incomplete, { verb: verbLabel })));
      continue;
    }
    const r = resolveObject(pc, v);
    if (r.ok) return r;
    err = better(err, r);
  }
  return err ?? fail("incomplete", fill(t.m.parse.incomplete, { verb: verbLabel }));
}

/** Best present object for the words; ambiguous on ties; not-here when only absent objects match. */
function resolveObject(pc: PCtx, words: readonly Token[]): ObjRes {
  const { t, pack } = pc;
  const m = t.m;
  const stems = words.map((x) => stem(x.f, t.lang));
  let best = 0;
  let ids: string[] = [];
  for (const id of pc.present) {
    const v = t.objects.get(id);
    const s = v ? score(v, stems) : 0;
    if (s === 0 || s < best) continue;
    if (s > best) {
      best = s;
      ids = [id];
    } else ids.push(id);
  }
  const only = ids[0];
  if (ids.length === 1 && only !== undefined) return { ok: true, id: only, score: best };
  if (ids.length > 1) {
    const names = ids.map((id) => pack.objects[id]?.name ?? id);
    const list =
      names.length > 1 ? `${names.slice(0, -1).join(", ")} ${m.parse.or} ${names[names.length - 1]}` : names.join("");
    return fail(
      "ambiguous",
      fill(m.parse.ambiguous, { list }),
      ids.map((id) => ({ id, name: pack.objects[id]?.name ?? id })),
    );
  }
  for (const [id, v] of t.objects) {
    if (!pc.present.includes(id) && score(v, stems) > 0) return fail("not-here", m.parse.notHere);
  }
  return fail("unknown-object", fill(m.parse.unknownObject, { words: words.map((x) => x.d).join(" ") }));
}

interface TwoOpts {
  /** The verb's own preposition(s), tried first. */
  preps: string[];
  /** Whether a single object is a complete command (use). */
  allowSingle: boolean;
  verbLabel: string;
  /** Ask "to whom?" instead of "with what?" when the second object is missing. */
  whom?: boolean;
}

type TwoRes = { ok: true; a: string; b: string | undefined } | ParseError;

function twoArgs(pc: PCtx, raw: Token[], opts: TwoOpts): TwoRes {
  const { t } = pc;
  const m = t.m;
  if (content(t, raw).length === 0) return fail("incomplete", fill(m.parse.incomplete, { verb: opts.verbLabel }));

  // 1. Split on a preposition: the verb's own first, then any known one.
  const splits: number[] = [];
  for (const own of [true, false]) {
    for (let i = 1; i < raw.length - 1; i++) {
      const w = raw[i]?.f ?? "";
      const match = own ? opts.preps.includes(w) : t.split.has(w);
      if (match && !splits.includes(i)) splits.push(i);
    }
  }
  let err: ParseError | null = null;
  for (const i of splits) {
    const left = objectArg(pc, raw.slice(0, i), opts.verbLabel, false);
    const right = objectArg(pc, raw.slice(i + 1), opts.verbLabel, false);
    if (left.ok && right.ok && left.id !== undefined && right.id !== undefined) {
      return { ok: true, a: left.id, b: right.id };
    }
    if (err === null) err = !left.ok ? left : !right.ok ? right : null;
  }

  // 2. The whole phrase as one object.
  const single = objectArg(pc, raw, opts.verbLabel, false);
  if (single.ok && single.id !== undefined) {
    if (opts.allowSingle) return { ok: true, a: single.id, b: undefined };
    return fail("incomplete", opts.whom ? m.parse.incompleteWhom : m.parse.incompleteWith);
  }

  // 3. Greedy segmentation into two objects ("zeig Wirt Foto"), best total score.
  const words = content(t, raw);
  let best: { a: string; b: string; score: number } | null = null;
  // When one half names a present object, the other half's error is the informative one
  // ("show graves the letter" with no letter here: not-here, not "unknown 'graves letter'").
  let halfErr: ParseError | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = resolveObject(pc, words.slice(0, i));
    const b = resolveObject(pc, words.slice(i));
    if (a.ok && b.ok && (best === null || a.score + b.score > best.score)) {
      best = { a: a.id, b: b.id, score: a.score + b.score };
    }
    if (a.ok && !b.ok) halfErr = better(halfErr, b);
    if (!a.ok && b.ok) halfErr = better(halfErr, a);
  }
  if (best) return { ok: true, a: best.a, b: best.b };
  return err ?? halfErr ?? (single.ok ? fail("incomplete", m.parse.incompleteWith) : single);
}

// ---------------------------------------------------------------------------
// Exits
// ---------------------------------------------------------------------------

/** A bare direction word or an exact exit label/synonym of the current room. */
function exactExit(pc: PCtx, tokens: readonly Token[]): string | null {
  const words = content(pc.t, tokens).map((x) => x.f);
  if (words.length === 0) return null;
  const phrase = words.join(" ");
  const dir = pc.t.directions.get(phrase);
  if (dir !== undefined) return dir;
  for (const { id, exit } of listedExits(pc.pack, pc.state)) {
    const phrases = [exit.label, ...(exit.synonyms ?? [])].filter((p): p is string => p !== undefined).map(fold);
    if (phrases.includes(phrase)) return id;
  }
  return null;
}

/**
 * Direction after a "go" verb: exact matches, then exit labels, synonyms,
 * ids and destination room names by word score, then a door object ("geh
 * durch die Tür"). Destination names are accepted for every listed exit, not
 * only visited ones: the exit is usable anyway, and room descriptions name
 * their neighbours ("The library lies to the west"). Naming the current room
 * gives "already there" rather than a door's exit ("enter study" in the study).
 */
function lenientExit(pc: PCtx, tokens: Token[]): string | ParseError | null {
  const { t, pack, state } = pc;
  const variants = [tokens];
  const first = content(t, tokens)[0];
  if (first && t.lead.has(first.f)) variants.push(content(t, tokens).slice(1));
  for (const v of variants) {
    const exact = exactExit(pc, v);
    if (exact) return exact;
  }
  const exits = listedExits(pack, state);
  const current = pack.rooms[state.room];
  for (const v of variants) {
    const stems = content(t, v).map((x) => stem(x.f, t.lang));
    let best = 0;
    let ids: string[] = [];
    for (const { id, exit } of exits) {
      const names = [exit.label ?? "", id.replace(/_/g, " ")];
      const dest = pack.rooms[exit.to];
      if (dest) names.push(dest.name);
      const vocab = makeVocab(t, names.join(" "), [...(exit.synonyms ?? []), ...names]);
      const s = score(vocab, stems);
      if (s > best) {
        best = s;
        ids = [id];
      } else if (s > 0 && s === best) ids.push(id);
    }
    // Several exits to the same room (a compass exit and a labelled one): any of them will do.
    const targets = new Set(ids.map((id) => exits.find((e) => e.id === id)?.exit.to));
    if (ids.length >= 1 && targets.size === 1 && ids[0] !== undefined) return ids[0];
    if (current && stems.length > 0 && score(makeVocab(t, current.name, []), stems) > 0) {
      return fail("unknown-object", t.m.parse.alreadyHere);
    }
    const door = content(t, v).length > 0 ? resolveObject(pc, content(t, v)) : null;
    if (door?.ok) {
      const viaDoor = exits.find((e) => e.exit.door === door.id);
      if (viaDoor) return viaDoor.id;
    }
  }
  // "geh die Kellertreppe hinunter", "go down the stairs": an exit name plus a direction word.
  // The named exit wins; otherwise the direction (the runtime rejects it if it is not listed).
  const words = content(t, tokens);
  const edges: Array<[Token | undefined, Token[]]> = [
    [words[words.length - 1], words.slice(0, -1)],
    [words[0], words.slice(1)],
  ];
  for (const [edge, others] of edges) {
    const dir = edge ? t.directions.get(edge.f) : undefined;
    if (dir === undefined || others.length === 0) continue;
    const named = lenientExit(pc, others);
    return typeof named === "string" ? named : dir;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

function parseChoice(pc: PCtx, tokens: Token[]): ParseResult {
  const { t, pack, state } = pc;
  const m = t.m;
  const active = state.dialogue;
  if (!active) return fail("unknown-verb", m.parse.empty);
  const options = availableOptions(pack, state, active.id, pack.dialogues[active.id]?.nodes[active.node]);
  const chooseMsg = fill(m.parse.chooseOption, { n: options.length });
  const only = tokens[0];
  if (tokens.length === 1 && only && /^\d+$/.test(only.f)) {
    const o = options[Number(only.f) - 1];
    return o ? command({ verb: "choose", object: o.id }) : fail("unknown-object", chooseMsg);
  }
  const words = content(t, tokens).map((x) => stem(x.f, t.lang));
  let best = 0;
  let ids: Array<{ id: string; name: string }> = [];
  for (const o of options) {
    const optionWords = new Set(contentWords(t, o.text));
    const s = words.filter((w) => optionWords.has(w)).length;
    if (s === 0 || s < best) continue;
    if (s > best) {
      best = s;
      ids = [{ id: o.id, name: o.text }];
    } else ids.push({ id: o.id, name: o.text });
  }
  const pick = ids[0];
  if (ids.length === 1 && pick) return command({ verb: "choose", object: pick.id });
  if (ids.length > 1) {
    const list = ids.map((x, i) => `${options.findIndex((o) => o.id === x.id) + 1 || i + 1}. ${x.name}`).join(" / ");
    return fail("ambiguous", fill(m.parse.ambiguous, { list }), ids);
  }
  return fail("unknown-object", chooseMsg);
}
