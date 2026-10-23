/**
 * Breadth-first exploration of the logical state space (spec section 14,
 * step 4): winnability, dead ends, losing endings and unreached content.
 *
 * Two kinds of players are checked on one state graph:
 * - Tap players can only use offered actions (action sheets, exits, dialogue
 *   options; see offeredPredicate). Winnability, the shortest win and dead
 *   ends are judged by offered actions, as the spec requires: a solution
 *   that needs a typed command ("push statue" while the statue's sheet has
 *   no push) is not a solution for a tap-first player.
 * - Parser players can type any accepted command. States reachable only that
 *   way must not be dead ends either, and no losing ending may be reachable
 *   at all.
 * Every edge of the graph is labelled "offered" or "typed only".
 *
 * Candidate commands per state are chosen to keep the branching factor low
 * while staying sound, i.e. every state reachable by any accepted command is
 * reached:
 * - in a dialogue: every available option;
 * - every listed exit;
 * - commands a live command rule could match (spent `once` rules and rules
 *   whose `when` is false are skipped). Rules that only print text cannot
 *   change the state, so they are tried only until they fired once through an
 *   offered command (for the coverage report), a catch-all of that kind with
 *   a single representative;
 * - default behaviours that can change the state: take, open/close, talk to
 *   an object with a dialogue, use key with lock, and drop with `includeDrop`;
 * - when `turn` rules exist, one neutral command (wait) standing for every
 *   command that changes nothing by itself. It counts as offered: looking at
 *   anything passes a turn just the same.
 *
 * States are deduplicated by a compact key over the logical state without
 * `turn`, without `score` (no condition can observe the score) and without
 * flags, counters, visited rooms and `once` marks that cannot change the
 * course of the game (see relevance.ts). Only the frontier keeps full states; the graph is kept as
 * parent pointers and a compact edge list for the reachability analyses.
 */
import { listedExits, offeredPredicate } from "./affordances.ts";
import { formatCommand } from "./commands.ts";
import { evalConditions } from "./conditions.ts";
import type { Trace } from "./context.ts";
import { activeOptions, optionKey } from "./effects.ts";
import { indexPack, type PackIndex } from "./pack-index.ts";
import { presentObjects } from "./presence.ts";
import { coverageCheck, type Relevance, relevantState } from "./relevance.ts";
import { newGameWith, stepWith } from "./runtime.ts";
import { type Effect, INVENTORY, NOWHERE, type Pack } from "./schema.ts";
import type { Command, Diagnostic, ExploreOptions, ExploreReport, GameState } from "./types.ts";

const DEFAULT_MAX_STATES = 200_000;
const MAX_DEAD_ENDS = 10;

/** The state graph: nodes are states, edges carry the command id and the offered bit. */
interface Graph {
  n: number;
  /** Edges of node k are edgeStart[k] .. edgeStart[k + 1] - 1. */
  edgeStart: number[];
  edgeTo: number[];
  /** commandId * 2 + (offered ? 1 : 0). */
  edgeInfo: number[];
  commands: string[];
}

/** Breadth-first search over the logical state space to verify winnability and the forgiving policy. */
export function explore(pack: Pack, options: ExploreOptions = {}): ExploreReport {
  return exploreWith(pack, options, true);
}

