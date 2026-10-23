/**
 * Built-in pack catalog (`packs/index.json`), written by `lexvm build packs`.
 *
 * Format:
 *   { "format": "lexvm-catalog/1",
 *     "packs": [{ id, title, subtitle?, description, language, version, playtime?,
 *                 author, license, file, hash, size? }] }
 *
 * `file` is a path relative to the catalog (e.g. "locked-study.lexpack.json").
 * The catalog is data from the network: every field is checked and invalid
 * entries are skipped rather than trusted.
 */

export const CATALOG_FORMAT = "lexvm-catalog/1";

export interface CatalogEntry {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  language: string;
  version: string;
  playtime?: number;
  author: string;
  license: string;
  /** Pack file path relative to the catalog. */
  file: string;
  hash: string;
  size?: number;
}

export type CatalogResult = { ok: true; entries: CatalogEntry[]; skipped: number } | { ok: false; error: string };

const PACK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A relative path without scheme, host, absolute root, backslashes or `..` segments. */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > 200) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("?") || path.includes("#")) {
    return false;
  }
  return path.split("/").every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== "." && segment !== "..");
}

function str(value: unknown, max = 2000): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : undefined;
}

function parseEntry(raw: unknown): CatalogEntry | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 100);
  const title = str(r.title, 200);
  const file = str(r.file, 200);
  if (!id || !PACK_ID.test(id) || !title || !file || !isSafeRelativePath(file)) return null;
  const language = str(r.language, 35);
  const entry: CatalogEntry = {
    id,
    title,
    description: str(r.description) ?? "",
    language: language && LANGUAGE.test(language) ? language : "und",
    version: str(r.version, 50) ?? "0.0.0",
    author: str(r.author, 300) ?? "",
    license: str(r.license, 100) ?? "",
    file,
    hash: str(r.hash, 200) ?? "",
  };
  const subtitle = str(r.subtitle, 300);
  if (subtitle) entry.subtitle = subtitle;
  if (typeof r.playtime === "number" && Number.isInteger(r.playtime) && r.playtime > 0 && r.playtime < 10_000) {
    entry.playtime = r.playtime;
  }
  if (typeof r.size === "number" && Number.isFinite(r.size) && r.size >= 0) entry.size = r.size;
  return entry;
}

export function parseCatalog(json: unknown): CatalogResult {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "catalog is not an object" };
  }
  const root = json as Record<string, unknown>;
  if (root.format !== CATALOG_FORMAT) {
    return { ok: false, error: `unsupported catalog format: ${String(root.format)}` };
  }
  if (!Array.isArray(root.packs)) return { ok: false, error: "catalog.packs is not a list" };
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const raw of root.packs) {
    const entry = parseEntry(raw);
    if (!entry || seen.has(entry.id)) {
      skipped += 1;
      continue;
    }
    seen.add(entry.id);
    entries.push(entry);
  }
  return { ok: true, entries, skipped };
}
