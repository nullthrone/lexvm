/** Content hashes for packs and canonical keys for game states. */
import type { Pack } from "./schema.ts";
import type { GameState } from "./types.ts";

/** JSON with object keys sorted recursively and undefined values dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(",")}}`;
}

/**
 * 64-bit hash of a string as 16 hex chars: two FNV-1a 32-bit lanes with
 * different offset bases; the second lane also mixes in the position so the
 * lanes do not collide together.
 */
export function hash64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c ^ (i & 0xff), 0x01000193);
  }
  // Final avalanche (murmur3 fmix32) so short inputs spread over all bits.
  return hex32(fmix(h1)) + hex32(fmix(h2 ^ text.length));
}

function fmix(h: number): number {
  let x = h ^ (h >>> 16);
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Stable content hash of a pack (hex), used to bind save games to pack contents. */
export function packHash(pack: Pack): string {
  return hash64(canonicalJson(pack));
}

function sortedKeys(obj: object): string[] {
  const keys = Object.keys(obj);
  for (let i = 1; i < keys.length; i++) {
    if ((keys[i - 1] as string) > (keys[i] as string)) return keys.sort();
  }
  return keys;
}

function sortedCopy(list: readonly string[]): string[] {
  return list.length < 2 ? list.slice() : list.slice().sort();
}

/**
 * Canonical key of the logical state (excludes `turn`), used for
 * deduplication. Objects, flags and counters in sorted key order; visited,
 * fired and chosen sorted (their order carries no meaning).
 */
export function stateKey(state: GameState): string {
  const objects: unknown[] = [];
  for (const id of sortedKeys(state.objects)) {
    const o = state.objects[id];
    if (o) objects.push(id, o.location, (o.open ? 1 : 0) | (o.locked ? 2 : 0) | (o.hidden ? 4 : 0));
  }
  const flags: unknown[] = [];
  for (const id of sortedKeys(state.flags)) flags.push(id, state.flags[id] ? 1 : 0);
  const counters: unknown[] = [];
  for (const id of sortedKeys(state.counters)) counters.push(id, state.counters[id]);
  return JSON.stringify([
    state.v,
    state.pack.id,
    state.pack.version,
    state.room,
    objects,
    flags,
    counters,
    sortedCopy(state.visited),
    sortedCopy(state.fired),
    sortedCopy(state.chosen),
    state.dialogue ? [state.dialogue.id, state.dialogue.node] : null,
    state.score,
    state.ended,
  ]);
}
