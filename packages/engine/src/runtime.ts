/**
 * The deterministic game state machine: newGame, step, view, hint.
 *
 * Turn processing follows spec section 10 exactly; see validate() for the
 * rejection rules and stepWith() for the order of echo, rules, defaults and
 * turn rules.
 */
import { exitLabel, inventoryObjectVerbs, listedExits, objectKind, roomObjectVerbs } from "./affordances.ts";
import { commandLabelIn } from "./commands.ts";
import { evalConditions } from "./conditions.ts";
import { type Ctx, cloneState, emit, emitText, makeCtx, type RunOptions } from "./context.ts";
import { defaultBehaviour } from "./defaults.ts";
import {
  activeOptions,
  chooseOption,
  enterRoom,
  findCommandRule,
  fireEventRules,
  fireRule,
  settleDialogue,
} from "./effects.ts";
import { fmt } from "./messages/index.ts";
import { indexPack, type PackIndex } from "./pack-index.ts";
import { isPresent, presentObjects } from "./presence.ts";
import type { DialogueOption, Pack } from "./schema.ts";
import { plainText } from "./text.ts";
import type {
  Command,
  GameState,
  HintView,
  ObjectView,
  OutputBlock,
  Span,
  StepResult,
  VerbView,
  View,
} from "./types.ts";

/** Start a new game: initial state plus intro and first room description. Fires `start` and `enter` rules. */
export function newGame(pack: Pack): { state: GameState; output: OutputBlock[] } {
  return newGameWith(pack, {});
}

/** Execute one command. Pure: never mutates `state`. */
export function step(pack: Pack, state: GameState, command: Command): StepResult {
  return stepWith(pack, state, command, {});
}

export function initialState(pack: Pack): GameState {
  const objects: GameState["objects"] = {};
  for (const [id, def] of Object.entries(pack.objects)) {
    objects[id] = {
      location: def.location,
      open: def.open ?? false,
      locked: def.locked ?? false,
      hidden: def.hidden ?? false,
    };
  }
  return {
    v: 1,
    pack: { id: pack.id, version: pack.version },
    turn: 0,
    room: pack.start.room,
    objects,
    flags: { ...pack.flags },
    counters: { ...pack.counters },
    visited: [],
    fired: [],
    chosen: [],
    dialogue: null,
    score: 0,
    ended: null,
  };
}

/** newGame with internal options (quiet output, tracing). */
export function newGameWith(pack: Pack, opts: RunOptions): { state: GameState; output: OutputBlock[] } {
  const ix = indexPack(pack);
  const ctx = makeCtx(pack, ix, initialState(pack), opts);
  emitText(ctx, "text", pack.start.intro);
  fireEventRules(ctx, ix.startRules);
  // A `goto` in a start rule already entered (and described) a room.
  if (!ctx.halted && !ctx.entered) enterRoom(ctx, pack.start.room);
  settleDialogue(ctx);
  return { state: ctx.state, output: ctx.out };
}

/** step with internal options (quiet output, tracing). */
export function stepWith(pack: Pack, state: GameState, command: Command, opts: RunOptions): StepResult {
  const ix = indexPack(pack);
  const check = validate(pack, ix, state, command);
  if (check.reject) {
    return {
      state,
      output: opts.quiet ? [] : [{ kind: "system", spans: check.reject }],
      status: "rejected",
    };
  }
  const ctx = makeCtx(pack, ix, cloneState(state), opts);
  if (check.option) {
    chooseOption(ctx, check.option);
  } else {
    if (!ctx.quiet) emit(ctx, "echo", [{ text: commandLabelIn(pack, command, state.room) }]);
    runCommand(ctx, command);
  }
  ctx.state.turn++;
  settleDialogue(ctx);
  if (!ctx.halted && ctx.state.ended === null && ctx.state.dialogue === null) {
    fireEventRules(ctx, ix.turnRules, undefined, true);
    settleDialogue(ctx);
  }
  return { state: ctx.state, output: ctx.out, status: "ok" };
}

/** Command rules (first match wins, `use a b` retried as `use b a`), else the default behaviour. */
function runCommand(ctx: Ctx, cmd: Command): void {
  let rule = findCommandRule(ctx, cmd.verb, cmd.object, cmd.with);
  if (!rule && cmd.verb === "use" && cmd.with !== undefined) rule = findCommandRule(ctx, "use", cmd.with, cmd.object);
  if (rule) fireRule(ctx, rule);
  else defaultBehaviour(ctx, cmd);
}

interface Validation {
  reject?: Span[];
  /** The chosen dialogue option of a valid `choose` command. */
  option?: DialogueOption;
}