/** explore with the state reduction of relevance.ts switchable (tests compare both). */
export function exploreWith(pack: Pack, options: ExploreOptions, reduce: boolean): ExploreReport {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const ix = indexPack(pack);

  const firedRules = new Uint8Array(pack.rules.length);
  // Rules that fired during an offered command (pure rules are retried until they did).
  const firedOffered = new Uint8Array(pack.rules.length);
  let stepOffered = true;
  const chosenOptions = new Set<string>();
  const enteredRooms = new Set<string>();
  const trace: Trace = {
    rule: (i) => {
      firedRules[i] = 1;
      if (stepOffered) firedOffered[i] = 1;
    },
    option: (key) => chosenOptions.add(key),
    room: (id) => enteredRooms.add(id),
  };
  const run = { quiet: true, trace };
  const rel = reduce ? relevantState(pack, ix) : everything(pack, ix);
  const keyOf = makeKeyFn(pack, ix, rel);
  // Rules and options gated by state the key leaves out may never fire in the representative states
  // the search keeps, although they can in play: their absence proves nothing, so they are not reported.
  const conclusive = coverageCheck(pack, ix, rel);
  const candidates = makeCandidateGenerator(pack, ix, options.includeDrop === true, firedRules, firedOffered);

  const start = newGameWith(pack, run).state;
  const keys = new Map<string, number>([[keyOf(start), 0]]);
  const frontier: Array<GameState | undefined> = [start];
  // Breadth-first tree over all edges: shortest paths for parser players.
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const roomOf: string[] = [start.room];
  const endedOf: Array<string | null> = [start.ended];
  const g: Graph = { n: 0, edgeStart: [], edgeTo: [], edgeInfo: [], commands: [] };
  const commandIds = new Map<string, number>();
  const commandId = (text: string): number => {
    let cid = commandIds.get(text);
    if (cid === undefined) {
      cid = g.commands.length;
      g.commands.push(text);
      commandIds.set(text, cid);
    }
    return cid;
  };
  let complete = true;

  bfs: for (let i = 0; i < frontier.length; i++) {
    const state = frontier[i] as GameState;
    frontier[i] = undefined;
    g.edgeStart[i] = g.edgeTo.length;
    if (state.ended !== null) continue;
    for (const { cmd, text, offered } of candidates(state)) {
      stepOffered = offered;
      const result = stepWith(pack, state, cmd, run);
      if (result.status === "rejected") continue;
      const next = result.state;
      const key = keyOf(next);
      let j = keys.get(key);
      const cid = commandId(text);
      if (j === undefined) {
        if (frontier.length >= maxStates) {
          complete = false;
          break bfs;
        }
        j = frontier.length;
        keys.set(key, j);
        frontier.push(next);
        parent.push(i);
        via.push(cid);
        roomOf.push(next.room);
        endedOf.push(next.ended);
      }
      if (j !== i) {
        g.edgeTo.push(j);
        g.edgeInfo.push(cid * 2 + (offered ? 1 : 0));
      }
    }
  }
  stepOffered = true;
  const n = parent.length;
  g.n = n;
  g.edgeStart.length = n;
  for (let k = 0; k <= n; k++) g.edgeStart[k] ??= g.edgeTo.length;

  const isWinNode = (k: number) => isWin(pack, endedOf[k] ?? null);
  const anyPath = (node: number): string[] => {
    const path: string[] = [];
    for (let k = node; k > 0; k = parent[k] ?? 0) path.push(g.commands[via[k] ?? 0] ?? "");
    return path.reverse();
  };
  // Shortest offered paths from the start: what a tap player can reach.
  const tap = shortestPaths(g, [0], true);
  const tapPath = (node: number) => tap.path(node).map((e) => g.commands[e >> 1] ?? "");
  let tapWin = -1;
  for (const k of tap.order) {
    if (isWinNode(k)) {
      tapWin = k;
      break;
    }
  }
  let anyWin = -1;
  for (let k = 0; k < n && anyWin < 0; k++) if (isWinNode(k)) anyWin = k;

  const diagnostics: Diagnostic[] = [];
  const winnable = tapWin >= 0;
  const losingEndings: ExploreReport["losingEndings"] = [];
  const endingsReached = new Set<string>();
  for (let k = 0; k < n; k++) {
    const e = endedOf[k];
    if (e === null || e === undefined || endingsReached.has(e)) continue;
    endingsReached.add(e);
    if (!isWin(pack, e)) {
      const path = anyPath(k);
      losingEndings.push({ ending: e, path });
      diagnostics.push({
        severity: "error",
        code: "explore.losing-ending",
        path: `endings.${e}`,
        message:
          `Losing ending '${e}' is reachable via: ${formatPath(path)}. ` +
          "The 'forgiving' policy allows only winning endings: set win: true or remove the way to this ending.",
      });
    }
  }

  const deadEnds: ExploreReport["deadEnds"] = [];
  if (!complete) {
    diagnostics.push({
      severity: "warning",
      code: "explore.incomplete",
      path: "",
      message:
        `Exploration stopped at ${maxStates} states, so the result is incomplete (dead ends were not checked). ` +
        "Bound every counter changed by turn rules with a when condition and avoid independent state that never matters.",
    });
  } else if (anyWin < 0) {
    diagnostics.push({
      severity: "error",
      code: "explore.not-winnable",
      path: "endings",
      message:
        `No winning ending is reachable from the start (${n} states explored). ` +
        "Check the walkthrough and the conditions on the way to the winning ending.",
    });
  } else {
    const canWinTap = reverseReach(g, true, isWinNode);
    const canWinAny = reverseReach(g, false, isWinNode);
    if (!winnable) {
      diagnostics.push({
        severity: "error",
        code: "explore.not-winnable",
        path: "endings",
        message:
          "A winning ending is reachable only with typed commands that no action sheet offers, so tap players " +
          `cannot finish the game. Typed-only commands on the shortest win: ${typedOnly(g, [0], isWinNode)}. ` +
          offerAdvice,
      });
    }
    // Tap dead ends: reachable with offered actions, no offered way to a win. Report the first state
    // after the fatal command (its predecessor could still win).
    const entries: Array<{ node: number; tap: boolean }> = [];
    let tapTotal = 0;
    if (winnable) {
      for (const k of tap.order) {
        if (endedOf[k] !== null || canWinTap[k]) continue;
        tapTotal++;
        const p = tap.parentOf(k);
        if ((p < 0 || canWinTap[p]) && entries.length < MAX_DEAD_ENDS) entries.push({ node: k, tap: true });
      }
    }
    // Dead ends for parser players: no way to a win at all, reachable only through typed commands.
    let typedTotal = 0;
    for (let k = 0; k < n; k++) {
      if (endedOf[k] !== null || canWinAny[k] || tap.reached(k)) continue;
      typedTotal++;
      const p = parent[k] ?? -1;
      if ((p < 0 || canWinAny[p]) && entries.length < MAX_DEAD_ENDS) entries.push({ node: k, tap: false });
    }
    for (const { node: k, tap: byTap } of entries) {
      const path = byTap ? tapPath(k) : anyPath(k);
      deadEnds.push({ path });
      const total = `${tapTotal + typedTotal} dead-end state(s) in total`;
      let message: string;
      if (!byTap) {
        message =
          `Dead end: after ${formatPath(path)} (typed commands) no winning ending can be reached any more ` +
          `(last room: ${roomOf[k]}; ${total}). ${deadEndAdvice}`;
      } else if (canWinAny[k]) {
        message =
          `Dead end for tap players: after ${formatPath(path)} only typed commands that no action sheet offers ` +
          `can still win (${typedOnly(g, [k], isWinNode)}; last room: ${roomOf[k]}; ${total}). ${offerAdvice}`;
      } else {
        message =
          `Dead end: after ${formatPath(path)} no winning ending can be reached any more ` +
          `(last room: ${roomOf[k]}; ${total}). ${deadEndAdvice}`;
      }
      diagnostics.push({ severity: "error", code: "explore.dead-end", path: `rooms.${roomOf[k]}`, message });
    }
  }

  const unreached = {
    rooms: ix.roomIds.filter((id) => !enteredRooms.has(id)),
    endings: Object.keys(pack.endings).filter((id) => !endingsReached.has(id)),
    rules: ix.allRules.filter((r) => firedRules[r.index] !== 1 && conclusive.rule(r)).map((r) => r.label),
    options: [] as string[],
  };
  const optionPaths = new Map<string, string>();
  for (const [dId, d] of Object.entries(pack.dialogues)) {
    for (const [nodeId, node] of Object.entries(d.nodes)) {
      (node.options ?? []).forEach((o, j) => {
        const key = optionKey(dId, o.id);
        if (chosenOptions.has(key) || optionPaths.has(key) || !conclusive.option(o)) return;
        unreached.options.push(key);
        optionPaths.set(key, `dialogues.${dId}.nodes.${nodeId}.options[${j}]`);
      });
    }
  }
  if (complete) {
    for (const id of unreached.rooms) {
      diagnostics.push(info("explore.unreached-room", `rooms.${id}`, `Room '${id}' is never entered.`));
    }
    for (const id of unreached.endings) {
      diagnostics.push(info("explore.unreached-ending", `endings.${id}`, `Ending '${id}' is never reached.`));
    }
    for (const r of ix.allRules) {
      if (firedRules[r.index] === 1 || !conclusive.rule(r)) continue;
      diagnostics.push(
        info(
          "explore.unreached-rule",
          `rules[${r.index}]`,
          `Rule '${r.label}' never fires: its trigger never matches while its conditions hold ` +
            "(or an earlier rule always matches first).",
        ),
      );
    }
    for (const key of unreached.options) {
      diagnostics.push(
        info("explore.unreached-option", optionPaths.get(key) ?? key, `Dialogue option '${key}' is never available.`),
      );
    }
  }

  return {
    complete,
    states: n,
    winnable,
    shortestWin: winnable ? tapPath(tapWin) : null,
    deadEnds,
    losingEndings,
    unreached,
    diagnostics,
  };
}

