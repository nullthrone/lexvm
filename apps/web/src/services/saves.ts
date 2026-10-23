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

/** This tab (page load): autosaves record which tab wrote them. */
export const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Writes are serialised per key so an older save never overwrites a newer one. */
export function writeSave(key: string, stored: StoredSave, writer = TAB_ID): Promise<boolean> {
  return serialised(key, () => kvSet("saves", key, { ...stored, writer }));
}

export type WriteResult = "written" | "conflict" | "failed";

/**
 * Write the save unless another tab or window has played this game on: the
 * stored save must be the one this tab started from (`baseline`, its
 * `savedAt`; null: there was none) or one this tab wrote. Two tabs on the
 * same game would otherwise silently overwrite each other's progress; the
 * caller asks the player instead. A failed write leaves the tab's own save in
 * place, so it never looks like another tab's.
 */
export function writeSaveIfCurrent(
  key: string,
  stored: StoredSave,
  baseline: string | null,
  writer = TAB_ID,
): Promise<WriteResult> {
  return serialised(key, async () => {
    const current = validateStoredSave(await kvGet("saves", key));
    if (current !== null && current.writer !== writer && current.save.savedAt !== baseline) return "conflict";
    return (await kvSet("saves", key, { ...stored, writer })) ? "written" : "failed";
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
