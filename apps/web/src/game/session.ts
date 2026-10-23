/**
 * A running game: pack, current state, command log, undo stack and hint
 * metadata. DOM-free; the engine is injected so this is unit-testable with a
 * fake engine.
 */
import type { Command, GameState, HintView, OutputBlock, Pack, SaveGame, StepResult, View } from "@lexvm/engine";
import { createSave, type StoredSave } from "../logic/saves.ts";

/** The subset of @lexvm/engine a session needs. */
export interface EngineApi {
  newGame(pack: Pack): { state: GameState; output: OutputBlock[] };
  step(pack: Pack, state: GameState, command: Command): StepResult;
  view(pack: Pack, state: GameState): View;
  hint(pack: Pack, state: GameState): HintView | null;
  formatCommand(command: Command): string;
  parseCanonical(text: string): Command | null;
  /** Problems of a state from outside the engine (a save); empty when it is a valid state of the pack. */
  validateState(pack: Pack, state: GameState): string[];
}

export const UNDO_LIMIT = 100;

export interface ReplayResult {
  state: GameState;
  /** The log entries that were applied. */
  log: string[];
  /** Output per turn: [newGame output, step 1 output, …]. */
  turns: OutputBlock[][];
  applied: number;
  total: number;
  /** Index of the first log entry that could not be applied, or null if all were applied. */
  stoppedAt: number | null;
}

/** Start a new game and replay a command log. Stops at the first malformed or rejected command. */
export function replayLog(engine: EngineApi, pack: Pack, log: readonly string[]): ReplayResult {
  const start = engine.newGame(pack);
  let state = start.state;
  const turns: OutputBlock[][] = [start.output];
  const applied: string[] = [];
  let stoppedAt: number | null = null;
  for (let i = 0; i < log.length; i += 1) {
    const command = engine.parseCanonical(log[i] ?? "");
    if (!command || state.ended) {
      stoppedAt = i;
      break;
    }
    const result = engine.step(pack, state, command);
    if (result.status !== "ok") {
      stoppedAt = i;
      break;
    }
    state = result.state;
    turns.push(result.output);
    applied.push(log[i] ?? "");
  }
  return { state, log: applied, turns, applied: applied.length, total: log.length, stoppedAt };
}

/** JSON with sorted object keys, for comparing plain-data states. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

export function sameState(a: GameState, b: GameState): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

interface UndoEntry {
  state: GameState;
  logLength: number;
}

export class GameSession {
  readonly engine: EngineApi;
  readonly pack: Pack;
  readonly hash: string;
  state: GameState;
  log: string[];
  hints: Record<string, number>;
  private undoStack: UndoEntry[] = [];

  constructor(
    engine: EngineApi,
    pack: Pack,
    hash: string,
    state: GameState,
    log: string[] = [],
    hints: Record<string, number> = {},
  ) {
    this.engine = engine;
    this.pack = pack;
    this.hash = hash;
    this.state = state;
    this.log = log;
    this.hints = hints;
  }

  static start(engine: EngineApi, pack: Pack, hash: string): { session: GameSession; output: OutputBlock[] } {
    const { state, output } = engine.newGame(pack);
    return { session: new GameSession(engine, pack, hash, state), output };
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  view(): View {
    return this.engine.view(this.pack, this.state);
  }

  hint(): HintView | null {
    return this.engine.hint(this.pack, this.state);
  }

  /** Run a command without committing it (the engine is pure). */
  preview(command: Command): StepResult {
    return this.engine.step(this.pack, this.state, command);
  }

  /** Run a command. Accepted commands are logged and can be undone; rejected ones change nothing. */
  exec(command: Command): StepResult {
    const result = this.engine.step(this.pack, this.state, command);
    if (result.status === "ok") {
      this.undoStack.push({ state: this.state, logLength: this.log.length });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.splice(0, this.undoStack.length - UNDO_LIMIT);
      this.state = result.state;
      this.log = [...this.log, this.engine.formatCommand(command)];
    }
    return result;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.state = entry.state;
    this.log = this.log.slice(0, entry.logLength);
    return true;
  }

  restart(): OutputBlock[] {
    const { state, output } = this.engine.newGame(this.pack);
    this.state = state;
    this.log = [];
    this.undoStack = [];
    return output;
  }

  /** Replace the state with a replayed one (e.g. after loading a save). Clears undo history. */
  adopt(state: GameState, log: string[]): void {
    this.state = state;
    this.log = [...log];
    this.undoStack = [];
  }

  revealedHints(id: string): number {
    // Own properties only: a hint id such as "constructor" must not find Object's constructor.
    return Object.hasOwn(this.hints, id) ? (this.hints[id] ?? 0) : 0;
  }

  /** Remember how many steps of hint `id` have been revealed (never decreases). */
  setRevealed(id: string, count: number): void {
    if (!Number.isInteger(count) || count <= this.revealedHints(id)) return;
    this.hints = { ...this.hints, [id]: count };
  }

  toSave(now: Date): SaveGame {
    return createSave(this.pack, this.hash, this.state, this.log, now);
  }

  toStored(now: Date): StoredSave {
    return { save: this.toSave(now), hints: { ...this.hints } };
  }
}

export type RestoreResult =
  | { kind: "restored"; session: GameSession; turns: OutputBlock[][] }
  /** The log could not reproduce the saved state; the saved state is used without a transcript. */
  | { kind: "state-only"; session: GameSession }
  /**
   * The log could not reproduce the saved state and that state is not a valid
   * state of the pack (unknown ids, a dialogue without options): the game
   * continues from what the log reproduces.
   */
  | { kind: "repaired"; session: GameSession; turns: OutputBlock[][]; problems: string[] }
  /** The pack changed since the save was made; the caller should offer a replay. */
  | { kind: "pack-changed"; save: SaveGame };

/** Restore a stored save for `pack` (whose content hash is `hash`). */
export function restoreSession(engine: EngineApi, pack: Pack, hash: string, stored: StoredSave): RestoreResult {
  const { save } = stored;
  if (save.pack.hash !== hash) return { kind: "pack-changed", save };
  const replay = replayLog(engine, pack, save.log);
  const replayed = () => new GameSession(engine, pack, hash, replay.state, replay.log, stored.hints);
  if (replay.stoppedAt === null && sameState(replay.state, save.state)) {
    return { kind: "restored", session: replayed(), turns: replay.turns };
  }
  // The saved state is untrusted (a save file, or storage written by another page of the same origin).
  const problems = engine.validateState(pack, save.state);
  if (problems.length > 0) return { kind: "repaired", session: replayed(), turns: replay.turns, problems };
  return { kind: "state-only", session: new GameSession(engine, pack, hash, save.state, [...save.log], stored.hints) };
}