const offerAdvice =
  "Offer these actions in the action sheets: list the verb in the object's `verbs` (e.g. verbs: [push]), " +
  "or change the rule to a verb the sheet already offers.";
const deadEndAdvice =
  "The 'forgiving' policy forbids dead ends: make the last action reversible, keep another way to the goal, " +
  "or prevent the action while it would block progress.";

function info(code: string, path: string, message: string): Diagnostic {
  return { severity: "info", code, path, message };
}

function isWin(pack: Pack, ending: string | null): boolean {
  return ending !== null && pack.endings[ending]?.win === true;
}

function formatPath(path: string[]): string {
  return path.length > 0 ? `"${path.join(" → ")}"` : "the start";
}

/** The typed-only commands on a shortest path (over all edges) from `from` to a target, quoted. */
function typedOnly(g: Graph, from: number[], isTarget: (node: number) => boolean): string {
  const bfs = shortestPaths(g, from, false, isTarget);
  const target = bfs.order.find(isTarget);
  if (target === undefined) return "none found";
  const typed = bfs
    .path(target)
    .filter((e) => (e & 1) === 0)
    .map((e) => `"${g.commands[e >> 1]}"`);
  return typed.length > 0 ? [...new Set(typed)].join(", ") : "none";
}

/**
 * Breadth-first search from `from` over all edges or offered edges only.
 * `path(k)` returns the edge infos (commandId * 2 + offered) from the source
 * to k; `stopAt` ends the search at the first node it accepts.
 */
