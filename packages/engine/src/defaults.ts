/**
 * Default behaviours of the core verbs (spec section 10, table), used when no
 * command rule fired. Commands reaching this point are validated: objects
 * exist and are present, the arity fits, `go` targets a listed exit.
 */

import { evalConditions } from "./conditions.ts";
import { type Ctx, emitBlocks, emitMsg, emitText, setObj } from "./context.ts";
import { contentsLine, examineBlocks, inventoryBlocks } from "./describe.ts";
import { describeRoom, enterRoom, learn, startDialogue } from "./effects.ts";
import { isHeld } from "./presence.ts";
import { INVENTORY, type Text } from "./schema.ts";
import { objectSpan } from "./text.ts";
import type { Command } from "./types.ts";

export function defaultBehaviour(ctx: Ctx, cmd: Command): void {
  const a = cmd.object ?? "";
  const b = cmd.with;
  switch (cmd.verb) {
    case "look":
      if (cmd.object === undefined) describeRoom(ctx);
      else if (!ctx.quiet) emitBlocks(ctx, examineBlocks(ctx.pack, ctx.ix, ctx.state, a));
      return;
    case "take":
      take(ctx, a);
      return;
    case "drop":
      drop(ctx, a);
      return;
    case "open":
      open(ctx, a);
      return;
    case "close":
      close(ctx, a);
      return;
    case "use":
      if (b === undefined) say(ctx, packDefault(ctx, "use"), ctx.m.nothingHappens);
      else useWith(ctx, a, b);
      return;
    case "talk":
      talk(ctx, a);
      return;
    case "give":
    case "show":
      giveOrShow(ctx, cmd.verb, a, b ?? "");
      return;
    case "push":
    case "pull":
      say(ctx, packDefault(ctx, cmd.verb), ctx.m.nothingHappens);
      return;
    case "go":
      go(ctx, a);
      return;
    case "wait":
      say(ctx, packDefault(ctx, "wait"), ctx.m.timePasses);
      return;
    case "inventory":
      if (!ctx.quiet) emitBlocks(ctx, inventoryBlocks(ctx.pack, ctx.ix, ctx.state));
      return;
    default:
      // Pack verb: its `default` text, else "Nothing happens."
      say(ctx, packDefault(ctx, cmd.verb), ctx.m.nothingHappens);
      return;
  }
}

/** A pack's `default` text for a verb (pack verbs, and overrides of push/pull/use/wait). */
function packDefault(ctx: Ctx, verb: string): Text | undefined {
  return ctx.pack.verbs[verb]?.default;
}

function say(ctx: Ctx, text: Text | undefined, fallback: string): void {
  if (text !== undefined) emitText(ctx, "text", text);
  else emitMsg(ctx, "text", fallback);
}

function take(ctx: Ctx, id: string): void {
  const def = ctx.pack.objects[id];
  const os = ctx.state.objects[id];
  if (!def || !os) return;
  if (!(def.portable || def.clue)) {
    emitMsg(ctx, "text", ctx.m.notTakeable);
    return;
  }
  if (os.location === INVENTORY) {
    emitMsg(ctx, "text", ctx.m.alreadyHeld);
    return;
  }
  if (def.clue) {
    learn(ctx, id);
    return;
  }
  setObj(ctx, id, { location: INVENTORY });
  emitMsg(ctx, "text", ctx.m.taken, { obj: objectSpan(ctx.pack, ctx.state, id) });
}

function drop(ctx: Ctx, id: string): void {
  const def = ctx.pack.objects[id];
  if (!def) return;
  if (def.clue) {
    emitMsg(ctx, "text", ctx.m.cannotDropClue);
    return;
  }
  if (!isHeld(ctx.pack, ctx.state, id)) {
    emitMsg(ctx, "text", ctx.m.notHeld);
    return;
  }
  setObj(ctx, id, { location: ctx.state.room });
  emitMsg(ctx, "text", ctx.m.dropped, { obj: objectSpan(ctx.pack, ctx.state, id) });
}

