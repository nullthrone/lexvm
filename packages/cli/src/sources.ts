/** Reading content pack sources from disk. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { type CompileResult, compile, type SourceFile } from "@lexvm/engine";
import { UsageError } from "./args.ts";

const PRIMARY_FILES = ["pack.yaml", "pack.yml", "pack.json"];
const SOURCE_EXT = new Set([".yaml", ".yml", ".json"]);

export interface PackSource {
  /** The path as given (or the discovered pack directory). */
  label: string;
  /** Directory that diagnostic file names are relative to. */
  baseDir: string;
  files: SourceFile[];
}

export function isPackDir(dir: string): boolean {
  return PRIMARY_FILES.some((f) => existsSync(join(dir, f)));
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Sources of one pack: a pack directory (pack.yaml plus every other *.yaml,
 * *.yml and *.json file directly inside it, except compiled *.lexpack.json),
 * or a single .yaml / .lexpack.json file.
 */
export function readPackSource(target: string): PackSource {
  if (!existsSync(target)) throw new UsageError(`not found: ${target}`);
  if (isDirectory(target)) {
    if (!isPackDir(target)) throw new UsageError(`${target} is not a pack directory (no pack.yaml)`);
    const names = readdirSync(target)
      .filter((name) => SOURCE_EXT.has(extname(name)) && !name.endsWith(".lexpack.json") && !name.startsWith("."))
      .filter((name) => !isDirectory(join(target, name)))
      .sort();
    const files = names.map((name) => ({ name, text: readFileSync(join(target, name), "utf8") }));
    return { label: target, baseDir: target, files };
  }
  return {
    label: target,
    baseDir: dirname(target),
    files: [{ name: basename(target), text: readFileSync(target, "utf8") }],
  };
}

/**
 * Expand command line targets: a pack directory or file stands for itself; any
 * other directory stands for all pack directories directly inside it.
 */
export function expandTargets(targets: readonly string[]): string[] {
  const result: string[] = [];
  for (const target of targets) {
    if (!existsSync(target)) throw new UsageError(`not found: ${target}`);
    if (!isDirectory(target) || isPackDir(target)) {
      result.push(target);
      continue;
    }
    const packs = readdirSync(target)
      .sort()
      .map((name) => join(target, name))
      .filter((path) => isDirectory(path) && isPackDir(path));
    if (packs.length === 0) throw new UsageError(`no pack directories (with pack.yaml) found in ${target}`);
    result.push(...packs);
  }
  return result;
}

export function compileSource(source: PackSource): CompileResult {
  return compile(source.files);
}
