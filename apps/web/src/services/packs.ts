/**
 * The library: built-in packs (catalog + pack files shipped with the app) and
 * packs imported by the player (stored on the device). Every pack is validated
 * with the engine's loadPack before use; nothing loaded here is trusted.
 */

import { bundled } from "virtual:lexvm-builtin-packs";
import { loadPack, type Pack, packHash } from "@lexvm/engine";
import { type CatalogEntry, isMinutes, parseCatalog } from "../logic/catalog.ts";
import { deleteSave } from "./saves.ts";
import { kvDelete, kvGet, kvKeys, kvSet } from "./storage.ts";

export type PackSource = "builtin" | "imported";

export interface LibraryEntry {
  /** Stable key for routes and saves: "builtin:<id>" or "imported:<id>". */
  key: string;
  source: PackSource;
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  language: string;
  version: string;
  playtime?: number;
  /** Play time estimate (catalog for built-in packs, computed at import for imported ones). */
  estimatedMinutes?: number;
  author: string;
  license: string;
  /** Built-in only: pack file relative to the catalog. */
  file?: string;
}

/** What is stored for an imported pack. */
export interface ImportedPackRecord {
  format: "lexvm-imported/1";
  importedAt: string;
  /** The compiled, normalised pack. Validated again on every load. */
  pack: unknown;
  /** Rounded expected play time, computed at import when the walkthrough reaches a win. */
  estimatedMinutes?: number;
}

const CATALOG_PATH = "packs/index.json";

export function libraryKey(source: PackSource, id: string): string {
  return `${source}:${id}`;
}

export function parseLibraryKey(key: string): { source: PackSource; id: string } | null {
  const match = /^(builtin|imported):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(key);
  if (!match) return null;
  return { source: match[1] as PackSource, id: match[2] ?? "" };
}

function catalogUrl(): URL {
  return new URL(CATALOG_PATH, document.baseURI);
}

export type CatalogState = { status: "ok"; entries: CatalogEntry[] } | { status: "error"; error: string };

let catalogPromise: Promise<CatalogState> | null = null;