function open(ctx: Ctx, id: string): void {
  const { pack, m } = ctx;
  const def = pack.objects[id];
  const os = ctx.state.objects[id];
  if (!def || !os) return;
  if (!def.openable) {
    emitMsg(ctx, "text", m.notOpenable);
    return;
  }
  if (os.open) {
    emitMsg(ctx, "text", m.alreadyOpen);
    return;
  }
  if (os.locked) {
    const key = def.unlockedBy;
    if (key === undefined || !isHeld(pack, ctx.state, key)) {
      emitMsg(ctx, "text", m.locked);
      return;
    }
    setObj(ctx, id, { locked: false, open: true });
    emitMsg(ctx, "text", m.unlockedAndOpened, {
      obj: objectSpan(pack, ctx.state, id),
      key: objectSpan(pack, ctx.state, key),
    });
  } else {
    setObj(ctx, id, { open: true });
    emitMsg(ctx, "text", m.opened, { obj: objectSpan(pack, ctx.state, id) });
  }
  if (def.container && !ctx.quiet) {
    const line = contentsLine(pack, ctx.ix, ctx.state, id);
    if (line) emitBlocks(ctx, [line]);
  }
}

function close(ctx: Ctx, id: string): void {
  const def = ctx.pack.objects[id];
  const os = ctx.state.objects[id];
  if (!def || !os) return;
  if (!def.openable) {
    emitMsg(ctx, "text", ctx.m.notClosable);
    return;
  }
  if (!os.open) {
    emitMsg(ctx, "text", ctx.m.alreadyClosed);
    return;
  }
  setObj(ctx, id, { open: false });
  emitMsg(ctx, "text", ctx.m.closed, { obj: objectSpan(ctx.pack, ctx.state, id) });
}

/** `use a with b`: unlock when one is the other's `unlockedBy` (both orders are tried). */
function useWith(ctx: Ctx, a: string, b: string): void {
  for (const [key, lock] of [
    [a, b],
    [b, a],
  ] as const) {
    if (ctx.pack.objects[lock]?.unlockedBy !== key) continue;
    if (!ctx.state.objects[lock]?.locked) emitMsg(ctx, "text", ctx.m.alreadyUnlocked);
    else {
      setObj(ctx, lock, { locked: false });
      emitMsg(ctx, "text", ctx.m.unlocked, {
        obj: objectSpan(ctx.pack, ctx.state, lock),
        key: objectSpan(ctx.pack, ctx.state, key),
      });
    }
    return;
  }
  say(ctx, packDefault(ctx, "use"), ctx.m.doesNotWork);
}

/** Start the object's dialogue. Any object may have one (a telephone); only npcs offer 'talk' in their sheet. */
function talk(ctx: Ctx, id: string): void {
  const def = ctx.pack.objects[id];
  if (def?.dialogue !== undefined && Object.hasOwn(ctx.pack.dialogues, def.dialogue)) startDialogue(ctx, def.dialogue);
  else emitMsg(ctx, "text", ctx.m.noAnswer);
}

/** give/show need `a` carried (for show, clues always count as carried); then `b` is not interested. */
function giveOrShow(ctx: Ctx, verb: "give" | "show", a: string, b: string): void {
  const { pack, m } = ctx;
  const carried = isHeld(pack, ctx.state, a) || (verb === "show" && pack.objects[a]?.clue === true);
  if (!carried) {
    emitMsg(ctx, "text", m.notHeld);
    return;
  }
  if (pack.objects[b]?.npc) {
    emitMsg(ctx, "text", m.notInterested, { npc: objectSpan(pack, ctx.state, b) });
    return;
  }
  emitMsg(ctx, "text", m.doesNotWork);
}

/** Move through a listed exit if its door is open and `when` holds; otherwise print `blocked`. */
function go(ctx: Ctx, exitId: string): void {
  const exit = ctx.pack.rooms[ctx.state.room]?.exits?.[exitId];
  if (!exit) return;
  const doorClosed = exit.door !== undefined && !ctx.state.objects[exit.door]?.open;
  if (doorClosed || !evalConditions(ctx.pack, ctx.state, exit.when)) say(ctx, exit.blocked, ctx.m.blocked);
  else enterRoom(ctx, exit.to);
}