function shortestPaths(g: Graph, from: number[], offeredOnly: boolean, stopAt?: (node: number) => boolean) {
  const parentOf = new Int32Array(g.n).fill(-2);
  const edgeOf = new Int32Array(g.n);
  const order: number[] = [];
  for (const s of from) {
    if (parentOf[s] !== -2) continue;
    parentOf[s] = -1;
    order.push(s);
  }
  for (let q = 0; q < order.length; q++) {
    const k = order[q] ?? 0;
    if (stopAt?.(k)) break;
    const end = g.edgeStart[k + 1] ?? 0;
    for (let e = g.edgeStart[k] ?? 0; e < end; e++) {
      const infoBits = g.edgeInfo[e] ?? 0;
      if (offeredOnly && (infoBits & 1) === 0) continue;
      const to = g.edgeTo[e] ?? 0;
      if (parentOf[to] !== -2) continue;
      parentOf[to] = k;
      edgeOf[to] = infoBits;
      order.push(to);
    }
  }
  return {
    order,
    reached: (k: number) => parentOf[k] !== -2,
    parentOf: (k: number) => parentOf[k] ?? -2,
    path: (k: number): number[] => {
      const out: number[] = [];
      for (let x = k; (parentOf[x] ?? -1) >= 0; x = parentOf[x] ?? -1) out.push(edgeOf[x] ?? 0);
      return out.reverse();
    },
  };
}

