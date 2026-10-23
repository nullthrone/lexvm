/** Autosaves per library entry, persisted with the key-value storage. */
import { type StoredSave, validateStoredSave } from "../logic/saves.ts";
import { kvDelete, kvGet, kvKeys, kvSet } from "./storage.ts";

const pending = new Map<string, Promise<boolean>>();

export async function readSave(key: string): Promise<StoredSave | null> {
  await pending.get(key);
  return validateStoredSave(await kvGet("saves", key));
}

/** Writes are serialised per key so an older save never overwrites a newer one. */
export function writeSave(key: string, stored: StoredSave): Promise<boolean> {
  const previous = pending.get(key) ?? Promise.resolve(true);
  const next = previous.then(() => kvSet("saves", key, stored));
  pending.set(key, next);
  void next.finally(() => {
    if (pending.get(key) === next) pending.delete(key);
  });
  return next;
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
