/** Exits and per-object verb lists, shared by the view, room descriptions and the explorer. */
import { evalConditions } from "./conditions.ts";
import type { Messages, StandardExit } from "./messages/index.ts";
import type { PackIndex } from "./pack-index.ts";
import type { Exit, GameObject, Pack } from "./schema.ts";
import type { GameState, ObjectKind, ObjectState } from "./types.ts";

/** Exits of the current room whose `visibleWhen` holds, in pack order. */
export function listedExits(pack: Pack, state: GameState): Array<{ id: string; exit: Exit }> {
  const exits = pack.rooms[state.room]?.exits;
  if (!exits) return [];
  const out: Array<{ id: string; exit: Exit }> = [];
  for (const [id, exit] of Object.entries(exits)) {
    if (evalConditions(pack, state, exit.visibleWhen)) out.push({ id, exit });
  }
  return out;
}

/** Pack label, else the localized standard label, else the raw id. */
export function exitLabel(m: Messages, id: string, exit: Exit | undefined): string {
  return exit?.label ?? m.exitLabels[id as StandardExit] ?? id;
}

/** Label for an exit id without a state: the first room that defines the exit wins. */
export function exitLabelAnywhere(pack: Pack, m: Messages, id: string): string {
  for (const room of Object.values(pack.rooms)) {
    const label = room.exits?.[id]?.label;
    if (label !== undefined) return label;
  }
  return m.exitLabels[id as StandardExit] ?? id;
}

/** clue > npc > container > item (portable) > scenery. */
export function objectKind(def: GameObject): ObjectKind {
  if (def.clue) return "clue";
  if (def.npc) return "npc";
  if (def.container) return "container";
  if (def.portable) return "item";
  return "scenery";
}

/** Action-sheet verbs of an object lying in the room. */
export function roomObjectVerbs(ix: PackIndex, def: GameObject, os: ObjectState): string[] {
  const verbs = ["look"];
  if (def.npc) verbs.push("talk");
  if (def.portable || def.clue) verbs.push("take");
  if (def.openable) verbs.push(os.open ? "close" : "open");
  if (!def.npc) verbs.push("use");
  appendObjectVerbs(ix, def, verbs);
  return verbs;
}

/**
 * Action-sheet verbs of a carried object. `open`/`close` for carried openable
 * objects (a bag) is an addition to the spec'd list so that taps can reach them.
 */
export function inventoryObjectVerbs(ix: PackIndex, def: GameObject, os: ObjectState, npcPresent: boolean): string[] {
  const verbs = ["look", "use"];
  if (def.openable) verbs.push(os.open ? "close" : "open");
  if (npcPresent) verbs.push("show");
  if (npcPresent && !def.clue) verbs.push("give");
  if (!def.clue) verbs.push("drop");
  appendObjectVerbs(ix, def, verbs);
  return verbs;
}

function appendObjectVerbs(ix: PackIndex, def: GameObject, verbs: string[]): void {
  for (const v of def.verbs ?? []) {
    if (v === "go" || v === "choose" || !ix.verbs.has(v) || verbs.includes(v)) continue;
    verbs.push(v);
  }
}