/** Nodes that can reach a target node, following (all or only offered) edges backwards. */
function reverseReach(g: Graph, offeredOnly: boolean, isTarget: (node: number) => boolean): Uint8Array {
  const { n, edgeStart, edgeTo, edgeInfo } = g;
  const use = (e: number) => !offeredOnly || ((edgeInfo[e] ?? 0) & 1) === 1;
  // Counting sort of the edges by target.
  const revStart = new Int32Array(n + 1);
  for (let e = 0; e < edgeTo.length; e++) {
    if (!use(e)) continue;
    const slot = (edgeTo[e] ?? 0) + 1;
    revStart[slot] = (revStart[slot] ?? 0) + 1;
  }
  for (let k = 0; k < n; k++) revStart[k + 1] = (revStart[k + 1] ?? 0) + (revStart[k] ?? 0);
  const fill = revStart.slice(0, n);
  const revFrom = new Int32Array(revStart[n] ?? 0);
  for (let from = 0; from < n; from++) {
    const end = edgeStart[from + 1] ?? 0;
    for (let e = edgeStart[from] ?? 0; e < end; e++) {
      if (!use(e)) continue;
      const to = edgeTo[e] ?? 0;
      revFrom[fill[to] ?? 0] = from;
      fill[to] = (fill[to] ?? 0) + 1;
    }
  }
  const reach = new Uint8Array(n);
  const queue: number[] = [];
  for (let k = 0; k < n; k++) {
    if (isTarget(k)) {
      reach[k] = 1;
      queue.push(k);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const to = queue[q] ?? 0;
    for (let e = revStart[to] ?? 0; e < (revStart[to + 1] ?? 0); e++) {
      const from = revFrom[e] ?? 0;
      if (reach[from]) continue;
      reach[from] = 1;
      queue.push(from);
    }
  }
  return reach;
}

// ---------------------------------------------------------------------------
// Candidate commands
// ---------------------------------------------------------------------------

interface Candidate {
  cmd: Command;
  /** Canonical string, also the deduplication key. */
  text: string;
  offered: boolean;
}

function makeCandidateGenerator(
  pack: Pack,
  ix: PackIndex,
  includeDrop: boolean,
  firedRules: Uint8Array,
  firedOffered: Uint8Array,
): (state: GameState) => Candidate[] {
  const hasTurnRules = ix.turnRules.length > 0;
  // A command that changes nothing by itself (no state-changing rule can match it): the turn rules are its only effect.
  const neutral = ["wait", "look"].find((verb) =>
    (ix.commandRules.get(verb) ?? []).every(
      (r) => r.pure || r.trigger.object !== undefined || r.trigger.with !== undefined,
    ),
  );
  const make = (verb: string, object?: string, withObj?: string): Command => {
    const cmd: Command = { verb };
    if (object !== undefined) cmd.object = object;
    if (withObj !== undefined) cmd.with = withObj;
    return cmd;
  };

  return (state) => {
    if (state.ended !== null) return [];
    if (state.dialogue) {
      return activeOptions(pack, state).map((o) => ({
        cmd: { verb: "choose", object: o.id },
        text: `choose ${o.id}`,
        offered: true,
      }));
    }

    const pres = presentObjects(pack, state, ix.objectIds);
    const isOffered = offeredPredicate(pack, ix, state, pres);
    const out: Candidate[] = [];
    const seen = new Set<string>();
    const add = (cmd: Command, offered = isOffered(cmd)) => {
      const text = formatCommand(cmd);
      if (seen.has(text)) return;
      seen.add(text);
      out.push({ cmd, text, offered });
    };

    for (const { id } of listedExits(pack, state)) add(make("go", id), true);

    const present = [...pres.room, ...pres.inv];
    const presentSet = new Set(present);
    const pick = (id: string | undefined) => (id === undefined ? present : presentSet.has(id) ? [id] : []);

    for (const [verb, rules] of ix.commandRules) {
      const info = ix.verbs.get(verb);
      if (!info || verb === "go" || verb === "choose") continue;
      for (const ref of rules) {
        // A text-only rule cannot change the state; it is tried until it fired through an offered command.
        if (ref.pure && firedOffered[ref.index] === 1) continue;
        if (ref.onceKey !== null && state.fired.includes(ref.onceKey)) continue;
        if (!evalConditions(pack, state, ref.rule.when)) continue;
        const t = ref.trigger;
        const matches: Command[] = [];
        if (t.object === undefined && t.with === undefined && info.min === 0) matches.push(make(verb));
        if (t.with === undefined && info.min <= 1 && info.max >= 1) {
          for (const o of pick(t.object)) matches.push(make(verb, o));
        }
        if (info.max === 2) {
          const orders: Array<[string | undefined, string | undefined]> = [[t.object, t.with]];
          if (verb === "use") orders.push([t.with, t.object]);
          for (const [a, b] of orders) {
            for (const x of pick(a)) for (const y of pick(b)) if (x !== y) matches.push(make(verb, x, y));
          }
        }
        if (!ref.pure) {
          for (const cmd of matches) add(cmd);
          continue;
        }
        // Pure rule: one representative suffices for coverage. Prefer an offered one; once the rule
        // fired through a typed-only command, only an offered one is still worth trying.
        const chosen = matches.find((cmd) => isOffered(cmd)) ?? (firedRules[ref.index] === 1 ? undefined : matches[0]);
        if (chosen) add(chosen);
      }
    }

    // Default behaviours that can change the state.
    for (const id of present) {
      const def = pack.objects[id];
      const os = state.objects[id];
      if (!def || !os) continue;
      if ((def.portable || def.clue) && os.location !== INVENTORY) add(make("take", id));
      if (def.openable) add(make(os.open ? "close" : "open", id));
      if (def.dialogue !== undefined) add(make("talk", id));
      if (def.unlockedBy !== undefined && os.locked && presentSet.has(def.unlockedBy)) {
        add(make("use", def.unlockedBy, id));
      }
    }
    if (includeDrop) for (const id of pres.inv) if (!pack.objects[id]?.clue) add(make("drop", id));
    if (hasTurnRules && neutral !== undefined) add(make(neutral), true);
    return out;
  };
}

// ---------------------------------------------------------------------------
// Compact state keys
// ---------------------------------------------------------------------------

/** Objects whose state can change at all: effect targets, portable, clues, openable, lockable by default. */
function mutableObjects(pack: Pack, ix: PackIndex): string[] {
  const ids = new Set<string>();
  const visit = (effects: readonly Effect[] | undefined): void => {
    for (const e of effects ?? []) {
      if ("move" in e) ids.add(e.move.object);
      else if ("open" in e) ids.add(e.open);
      else if ("close" in e) ids.add(e.close);
      else if ("lock" in e) ids.add(e.lock);
      else if ("unlock" in e) ids.add(e.unlock);
      else if ("reveal" in e) ids.add(e.reveal);
      else if ("hide" in e) ids.add(e.hide);
      else if ("learn" in e) ids.add(e.learn);
      else if ("if" in e) {
        visit(e.if.then);
        visit(e.if.else);
      }
    }
  };
  for (const r of pack.rules) visit(r.do);
  for (const d of Object.values(pack.dialogues)) {
    for (const node of Object.values(d.nodes)) {
      visit(node.do);
      for (const o of node.options ?? []) visit(o.do);
    }
  }
  for (const id of ix.objectIds) {
    const def = pack.objects[id];
    if (def && (def.portable || def.clue || def.openable || def.unlockedBy !== undefined)) ids.add(id);
  }
  return ix.objectIds.filter((id) => ids.has(id));
}

/** No reduction: every flag, counter, room, once rule and once option. */
function everything(pack: Pack, ix: PackIndex): Relevance {
  const chosen = new Set<string>();
  for (const [dId, d] of Object.entries(pack.dialogues)) {
    for (const node of Object.values(d.nodes))
      for (const o of node.options ?? []) if (o.once) chosen.add(optionKey(dId, o.id));
  }
  return {
    flags: new Set(Object.keys(pack.flags)),
    counters: new Set(Object.keys(pack.counters)),
    visited: new Set(ix.roomIds),
    fired: new Set(ix.allRules.flatMap((r) => (r.onceKey !== null ? [r.onceKey] : []))),
    chosen,
  };
}

const enc = (n: number): string => String.fromCharCode(48 + n);

/** Booleans packed 15 per character. */
function packBits(values: readonly boolean[]): string {
  let out = "";
  let acc = 0;
  let bit = 0;
  for (const v of values) {
    if (v) acc |= 1 << bit;
    if (++bit === 15) {
      out += enc(acc);
      acc = 0;
      bit = 0;
    }
  }
  return bit > 0 ? out + enc(acc) : out;
}

/** Membership bits of `list` over a universe of relevant ids; other members cannot matter and are left out. */
function memberBits(list: readonly string[], index: Map<string, number>, size: number): string {
  const values = new Array<boolean>(size).fill(false);
  for (const id of list) {
    const i = index.get(id);
    if (i !== undefined) values[i] = true;
  }
  return packBits(values);
}

function makeKeyFn(pack: Pack, ix: PackIndex, rel: Relevance): (s: GameState) => string {
  const locIndex = new Map<string, number>();
  for (const id of [...ix.roomIds, ...ix.objectIds, INVENTORY, NOWHERE]) {
    if (!locIndex.has(id)) locIndex.set(id, locIndex.size);
  }
  const mutable = mutableObjects(pack, ix);
  // Sorted, so states with undeclared flags (unvalidated packs) still get a stable key.
  const flagIds = [...rel.flags].sort();
  const counterIds = [...rel.counters].sort();
  const visitedRooms = ix.roomIds.filter((id) => rel.visited.has(id));
  const onceKeys = [...rel.fired].sort();
  const onceIndex = new Map(onceKeys.map((k, i) => [k, i]));
  const optionKeys = [...rel.chosen].sort();
  const optionIndex = new Map(optionKeys.map((k, i) => [k, i]));
  const loc = (id: string) => {
    const i = locIndex.get(id);
    return i === undefined ? `{${id}}` : enc(i);
  };

  return (s) => {
    let k = loc(s.room);
    for (const id of mutable) {
      const o = s.objects[id];
      k += o ? loc(o.location) + enc((o.open ? 1 : 0) | (o.locked ? 2 : 0) | (o.hidden ? 4 : 0)) : "?";
    }
    k += `|${packBits(flagIds.map((f) => s.flags[f] === true))}`;
    k += `|${counterIds.map((c) => s.counters[c] ?? 0).join(",")}`;
    // Only the rooms a condition asks about; the others cannot change the course of the game.
    k += `|${packBits(visitedRooms.map((id) => s.room === id || s.visited.includes(id)))}`;
    k += `|${memberBits(s.fired, onceIndex, onceKeys.length)}`;
    k += `|${memberBits(s.chosen, optionIndex, optionKeys.length)}`;
    k += `|${s.dialogue ? `${s.dialogue.id}.${s.dialogue.node}` : ""}|${s.ended ?? ""}`;
    return k;
  };
}
