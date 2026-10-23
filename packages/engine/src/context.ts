/**
 * Execution context for one engine call (a step or a new game).
 *
 * The working state is a shallow copy of the input: the top-level maps and
 * arrays are copied, ObjectState entries are shared and replaced (never
 * mutated) on write. That keeps inputs untouched at a fraction of the cost of
 * a deep clone, which matters for state-space exploration.
 */
import type { Messages } from "./messages/index.ts";
import { type FmtArg, fmt } from "./messages/index.ts";
import type { PackIndex } from "./pack-index.ts";
import type { Pack, Text } from "./schema.ts";
import { resolveText, textBlocks } from "./text.ts";
import type { GameState, ObjectState, OutputBlock, OutputKind, Span } from "./types.ts";

/** Maximum nesting of goto / dialogue entries triggered by rules (goto → enter rule → goto …). */
export const MAX_NESTING = 16;

/**
 * Maximum work (effects run plus room and dialogue node entries) of one engine
 * call. MAX_NESTING bounds the depth only; without this budget, rules whose
 * `do` enters the next room several times fan out exponentially within it.
 */
export const MAX_WORK = 10_000;

/** Instrumentation hooks used by the explorer to find content that is never reached. */
export interface Trace {
  rule(index: number): void;
  option(key: string): void;
  room(id: string): void;
}

export interface RunOptions {
  /** Skip building output (the explorer only needs states). */
  quiet?: boolean;
  trace?: Trace;
}

export interface Ctx {
  pack: Pack;
  ix: PackIndex;
  m: Messages;
  state: GameState;
  out: OutputBlock[];
  quiet: boolean;
  trace: Trace | undefined;
  /** Current nesting depth of room entries and dialogue node entries. */
  depth: number;
  /** Effects run plus rooms and dialogue nodes entered so far in this call (see MAX_WORK). */
  work: number;
  /** Set by `end` and by the recursion guard: no further effects or rules run in this call. */
  halted: boolean;
  /** Incremented whenever the active dialogue is replaced or ended, to detect changes made by effects. */
  dialogueEpoch: number;
  /** True once a room was entered during this call (newGame skips its own entry then). */
  entered: boolean;
}

export function makeCtx(pack: Pack, ix: PackIndex, state: GameState, opts: RunOptions): Ctx {
  return {
    pack,
    ix,
    m: ix.m,
    state,
    out: [],
    quiet: opts.quiet === true,
    trace: opts.trace,
    depth: 0,
    work: 0,
    halted: false,
    dialogueEpoch: 0,
    entered: false,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    v: s.v,
    pack: { id: s.pack.id, version: s.pack.version },
    turn: s.turn,
    room: s.room,
    objects: { ...s.objects },
    flags: { ...s.flags },
    counters: { ...s.counters },
    visited: s.visited.slice(),
    fired: s.fired.slice(),
    chosen: s.chosen.slice(),
    dialogue: s.dialogue ? { id: s.dialogue.id, node: s.dialogue.node } : null,
    score: s.score,
    ended: s.ended,
  };
}

/** Copy-on-write update of one object's state. Unknown objects are ignored. */
export function setObj(ctx: Ctx, id: string, patch: Partial<ObjectState>): void {
  const cur = ctx.state.objects[id];
  if (!cur) return;
  ctx.state.objects[id] = { ...cur, ...patch };
}

export function emit(ctx: Ctx, kind: OutputKind, spans: Span[]): void {
  if (!ctx.quiet) ctx.out.push({ kind, spans });
}

export function emitMsg(ctx: Ctx, kind: OutputKind, template: string, args?: Record<string, FmtArg>): void {
  if (!ctx.quiet) ctx.out.push({ kind, spans: fmt(template, args) });
}

/** Print a pack Text (resolved against the current working state) as one block per paragraph. */
export function emitText(ctx: Ctx, kind: OutputKind, text: Text | undefined): void {
  if (ctx.quiet || text === undefined) return;
  const str = resolveText(ctx.pack, ctx.state, text);
  if (str !== null) ctx.out.push(...textBlocks(ctx.pack, kind, str));
}

export function emitBlocks(ctx: Ctx, blocks: OutputBlock[]): void {
  if (!ctx.quiet) ctx.out.push(...blocks);
}
