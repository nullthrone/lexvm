/** Autosaves per library entry, persisted with the key-value storage. */
import { type StoredSave, validateStoredSave } from "../logic/saves.ts";
import { kvDelete, kvGet, kvKeys, kvSet } from "./storage.ts";

const pending = new Map<string, Promise<boolean>>();

export async function readSave(key: string): Promise<StoredSave | null> {
  await pending.get(key);
  return validateStoredSave(await kvGet("saves", key));
}

/** Run storage work for `key` after the earlier work for it (within this tab). */
function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve(true);
  const next = previous.then(work);
  const done = next.then(
    () => true,
    () => false,
  );
  pending.set(key, done);
  void done.finally(() => {
    if (pending.get(key) === done) pending.delete(key);
  });
  return next;
}

/** Writes are serialised per key so an older save never overwrites a newer one. */
export function writeSave(key: string, stored: StoredSave): Promise<boolean> {
  return serialised(key, () => kvSet("saves", key, stored));
}

export type WriteResult = "written" | "conflict" | "failed";

/**
 * Write the save unless another tab or window has written this game since
 * this tab last read or wrote it. `expected` is the `savedAt` of that save
 * (null: there was none). Two tabs on the same game would otherwise silently
 * overwrite each other's progress; the caller asks the player instead.
 */
export function writeSaveIfCurrent(key: string, stored: StoredSave, expected: string | null): Promise<WriteResult> {
  return serialised(key, async () => {
    const current = validateStoredSave(await kvGet("saves", key));
    if (current !== null && current.save.savedAt !== expected) return "conflict";
    return (await kvSet("saves", key, stored)) ? "written" : "failed";
  });
}

export async function deleteSave(key: string): Promise<void> {
  await pending.get(key);
  await kvDelete("saves", key);
}

/** All valid saves by library key. */
export async function listSaves(): Promise<Map<string, StoredSave>> {
  const out = new Map<string, StoredSave>();
  for (const key of await kvKeys("saves")) {
    const stored = validateStoredSave(await kvGet("saves", key));
    if (stored) out.set(key, stored);
  }
  return out;
}
