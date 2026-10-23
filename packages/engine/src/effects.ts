/**
 * Effects, rule firing, room entry and dialogues (spec sections 9, 11, 12).
 *
 * Every function works on the context's working state. `ctx.halted` is set by
 * `end` and by the recursion guard; once set, no further effect or rule runs
 * in the current call (which also suppresses `turn` rules).
 */

import { evalConditions } from "./conditions.ts";
import { type Ctx, emit, emitBlocks, emitMsg, emitText, MAX_NESTING, setObj } from "./context.ts";
import { roomBlocks } from "./describe.ts";
import type { CommandRuleRef, EventRuleRef, RuleRef } from "./pack-index.ts";
import { type DialogueNode, type DialogueOption, type Effect, INVENTORY, type Pack } from "./schema.ts";
import { objectSpan } from "./text.ts";
import type { GameState } from "./types.ts";

export function runEffects(ctx: Ctx, effects: readonly Effect[] | undefined): void {
  if (!effects) return;
  for (const e of effects) {
    if (ctx.halted) return;
    runEffect(ctx, e);
  }
}

function runEffect(ctx: Ctx, e: Effect): void {
  const st = ctx.state;
  if ("say" in e) emitText(ctx, "text", e.say);
  else if ("move" in e) setObj(ctx, e.move.object, { location: e.move.to });
  else if ("goto" in e) enterRoom(ctx, e.goto);
  else if ("set" in e) st.flags[e.set] = true;
  else if ("clear" in e) st.flags[e.clear] = false;
  else if ("counter" in e) {
    const c = e.counter;
    st.counters[c.name] = c.set !== undefined ? c.set : (st.counters[c.name] ?? 0) + (c.add ?? 0);
  } else if ("open" in e) setObj(ctx, e.open, { open: true });
  else if ("close" in e) setObj(ctx, e.close, { open: false });
  else if ("lock" in e) setObj(ctx, e.lock, { locked: true });
  else if ("unlock" in e) setObj(ctx, e.unlock, { locked: false });
  else if ("reveal" in e) setObj(ctx, e.reveal, { hidden: false });
  else if ("hide" in e) setObj(ctx, e.hide, { hidden: true });
  else if ("learn" in e) learn(ctx, e.learn);
  else if ("dialogue" in e) startDialogue(ctx, e.dialogue);
  else if ("endDialogue" in e) endDialogue(ctx);
  else if ("score" in e) addScore(ctx, e.score);
  else if ("end" in e) endGame(ctx, e.end);
  else if ("look" in e) describeRoom(ctx);
  else if ("if" in e) runEffects(ctx, evalConditions(ctx.pack, st, e.if.when) ? e.if.then : e.if.else);
}

/** Put a clue into the notebook and announce it. No-op when it is already there. */
export function learn(ctx: Ctx, id: string): void {
  const os = ctx.state.objects[id];
  if (!os || (os.location === INVENTORY && !os.hidden)) return;
  setObj(ctx, id, { location: INVENTORY, hidden: false });
  emitMsg(ctx, "system", ctx.m.learned, { obj: objectSpan(ctx.pack, id) });
}

function addScore(ctx: Ctx, n: number): void {
  ctx.state.score += n;
  if (n === 1) emitMsg(ctx, "system", ctx.m.pointGained);
  else if (n > 1) emitMsg(ctx, "system", ctx.m.pointsGained, { n });
  else if (n < 0) emitMsg(ctx, "system", ctx.m.pointsLost, { n });
}

export function endGame(ctx: Ctx, id: string): void {
  const st = ctx.state;
  st.ended = id;
  if (st.dialogue) ctx.dialogueEpoch++;
  st.dialogue = null;
  ctx.halted = true;
  if (ctx.quiet) return;
  const ending = ctx.pack.endings[id];
  emit(ctx, "ending", [{ text: ending?.title ?? id }]);
  emitText(ctx, "ending", ending?.text);
  if (ctx.pack.maxScore !== undefined) {
    emitMsg(ctx, "system", ctx.m.finalScore, { n: st.score, max: ctx.pack.maxScore });
  }
}

/** Stop everything after too deep rule recursion (goto → enter rule → goto …). */
function overflow(ctx: Ctx): void {
  if (ctx.halted) return;
  ctx.out.push({ kind: "system", spans: [{ text: "internal: rule recursion limit" }] });
  ctx.halted = true;
}

export function describeRoom(ctx: Ctx): void {
  if (!ctx.quiet) emitBlocks(ctx, roomBlocks(ctx.pack, ctx.ix, ctx.state));
}

