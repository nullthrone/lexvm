/** Evaluation of the closed condition DSL (spec section 8). */
import { isPresent } from "./presence.ts";
import { type Condition, type Conditions, type CounterTest, INVENTORY, type Pack } from "./schema.ts";
import type { GameState } from "./types.ts";

export function evalCondition(pack: Pack, state: GameState, c: Condition): boolean {
  if ("has" in c) return state.objects[c.has]?.location === INVENTORY;
  if ("at" in c) return state.room === c.at;
  if ("here" in c) return isPresent(pack, state, c.here);
  if ("in" in c) return state.objects[c.in.object]?.location === c.in.location;
  if ("flag" in c) return state.flags[c.flag] === true;
  if ("counter" in c) return counterHolds(state.counters[c.counter.name] ?? 0, c.counter);
  if ("visited" in c) return state.visited.includes(c.visited);
  if ("isOpen" in c) return state.objects[c.isOpen]?.open === true;
  if ("isLocked" in c) return state.objects[c.isLocked]?.locked === true;
  if ("not" in c) return !evalCondition(pack, state, c.not);
  if ("all" in c) return c.all.every((x) => evalCondition(pack, state, x));
  if ("any" in c) return c.any.some((x) => evalCondition(pack, state, x));
  return false;
}

/** A list of conditions holds when all hold; a missing list always holds. */
export function evalConditions(pack: Pack, state: GameState, conds: Conditions | undefined): boolean {
  if (conds === undefined) return true;
  for (const c of conds) if (!evalCondition(pack, state, c)) return false;
  return true;
}

function counterHolds(v: number, t: CounterTest): boolean {
  if (t.eq !== undefined && !(v === t.eq)) return false;
  if (t.ne !== undefined && !(v !== t.ne)) return false;
  if (t.gt !== undefined && !(v > t.gt)) return false;
  if (t.gte !== undefined && !(v >= t.gte)) return false;
  if (t.lt !== undefined && !(v < t.lt)) return false;
  if (t.lte !== undefined && !(v <= t.lte)) return false;
  return true;
}
