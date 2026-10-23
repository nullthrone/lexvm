/**
 * Semantic validation of a game state against its pack, for states that come
 * from outside the engine (saved games, imported save files). The engine
 * itself only ever produces valid states; a hand-made or tampered state can
 * name rooms, dialogues or endings that do not exist ("constructor"), lack
 * objects, or leave a dialogue without options (a soft lock).
 */
import { activeOptions, optionKey } from "./effects.ts";
import { indexPack } from "./pack-index.ts";
import { INVENTORY, NOWHERE, type Pack } from "./schema.ts";
import type { GameState } from "./types.ts";

const MAX_PROBLEMS = 10;

/**
 * Problems of `state` as a state of `pack` (empty when it is valid): ids must
 * be declared (own properties only), the object, flag and counter sets must
 * equal the pack's, values must have the right types, and an active dialogue
 * must offer at least one option. Expects a structurally valid GameState.
 */
export function validateState(pack: Pack, state: GameState): string[] {
  const problems: string[] = [];
  const add = (problem: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(problem);
  };
  const own = (record: object, id: string) => Object.hasOwn(record, id);
  const sameKeys = (what: string, actual: object, expected: object) => {
    const a = Object.keys(actual);
    for (const id of a) if (!own(expected, id)) add(`unknown ${what} "${id}"`);
    for (const id of Object.keys(expected)) if (!own(actual, id)) add(`missing ${what} "${id}"`);
  };

  if (state.pack.id !== pack.id) add(`state of pack "${state.pack.id}", not "${pack.id}"`);
  if (!Number.isInteger(state.turn) || state.turn < 0) add("turn must be a whole number");
  if (!Number.isFinite(state.score)) add("score must be a number");
  if (!own(pack.rooms, state.room)) add(`unknown room "${state.room}"`);
  for (const id of state.visited) if (!own(pack.rooms, id)) add(`unknown visited room "${id}"`);

  sameKeys("object", state.objects, pack.objects);
  for (const [id, os] of Object.entries(state.objects)) {
    const loc = os.location;
    if (loc !== INVENTORY && loc !== NOWHERE && !own(pack.rooms, loc) && !own(pack.objects, loc)) {
      add(`object "${id}" is in unknown location "${loc}"`);
    }
  }
  sameKeys("flag", state.flags, pack.flags);
  for (const [id, value] of Object.entries(state.flags))
    if (typeof value !== "boolean") add(`flag "${id}" is not true/false`);
  sameKeys("counter", state.counters, pack.counters);
  for (const [id, value] of Object.entries(state.counters)) {
    if (typeof value !== "number" || !Number.isFinite(value)) add(`counter "${id}" is not a number`);
  }

  const ix = indexPack(pack);
  const onceKeys = new Set(ix.allRules.flatMap((r) => (r.onceKey !== null ? [r.onceKey] : [])));
  for (const key of state.fired) if (!onceKeys.has(key)) add(`unknown once rule "${key}"`);
  const optionKeys = new Set<string>();
  for (const [dialogueId, dialogue] of Object.entries(pack.dialogues)) {
    for (const node of Object.values(dialogue.nodes)) {
      for (const option of node.options ?? []) if (option.once) optionKeys.add(optionKey(dialogueId, option.id));
    }
  }
  for (const key of state.chosen) if (!optionKeys.has(key)) add(`unknown once option "${key}"`);

  if (state.ended !== null && !own(pack.endings, state.ended)) add(`unknown ending "${state.ended}"`);
  const d = state.dialogue;
  if (d !== null) {
    const dialogue = own(pack.dialogues, d.id) ? pack.dialogues[d.id] : undefined;
    if (dialogue === undefined) add(`unknown dialogue "${d.id}"`);
    else if (!own(dialogue.nodes, d.node)) add(`unknown node "${d.node}" in dialogue "${d.id}"`);
    else if (problems.length === 0 && state.ended === null && activeOptions(pack, state).length === 0) {
      add(`dialogue "${d.id}" has no available option at node "${d.node}"`);
    }
  }
  return problems;
}