async function fetchCatalog(): Promise<CatalogState> {
  try {
    let json: unknown;
    if (__LEXVM_SINGLEFILE__) {
      if (!bundled) return { status: "error", error: "no bundled packs" };
      json = bundled.catalog;
    } else {
      const response = await fetch(catalogUrl());
      if (!response.ok) return { status: "error", error: `HTTP ${response.status}` };
      json = await response.json();
    }
    const parsed = parseCatalog(json);
    return parsed.ok ? { status: "ok", entries: parsed.entries } : { status: "error", error: parsed.error };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

export function loadCatalog(force = false): Promise<CatalogState> {
  if (force || !catalogPromise) catalogPromise = fetchCatalog();
  return catalogPromise;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Library metadata of an imported pack record (read from storage, so checked field by field). */
function importedEntry(record: unknown): LibraryEntry | null {
  if (typeof record !== "object" || record === null) return null;
  const pack = (record as ImportedPackRecord).pack;
  if (typeof pack !== "object" || pack === null) return null;
  const p = pack as Record<string, unknown>;
  const id = str(p.id);
  const title = str(p.title);
  if (!id || !title || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return null;
  const entry: LibraryEntry = {
    key: libraryKey("imported", id),
    source: "imported",
    id,
    title,
    description: str(p.description) ?? "",
    language: str(p.language) ?? "und",
    version: str(p.version) ?? "0.0.0",
    author: str(p.author) ?? "",
    license: str(p.license) ?? "",
  };
  const subtitle = str(p.subtitle);
  if (subtitle) entry.subtitle = subtitle;
  if (isMinutes(p.playtime)) entry.playtime = p.playtime;
  const estimate = (record as ImportedPackRecord).estimatedMinutes;
  if (isMinutes(estimate)) entry.estimatedMinutes = estimate;
  return entry;
}

export async function listImported(): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = [];
  for (const id of (await kvKeys("packs")).sort()) {
    const entry = importedEntry(await kvGet("packs", id));
    if (entry) entries.push(entry);
  }
  return entries;
}

export interface Library {
  entries: LibraryEntry[];
  catalogError: string | null;
}

function builtinEntry(e: CatalogEntry): LibraryEntry {
  const entry: LibraryEntry = {
    key: libraryKey("builtin", e.id),
    source: "builtin",
    id: e.id,
    title: e.title,
    description: e.description,
    language: e.language,
    version: e.version,
    author: e.author,
    license: e.license,
    file: e.file,
  };
  if (e.subtitle) entry.subtitle = e.subtitle;
  if (e.playtime) entry.playtime = e.playtime;
  if (e.estimatedMinutes) entry.estimatedMinutes = e.estimatedMinutes;
  return entry;
}

export async function loadLibrary(forceCatalog = false): Promise<Library> {
  const [catalog, imported] = await Promise.all([loadCatalog(forceCatalog), listImported()]);
  const builtin = catalog.status === "ok" ? catalog.entries.map(builtinEntry) : [];
  return { entries: [...builtin, ...imported], catalogError: catalog.status === "error" ? catalog.error : null };
}

export async function findEntry(key: string): Promise<LibraryEntry | null> {
  const parsed = parseLibraryKey(key);
  if (!parsed) return null;
  if (parsed.source === "imported") return importedEntry(await kvGet("packs", parsed.id));
  const catalog = await loadCatalog();
  if (catalog.status !== "ok") {
    // Retry once: the first attempt may have failed while offline.
    const retry = await loadCatalog(true);
    if (retry.status !== "ok") return null;
    return retry.entries.filter((e) => e.id === parsed.id).map(builtinEntry)[0] ?? null;
  }
  return catalog.entries.filter((e) => e.id === parsed.id).map(builtinEntry)[0] ?? null;
}

export interface LoadedPack {
  pack: Pack;
  hash: string;
}

const packCache = new Map<string, LoadedPack>();

async function readBuiltinJson(entry: LibraryEntry): Promise<unknown> {
  const file = entry.file ?? "";
  if (__LEXVM_SINGLEFILE__) {
    if (!bundled || !Object.hasOwn(bundled.packs, file)) throw new Error(`pack file not bundled: ${file}`);
    return bundled.packs[file];
  }
  const response = await fetch(new URL(file, catalogUrl()));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Load and validate a pack. Throws on network errors or invalid packs (PackError). */
export async function loadEntryPack(entry: LibraryEntry): Promise<LoadedPack> {
  const cached = packCache.get(entry.key);
  if (cached) return cached;
  let json: unknown;
  if (entry.source === "builtin") {
    json = await readBuiltinJson(entry);
  } else {
    const record = (await kvGet("packs", entry.id)) as ImportedPackRecord | undefined;
    if (!record) throw new Error("imported pack not found");
    json = record.pack;
  }
  const pack = loadPack(json);
  const loaded = { pack, hash: packHash(pack) };
  packCache.set(entry.key, loaded);
  return loaded;
}

export async function importedPackExists(id: string): Promise<boolean> {
  return (await kvGet("packs", id)) !== undefined;
}

/** Store an imported (compiled and validated) pack with its play time estimate. Returns false if storage failed. */
export async function storeImportedPack(pack: Pack, now: Date, estimatedMinutes?: number): Promise<boolean> {
  const record: ImportedPackRecord = { format: "lexvm-imported/1", importedAt: now.toISOString(), pack };
  if (isMinutes(estimatedMinutes)) record.estimatedMinutes = estimatedMinutes;
  const ok = await kvSet("packs", pack.id, record);
  packCache.delete(libraryKey("imported", pack.id));
  return ok;
}

export async function deleteImportedPack(id: string): Promise<void> {
  const key = libraryKey("imported", id);
  packCache.delete(key);
  await kvDelete("packs", id);
  await deleteSave(key);
}