/** Move the player: mark visited, describe the room, fire matching `enter` rules. */
export function enterRoom(ctx: Ctx, room: string): void {
  if (!ctx.pack.rooms[room]) return;
  if (ctx.depth >= MAX_NESTING) {
    overflow(ctx);
    return;
  }
  ctx.depth++;
  const st = ctx.state;
  st.room = room;
  if (!st.visited.includes(room)) st.visited.push(room);
  ctx.entered = true;
  ctx.trace?.room(room);
  describeRoom(ctx);
  fireEventRules(ctx, ctx.ix.enterRules, room);
  ctx.depth--;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function spent(state: GameState, ref: RuleRef): boolean {
  return ref.onceKey !== null && state.fired.includes(ref.onceKey);
}

export function fireRule(ctx: Ctx, ref: RuleRef): void {
  if (ref.onceKey !== null) ctx.state.fired.push(ref.onceKey);
  ctx.trace?.rule(ref.index);
  runEffects(ctx, ref.rule.do);
}

/**
 * Fire all matching event rules in pack order. A `room` on the trigger
 * restricts the rule to `room` (for `enter`: the room entered, even if an
 * earlier rule moved the player on) or else to the current room.
 */
export function fireEventRules(ctx: Ctx, rules: readonly EventRuleRef[], room?: string): void {
  for (const ref of rules) {
    if (ctx.halted) return;
    if (ref.trigger.room !== undefined && ref.trigger.room !== (room ?? ctx.state.room)) continue;
    if (spent(ctx.state, ref) || !evalConditions(ctx.pack, ctx.state, ref.rule.when)) continue;
    fireRule(ctx, ref);
  }
}

/** The first command rule that matches and may fire (spec section 10, step 5). */
export function findCommandRule(
  ctx: Ctx,
  verb: string,
  object: string | undefined,
  withObj: string | undefined,
): CommandRuleRef | null {
  const rules = ctx.ix.commandRules.get(verb);
  if (!rules) return null;
  for (const ref of rules) {
    const t = ref.trigger;
    if (t.object !== undefined && t.object !== object) continue;
    if (t.with !== undefined && t.with !== withObj) continue;
    if (spent(ctx.state, ref) || !evalConditions(ctx.pack, ctx.state, ref.rule.when)) continue;
    return ref;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dialogues
// ---------------------------------------------------------------------------

export function optionKey(dialogueId: string, optionId: string): string {
  return `${dialogueId}.${optionId}`;
}

/** Options of a node whose `when` holds and that are not spent `once` options. */
export function availableOptions(pack: Pack, state: GameState, dialogueId: string, node: DialogueNode | undefined) {
  const out: DialogueOption[] = [];
  for (const o of node?.options ?? []) {
    if (o.once && state.chosen.includes(optionKey(dialogueId, o.id))) continue;
    if (!evalConditions(pack, state, o.when)) continue;
    out.push(o);
  }
  return out;
}

export function startDialogue(ctx: Ctx, id: string): void {
  const d = ctx.pack.dialogues[id];
  if (!d) return;
  ctx.dialogueEpoch++;
  enterNode(ctx, id, d.start);
}

export function endDialogue(ctx: Ctx): void {
  if (ctx.state.dialogue) ctx.dialogueEpoch++;
  ctx.state.dialogue = null;
}

/** Enter a node: print `say` as npc lines, run `do`, end the dialogue when no option is available. */
function enterNode(ctx: Ctx, dialogueId: string, nodeId: string): void {
  const node = ctx.pack.dialogues[dialogueId]?.nodes[nodeId];
  if (!node) {
    endDialogue(ctx);
    return;
  }
  if (ctx.depth >= MAX_NESTING) {
    overflow(ctx);
    return;
  }
  ctx.depth++;
  ctx.state.dialogue = { id: dialogueId, node: nodeId };
  const epoch = ctx.dialogueEpoch;
  emitText(ctx, "npc", node.say);
  runEffects(ctx, node.do);
  if (!ctx.halted && ctx.dialogueEpoch === epoch) {
    if (availableOptions(ctx.pack, ctx.state, dialogueId, node).length === 0) endDialogue(ctx);
  }
  ctx.depth--;
}

/** Process a validated `choose` command for the active dialogue. */
export function chooseOption(ctx: Ctx, option: DialogueOption): void {
  const active = ctx.state.dialogue;
  if (!active) return;
  const key = optionKey(active.id, option.id);
  emitText(ctx, "player", option.text);
  if (option.once) ctx.state.chosen.push(key);
  ctx.trace?.option(key);
  const epoch = ctx.dialogueEpoch;
  runEffects(ctx, option.do);
  if (ctx.halted || ctx.dialogueEpoch !== epoch) return;
  if (option.goto !== undefined) enterNode(ctx, active.id, option.goto);
  else endDialogue(ctx);
}
