import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { estimatePlaytime, type Pack, packHash, runWalkthrough } from "@lexvm/engine";
import { flag, parseArgs, stringOption, UsageError } from "../args.ts";
import { compileSource, expandTargets, readPackSource } from "../sources.ts";
import { color, err, formatDiagnostic, out, summarizeCounts } from "../term.ts";

export const BUILD_HELP = `Usage: lexvm build <packsDir|packDir>... --out <dir>

Compile content packs to <out>/<id>.lexpack.json (minified, normalised JSON)
and write the catalog <out>/index.json. A directory without pack.yaml stands
for all pack directories directly inside it. Packs with errors are reported
and not written. Catalog entries carry estimatedMinutes, the play time
estimate of "lexvm check" (rounded), when the walkthrough reaches a win.

Options:
  --out <dir>      Output directory (required)
  -h, --help       Show this help

Exit codes: 0 all packs built, 1 errors found, 2 usage error.`;

export const CATALOG_FORMAT = "lexvm-catalog/1";

export interface CatalogEntry {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  language: string;
  version: string;
  playtime?: number;
  /** Rounded expected play time from the estimator; omitted when the walkthrough does not reach a win. */
  estimatedMinutes?: number;
  author: string;
  license: string;
  /** File name relative to index.json. */
  file: string;
  hash: string;
  /** Size of the file in bytes. */
  size: number;
}

export interface Catalog {
  format: typeof CATALOG_FORMAT;
  packs: CatalogEntry[];
}

/** Rounded expected minutes, or undefined when the walkthrough does not reach a win (the estimate would be partial). */
export function estimatedMinutes(pack: Pack): number | undefined {
  try {
    if (!runWalkthrough(pack).ok) return undefined;
    return Math.max(1, Math.round(estimatePlaytime(pack).minutes.expected));
  } catch {
    return undefined;
  }
}

function catalogEntry(pack: Pack, file: string, hash: string, size: number): CatalogEntry {
  // Key order is the documented order; undefined optional fields are dropped by JSON.stringify.
  return {
    id: pack.id,
    title: pack.title,
    subtitle: pack.subtitle,
    description: pack.description,
    language: pack.language,
    version: pack.version,
    playtime: pack.playtime,
    estimatedMinutes: estimatedMinutes(pack),
    author: pack.author,
    license: pack.license,
    file,
    hash,
    size,
  };
}

/** Catalog order: by language, then title, then id (locale-independent, deterministic). */
export function sortCatalog(entries: CatalogEntry[]): CatalogEntry[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...entries].sort(
    (a, b) => cmp(a.language, b.language) || cmp(a.title.toLowerCase(), b.title.toLowerCase()) || cmp(a.id, b.id),
  );
}

export function runBuild(argv: string[]): number {
  const args = parseArgs(argv, { out: { type: "string", short: "o" }, help: { type: "boolean", short: "h" } });
  if (flag(args, "help")) {
    out(BUILD_HELP);
    return 0;
  }
  const outDir = stringOption(args, "out");
  if (args.positionals.length === 0) throw new UsageError("build needs at least one pack or packs directory");
  if (outDir === undefined) throw new UsageError("build needs --out <dir>");

  const entries: CatalogEntry[] = [];
  const seen = new Map<string, string>();
  let failed = false;
  for (const target of expandTargets(args.positionals)) {
    const source = readPackSource(target);
    const result = compileSource(source);
    for (const d of result.diagnostics) {
      if (d.severity !== "info") out(formatDiagnostic(d, source.baseDir, target));
    }
    const pack = result.pack;
    if (pack === null) {
      failed = true;
      out(`${color.red("FAILED")}  ${target}: ${summarizeCounts(result.diagnostics)}`);
      continue;
    }
    const previous = seen.get(pack.id);
    if (previous !== undefined) {
      failed = true;
      err(`${color.red("FAILED")}  ${target}: pack id "${pack.id}" is also used by ${previous}`);
      continue;
    }
    seen.set(pack.id, target);
    let hash: string;
    try {
      hash = packHash(pack);
    } catch (e) {
      failed = true;
      err(`${color.red("FAILED")}  ${target}: cannot hash pack: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const file = `${pack.id}.lexpack.json`;
    const json = JSON.stringify(pack);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, file), json);
    const size = Buffer.byteLength(json);
    entries.push(catalogEntry(pack, file, hash, size));
    out(`${color.green("built")}  ${join(outDir, file)} (${size} bytes): ${summarizeCounts(result.diagnostics)}`);
  }
  const catalog: Catalog = { format: CATALOG_FORMAT, packs: sortCatalog(entries) };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  out(
    `${color.green("wrote")}  ${join(outDir, "index.json")} (${entries.length} pack${entries.length === 1 ? "" : "s"})`,
  );
  return failed ? 1 : 0;
}
