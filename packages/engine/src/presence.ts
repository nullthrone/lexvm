/**
 * Presence (spec section 6): which objects the player can currently refer to.
 *
 * An object is present when it is not hidden and either its location chain
 * leads to the current room or to the inventory through containers that are
 * open (or not openable) and not hidden, or the current room is listed in its
 * own `alsoIn`. `alsoIn` applies to the object itself only, not to its
 * contents. Location cycles (a pack bug) make the objects involved absent.
 */
import { INVENTORY, type Pack } from "./schema.ts";
import type { GameState } from "./types.ts";

/** Deeper nesting than this is treated as a location cycle. */
const MAX_NESTING = 64;

/**
 * The room id, "inventory" or "nowhere" an object's location chain ends in,
 * or null when the chain is interrupted (hidden or closed container, cycle)
 * or the object itself is hidden.
 */
export function reachableRoot(pack: Pack, state: GameState, id: string): string | null {
  const os = state.objects[id];
  if (!os || os.hidden) return null;
  let loc = os.location;
  for (let depth = 0; depth < MAX_NESTING; depth++) {
    const container = state.objects[loc];
    if (!container) return loc;
    if (container.hidden) return null;
    if (pack.objects[loc]?.openable && !container.open) return null;
    loc = container.location;
  }
  return null;
}

export function isPresent(pack: Pack, state: GameState, id: string): boolean {
  const os = state.objects[id];
  if (!os || os.hidden) return false;
  const root = reachableRoot(pack, state, id);
  if (root === state.room || root === INVENTORY) return true;
  const alsoIn = pack.objects[id]?.alsoIn;
  return alsoIn?.includes(state.room) === true;
}

/** The object is carried: present and its chain ends in the inventory (possibly inside a carried container). */
export function isHeld(pack: Pack, state: GameState, id: string): boolean {
  return reachableRoot(pack, state, id) === INVENTORY;
}

/** Present objects split into room and inventory, each in pack order. */
export function presentObjects(
  pack: Pack,
  state: GameState,
  ids: readonly string[],
): { room: string[]; inv: string[] } {
  const room: string[] = [];
  const inv: string[] = [];
  for (const id of ids) {
    const os = state.objects[id];
    if (!os || os.hidden) continue;
    const root = reachableRoot(pack, state, id);
    if (root === INVENTORY) inv.push(id);
    else if (root === state.room || pack.objects[id]?.alsoIn?.includes(state.room)) room.push(id);
  }
  return { room, inv };
}
