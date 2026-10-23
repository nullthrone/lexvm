/**
 * Breadth-first exploration of the logical state space (spec section 14,
 * step 4): winnability, dead ends, losing endings and unreached content.
 *
 * Candidate commands per state are chosen to keep the branching factor low
 * while staying sound, i.e. every state reachable by any accepted command is
 * reached:
 * - in a dialogue: every available option;
 * - every listed exit;
 * - commands a live command rule could match (spent `once` rules and rules
 *   whose `when` is false are skipped). Rules that only print text cannot
 *   change the state, so they are tried only until they fired once (for the
 *   coverage report), a catch-all of that kind with a single representative;
 * - default behaviours that can change the state: take, open/close, talk to
 *   an npc with a dialogue, use key with lock, and drop with `includeDrop`;
 * - when `turn` rules exist, one neutral command (wait) standing for every
 *   command that changes nothing by itself.
 *
 * States are deduplicated by a compact key over the logical state without
 * `turn` and without `score` (no condition can observe the score). Only the
 * frontier keeps full states; the graph is kept as parent pointers and a
 * compact edge list for the reverse reachability analysis.
 */
import { listedExits } from "./affordances.ts";
import { formatCommand } from "./commands.ts";
import { evalConditions } from "./conditions.ts";
import type { Trace } from "./context.ts";
import { availableOptions, optionKey } from "./effects.ts";
import { indexPack, type PackIndex } from "./pack-index.ts";
import { presentObjects } from "./presence.ts";
import { newGameWith, stepWith } from "./runtime.ts";
import { type Effect, INVENTORY, NOWHERE, type Pack } from "./schema.ts";
import type { Command, Diagnostic, ExploreOptions, ExploreReport, GameState } from "./types.ts";

const DEFAULT_MAX_STATES = 200_000;
const MAX_DEAD_ENDS = 10;