/** Spec section 10, steps 1–3. Rejections leave the state unchanged. */
function validate(pack: Pack, ix: PackIndex, state: GameState, cmd: Command): Validation {
  const m = ix.m;
  const reject = (template: string, args?: Record<string, string>): Validation => ({ reject: fmt(template, args) });
  if (state.ended !== null) return reject(m.rejectGameOver);

  if (state.dialogue !== null) {
    if (cmd.verb !== "choose") return reject(m.rejectInDialogue);
    if (cmd.with !== undefined) return reject(m.rejectTooMany);
    const option = activeOptions(pack, state).find((o) => o.id === cmd.object);
    return option ? { option } : reject(m.rejectOptionUnavailable);
  }
  if (cmd.verb === "choose") return reject(m.rejectNoDialogue);

  const info = ix.verbs.get(cmd.verb);
  if (!info) return reject(m.rejectUnknownVerb, { verb: cmd.verb });
  if (cmd.object === undefined && cmd.with !== undefined) return reject(m.rejectNeedsObject);
  const count = (cmd.object !== undefined ? 1 : 0) + (cmd.with !== undefined ? 1 : 0);
  if (count < info.min) return reject(count === 0 ? m.rejectNeedsObject : m.rejectNeedsSecond);
  if (count > info.max) return reject(m.rejectTooMany);

  if (cmd.verb === "go") {
    const listed = listedExits(pack, state).some((e) => e.id === cmd.object);
    return listed ? {} : reject(m.rejectNoExit);
  }
  for (const id of [cmd.object, cmd.with]) {
    if (id === undefined) continue;
    if (!pack.objects[id] || !state.objects[id]) return reject(m.rejectUnknownObject, { id });
    if (!isPresent(pack, state, id)) return reject(m.rejectNotHere);
  }
  if (cmd.with !== undefined && cmd.with === cmd.object) return reject(m.rejectSameObject);
  return {};
}

// ---------------------------------------------------------------------------
// View and hints
// ---------------------------------------------------------------------------

/**
 * Affordances for the UI.
 *
 * - `objects`: present objects outside the inventory, pack order.
 * - `inventory`: carried items first (top level, then contents of open
 *   carried containers), then clues; each group in pack order.
 * - `verbs`: core verbs except `go`/`choose` (exits and dialogue options have
 *   their own UI), then pack verbs. `look` has arity 1 here (the "look
 *   around" command is a separate UI action); `use` has arity 2 (the UI asks
 *   for the second object).
 */
export function view(pack: Pack, state: GameState): View {
  const ix = indexPack(pack);
  const m = ix.m;
  const present = presentObjects(pack, state, ix.objectIds);
  const npcPresent = present.room.some((id) => pack.objects[id]?.npc === true);

  const objectView = (id: string, inInventory: boolean): ObjectView | null => {
    const def = pack.objects[id];
    const os = state.objects[id];
    if (!def || !os) return null;
    return {
      id,
      name: def.name,
      kind: objectKind(def),
      verbs: inInventory ? inventoryObjectVerbs(ix, def, os, npcPresent) : roomObjectVerbs(ix, def, os),
    };
  };
  const objects = present.room.map((id) => objectView(id, false)).filter((o) => o !== null);
  const topItems: ObjectView[] = [];
  const nestedItems: ObjectView[] = [];
  const clues: ObjectView[] = [];
  for (const id of present.inv) {
    const v = objectView(id, true);
    if (!v) continue;
    if (v.kind === "clue") clues.push(v);
    else if (state.objects[id]?.location === "inventory") topItems.push(v);
    else nestedItems.push(v);
  }

  const verbs: VerbView[] = ix.verbOrder.map((id) => {
    const info = ix.verbs.get(id);
    const vv: VerbView = { id, label: info?.label ?? id, arity: info?.sheetArity ?? 1 };
    if (info?.prep !== undefined && vv.arity === 2) vv.prep = info.prep;
    return vv;
  });

  let dialogue: View["dialogue"] = null;
  if (state.dialogue) {
    const d = Object.hasOwn(pack.dialogues, state.dialogue.id) ? pack.dialogues[state.dialogue.id] : undefined;
    const options = activeOptions(pack, state);
    dialogue = { id: state.dialogue.id, options: options.map((o) => ({ id: o.id, text: plainText(pack, o.text) })) };
    const npc = d?.with !== undefined ? pack.objects[d.with]?.name : undefined;
    if (npc !== undefined) dialogue.npc = npc;
  }

  const ending = state.ended !== null ? pack.endings[state.ended] : undefined;
  return {
    room: { id: state.room, name: pack.rooms[state.room]?.name ?? state.room },
    objects,
    inventory: [...topItems, ...nestedItems, ...clues],
    exits: listedExits(pack, state).map(({ id, exit }) => ({ id, label: exitLabel(m, id, exit) })),
    verbs,
    dialogue,
    ended:
      state.ended !== null ? { id: state.ended, title: ending?.title ?? state.ended, win: ending?.win ?? false } : null,
    score: pack.maxScore !== undefined ? { value: state.score, max: pack.maxScore } : null,
    turn: state.turn,
  };
}

/** The currently relevant hint: the first whose `when` holds and whose `until` does not. Null once the game ended. */
export function hint(pack: Pack, state: GameState): HintView | null {
  if (state.ended !== null) return null;
  for (const h of pack.hints) {
    if (evalConditions(pack, state, h.when) && !evalConditions(pack, state, h.until)) {
      return { id: h.id, steps: [...h.steps] };
    }
  }
  return null;
}
