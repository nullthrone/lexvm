/**
 * Save game helpers: creation, validation of untrusted save files, file names.
 * Pure functions, no DOM and no storage access.
 */
import type { GameState, SaveGame } from "@lexvm/engine";

export const SAVE_FORMAT = "lexvm-save/1" as const;
export const SAVE_EXTENSION = ".lexsave.json";

/** What the web app persists per pack: the save plus UI metadata that is not part of GameState. */
export interface StoredSave {
  save: SaveGame;
  /** Revealed hint steps per hint id. */
  hints: Record<string, number>;
}

export function createSave(
  pack: { id: string; version: string },
  hash: string,
  state: GameState,
  log: readonly string[],
  savedAt: Date,
): SaveGame {
  return {
    format: SAVE_FORMAT,
    pack: { id: pack.id, version: pack.version, hash },
    state,
    log: [...log],
    savedAt: savedAt.toISOString(),
  };
}

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isRecordOf(value: unknown, check: (v: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(check);
}

function isObjectState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.location === "string" &&
    typeof value.open === "boolean" &&
    typeof value.locked === "boolean" &&
    typeof value.hidden === "boolean"
  );
}

/** Structural check of a GameState (types only; the engine owns the semantics). */
export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  const pack = value.pack;
  const dialogue = value.dialogue;
  return (
    value.v === 1 &&
    isRecord(pack) &&
    typeof pack.id === "string" &&
    typeof pack.version === "string" &&
    typeof value.turn === "number" &&
    Number.isInteger(value.turn) &&
    value.turn >= 0 &&
    typeof value.room === "string" &&
    isRecordOf(value.objects, isObjectState) &&
    isRecordOf(value.flags, (v) => typeof v === "boolean") &&
    isRecordOf(value.counters, (v) => typeof v === "number" && Number.isFinite(v)) &&
    isStringArray(value.visited) &&
    isStringArray(value.fired) &&
    isStringArray(value.chosen) &&
    (dialogue === null ||
      (isRecord(dialogue) && typeof dialogue.id === "string" && typeof dialogue.node === "string")) &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    (value.ended === null || typeof value.ended === "string")
  );
}

export type SaveValidation = { ok: true; save: SaveGame } | { ok: false; reason: string };

/** Validate an untrusted value (e.g. a parsed .lexsave.json file). */
export function validateSave(value: unknown): SaveValidation {
  if (!isRecord(value)) return { ok: false, reason: "not an object" };
  if (value.format !== SAVE_FORMAT) return { ok: false, reason: `unsupported format: ${String(value.format)}` };
  const pack = value.pack;
  if (!isRecord(pack) || typeof pack.id !== "string" || typeof pack.version !== "string") {
    return { ok: false, reason: "pack must have id and version" };
  }
  if (typeof pack.hash !== "string") return { ok: false, reason: "pack.hash missing" };
  if (!isGameState(value.state)) return { ok: false, reason: "state is not a valid game state" };
  if (value.state.pack.id !== pack.id) return { ok: false, reason: "state belongs to another pack" };
  if (!isStringArray(value.log)) return { ok: false, reason: "log must be a list of commands" };
  if (value.log.length > 100_000) return { ok: false, reason: "log too long" };
  if (typeof value.savedAt !== "string") return { ok: false, reason: "savedAt missing" };
  const save: SaveGame = {
    format: SAVE_FORMAT,
    pack: { id: pack.id, version: pack.version, hash: pack.hash },
    state: value.state,
    log: value.log,
    savedAt: value.savedAt,
  };
  return { ok: true, save };
}

/** Largest save file accepted (characters); real saves are a few KB, a long game's log well under 1 MB. */
export const MAX_SAVE_FILE = 5_000_000;

/** Parse save file text. Never throws. */
export function parseSaveFile(text: string): SaveValidation {
  if (text.length > MAX_SAVE_FILE) return { ok: false, reason: "file too large" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  return validateSave(json);
}

export function serializeSave(save: SaveGame): string {
  return `${JSON.stringify(save, null, 2)}\n`;
}

/** Clamp hint metadata read from storage to sane values. */
export function sanitizeHints(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(value)) return out;
  for (const [id, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isInteger(count) && count > 0 && count < 1000) out[id] = count;
  }
  return out;
}

export function validateStoredSave(value: unknown): StoredSave | null {
  if (!isRecord(value)) return null;
  const result = validateSave(value.save);
  if (!result.ok) return null;
  return { save: result.save, hints: sanitizeHints(value.hints) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** e.g. "locked-study-2026-10-23-1530.lexsave.json" (local time). */
export function saveFileName(packId: string, date: Date): string {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const safeId = packId.replace(/[^a-z0-9-]/g, "") || "lexvm";
  return `${safeId}-${stamp}${SAVE_EXTENSION}`;
}