/** Breadth-first search over the logical state space to verify winnability and the forgiving policy. */
export function explore(pack: Pack, options: ExploreOptions = {}): ExploreReport {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const ix = indexPack(pack);

  const firedRules = new Uint8Array(pack.rules.length);
  const chosenOptions = new Set<string>();
  const enteredRooms = new Set<string>();
  const trace: Trace = {
    rule: (i) => {
      firedRules[i] = 1;
    },
    option: (key) => chosenOptions.add(key),
    room: (id) => enteredRooms.add(id),
  };
  const run = { quiet: true, trace };
  const keyOf = makeKeyFn(pack, ix);
  const candidates = makeCandidateGenerator(pack, ix, options.includeDrop === true, firedRules);

  const start = newGameWith(pack, run).state;
  const keys = new Map<string, number>([[keyOf(start), 0]]);
  const frontier: Array<GameState | undefined> = [start];
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const roomOf: string[] = [start.room];
  const endedOf: Array<string | null> = [start.ended];
  const commandTable: string[] = [];
  const commandIds = new Map<string, number>();
  const edgeStart: number[] = [];
  const edgeTo: number[] = [];
  let complete = true;
  let firstWin = isWin(pack, start.ended) ? 0 : -1;

  bfs: for (let i = 0; i < frontier.length; i++) {
    const state = frontier[i] as GameState;
    frontier[i] = undefined;
    edgeStart[i] = edgeTo.length;
    if (state.ended !== null) continue;
    for (const cmd of candidates(state)) {
      const result = stepWith(pack, state, cmd, run);
      if (result.status === "rejected") continue;
      const next = result.state;
      const key = keyOf(next);
      let j = keys.get(key);
      if (j === undefined) {
        if (frontier.length >= maxStates) {
          complete = false;
          break bfs;
        }
        j = frontier.length;
        keys.set(key, j);
        frontier.push(next);
        parent.push(i);
        const text = formatCommand(cmd);
        let cid = commandIds.get(text);
        if (cid === undefined) {
          cid = commandTable.length;
          commandTable.push(text);
          commandIds.set(text, cid);
        }
        via.push(cid);
        roomOf.push(next.room);
        endedOf.push(next.ended);
        if (firstWin < 0 && isWin(pack, next.ended)) firstWin = j;
      }
      if (j !== i) edgeTo.push(j);
    }
  }
  const n = parent.length;
  edgeStart[n] = edgeTo.length;

  const pathTo = (node: number): string[] => {
    const path: string[] = [];
    for (let k = node; k > 0; k = parent[k] ?? 0) path.push(commandTable[via[k] ?? 0] ?? "");
    return path.reverse();
  };

  const diagnostics: Diagnostic[] = [];
  const winnable = firstWin >= 0;
  const losingEndings: ExploreReport["losingEndings"] = [];
  const endingsReached = new Set<string>();
  for (let k = 0; k < n; k++) {
    const e = endedOf[k];
    if (e === null || e === undefined || endingsReached.has(e)) continue;
    endingsReached.add(e);
    if (!isWin(pack, e)) {
      const path = pathTo(k);
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
  if (complete) {
    const canWin = reverseReach(n, edgeStart, edgeTo, (k) => isWin(pack, endedOf[k] ?? null));
    let total = 0;
    const entries: number[] = [];
    for (let k = 0; k < n; k++) {
      if (endedOf[k] !== null || canWin[k]) continue;
      total++;
      const p = parent[k] ?? -1;
      // Report the first state after the fatal command: its parent could still win.
      if ((p < 0 || canWin[p]) && entries.length < MAX_DEAD_ENDS) entries.push(k);
    }
    for (const k of entries) deadEnds.push({ path: pathTo(k) });
    if (!winnable) {
      diagnostics.push({
        severity: "error",
        code: "explore.not-winnable",
        path: "endings",
        message:
          `No winning ending is reachable from the start (${n} states explored). ` +
          "Check the walkthrough and the conditions on the way to the winning ending.",
      });
    } else {
      for (const k of entries) {
        diagnostics.push({
          severity: "error",
          code: "explore.dead-end",
          path: `rooms.${roomOf[k]}`,
          message:
            `Dead end: after ${formatPath(pathTo(k))} no winning ending can be reached any more ` +
            `(last room: ${roomOf[k]}; ${total} dead-end state(s) in total). The 'forgiving' policy forbids ` +
            "dead ends: make the last action reversible, keep another way to the goal, or prevent the action " +
            "while it would block progress.",
        });
      }
    }
  } else {
    diagnostics.push({
      severity: "warning",
      code: "explore.incomplete",
      path: "",
      message:
        `Exploration stopped at ${maxStates} states, so the result is incomplete (dead ends were not checked). ` +
        "Bound every counter changed by turn rules with a when condition and avoid independent state that never matters.",
    });
  }

  const unreached = {
    rooms: ix.roomIds.filter((id) => !enteredRooms.has(id)),
    endings: Object.keys(pack.endings).filter((id) => !endingsReached.has(id)),
    rules: ix.allRules.filter((r) => firedRules[r.index] !== 1).map((r) => r.label),
    options: [] as string[],
  };
  const optionPaths = new Map<string, string>();
  for (const [dId, d] of Object.entries(pack.dialogues)) {
    for (const [nodeId, node] of Object.entries(d.nodes)) {
      (node.options ?? []).forEach((o, j) => {
        const key = optionKey(dId, o.id);
        if (chosenOptions.has(key) || optionPaths.has(key)) return;
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
      if (firedRules[r.index] === 1) continue;
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
    shortestWin: winnable ? pathTo(firstWin) : null,
    deadEnds,
    losingEndings,
    unreached,
    diagnostics,
  };
}

function info(code: string, path: string, message: string): Diagnostic {
  return { severity: "info", code, path, message };
}

function isWin(pack: Pack, ending: string | null): boolean {
  return ending !== null && pack.endings[ending]?.win === true;
}

function formatPath(path: string[]): string {
  return path.length > 0 ? `"${path.join(" → ")}"` : "the start";
}

/** Nodes that can reach a target node, following edges backwards. */
function reverseReach(
  n: number,
  edgeStart: number[],
  edgeTo: number[],
  isTarget: (node: number) => boolean,
): Uint8Array {
  const indeg = new Int32Array(n + 1);
  for (const to of edgeTo) indeg[to + 1] = (indeg[to + 1] ?? 0) + 1;
  for (let k = 0; k < n; k++) indeg[k + 1] = (indeg[k + 1] ?? 0) + (indeg[k] ?? 0);
  const revStart = indeg;
  const fill = revStart.slice(0, n);
  const revFrom = new Int32Array(edgeTo.length);
  for (let from = 0; from < n; from++) {
    const end = edgeStart[from + 1] ?? edgeStart[from] ?? 0;
    for (let e = edgeStart[from] ?? 0; e < end; e++) {
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

function makeCandidateGenerator(
  pack: Pack,
  ix: PackIndex,
  includeDrop: boolean,
  firedRules: Uint8Array,
): (state: GameState) => Command[] {
  const hasTurnRules = ix.turnRules.length > 0;
  // A command that changes nothing by itself (no state-changing rule can match it): the turn rules are its only effect.
  const neutral = ["wait", "inventory", "look"].find((verb) =>
    (ix.commandRules.get(verb) ?? []).every(
      (r) => r.pure || r.trigger.object !== undefined || r.trigger.with !== undefined,
    ),
  );

  return (state) => {
    if (state.ended !== null) return [];
    if (state.dialogue) {
      const { id, node } = state.dialogue;
      return availableOptions(pack, state, id, pack.dialogues[id]?.nodes[node]).map((o) => ({
        verb: "choose",
        object: o.id,
      }));
    }

    const out: Command[] = [];
    const seen = new Set<string>();
    const add = (verb: string, object?: string, withObj?: string) => {
      const key = `${verb} ${object ?? ""} ${withObj ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      const cmd: Command = { verb };
      if (object !== undefined) cmd.object = object;
      if (withObj !== undefined) cmd.with = withObj;
      out.push(cmd);
    };

    for (const { id } of listedExits(pack, state)) add("go", id);

    const pres = presentObjects(pack, state, ix.objectIds);
    const present = [...pres.room, ...pres.inv];
    const presentSet = new Set(present);
    const pick = (id: string | undefined) => (id === undefined ? present : presentSet.has(id) ? [id] : []);

    for (const [verb, rules] of ix.commandRules) {
      const info = ix.verbs.get(verb);
      if (!info || verb === "go" || verb === "choose") continue;
      for (const ref of rules) {
        if (ref.pure && firedRules[ref.index] === 1) continue;
        if (ref.onceKey !== null && state.fired.includes(ref.onceKey)) continue;
        if (!evalConditions(pack, state, ref.rule.when)) continue;
        const t = ref.trigger;
        // A text-only catch-all is tried once per state, for coverage only.
        const single = ref.pure && t.object === undefined && t.with === undefined;
        if (t.object === undefined && t.with === undefined && info.min === 0) add(verb);
        if (t.with === undefined && info.min <= 1 && info.max >= 1) {
          for (const o of pick(t.object)) {
            add(verb, o);
            if (single) break;
          }
        }
        if (info.max === 2) {
          const orders: Array<[string | undefined, string | undefined]> = [[t.object, t.with]];
          if (verb === "use") orders.push([t.with, t.object]);
          for (const [a, b] of orders) {
            pairs: for (const x of pick(a)) {
              for (const y of pick(b)) {
                if (x === y) continue;
                add(verb, x, y);
                if (single) break pairs;
              }
            }
          }
        }
      }
    }

    // Default behaviours that can change the state.
    for (const id of present) {
      const def = pack.objects[id];
      const os = state.objects[id];
      if (!def || !os) continue;
      if ((def.portable || def.clue) && os.location !== INVENTORY) add("take", id);
      if (def.openable) add(os.open ? "close" : "open", id);
      if (def.npc && def.dialogue !== undefined) add("talk", id);
      if (def.unlockedBy !== undefined && os.locked && presentSet.has(def.unlockedBy)) add("use", def.unlockedBy, id);
    }
    if (includeDrop) for (const id of pres.inv) if (!pack.objects[id]?.clue) add("drop", id);
    if (hasTurnRules && neutral !== undefined) add(neutral);
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

/** Membership bits of `list` over `universe`; members outside the universe are appended verbatim. */
function memberBits(list: readonly string[], index: Map<string, number>, size: number): string {
  const values = new Array<boolean>(size).fill(false);
  const extra: string[] = [];
  for (const id of list) {
    const i = index.get(id);
    if (i === undefined) extra.push(id);
    else values[i] = true;
  }
  return extra.length === 0 ? packBits(values) : `${packBits(values)},${extra.sort().join(",")}`;
}

function makeKeyFn(pack: Pack, ix: PackIndex): (s: GameState) => string {
  const locIndex = new Map<string, number>();
  for (const id of [...ix.roomIds, ...ix.objectIds, INVENTORY, NOWHERE]) {
    if (!locIndex.has(id)) locIndex.set(id, locIndex.size);
  }
  const mutable = mutableObjects(pack, ix);
  const flagIds = Object.keys(pack.flags);
  const counterIds = Object.keys(pack.counters);
  const roomIndex = new Map(ix.roomIds.map((id, i) => [id, i]));
  const onceKeys = [...new Set(ix.allRules.flatMap((r) => (r.onceKey !== null ? [r.onceKey] : [])))];
  const onceIndex = new Map(onceKeys.map((k, i) => [k, i]));
  const optionKeys: string[] = [];
  for (const [dId, d] of Object.entries(pack.dialogues)) {
    for (const node of Object.values(d.nodes)) {
      for (const o of node.options ?? []) if (o.once) optionKeys.push(optionKey(dId, o.id));
    }
  }
  const optionIndex = new Map([...new Set(optionKeys)].map((k, i) => [k, i]));
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
    if (Object.keys(s.flags).length !== flagIds.length) {
      for (const f of Object.keys(s.flags).sort()) if (!(f in pack.flags)) k += `,${f}=${s.flags[f] ? 1 : 0}`;
    }
    k += `|${counterIds.map((c) => s.counters[c] ?? 0).join(",")}`;
    if (Object.keys(s.counters).length !== counterIds.length) {
      for (const c of Object.keys(s.counters).sort()) if (!(c in pack.counters)) k += `,${c}=${s.counters[c]}`;
    }
    k += `|${memberBits(s.visited, roomIndex, ix.roomIds.length)}`;
    k += `|${memberBits(s.fired, onceIndex, onceKeys.length)}`;
    k += `|${memberBits(s.chosen, optionIndex, optionIndex.size)}`;
    k += `|${s.dialogue ? `${s.dialogue.id}.${s.dialogue.node}` : ""}|${s.ended ?? ""}`;
    return k;
  };
}
