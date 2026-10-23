/**
 * Merging of several parsed source files into one pack value (spec section 1),
 * keeping track of which file defined what so that diagnostics on the merged
 * value can be mapped back to file and line.
 */
import { lineOf, type ParsedSource } from "./compile-yaml.ts";
import { formatPath, type PathSegment } from "./diagnostics.ts";
import type { Diagnostic } from "./types.ts";

type Origin =
  | { kind: "map"; first: number; owners: Map<string, number> }
  | { kind: "array"; parts: Array<{ file: number; start: number; length: number }> }
  | { kind: "scalar"; file: number };

export interface SourceLocation {
  file?: string;
  line?: number;
}

export interface MergeResult {
  value: Record<string, unknown>;
  diagnostics: Diagnostic[];
  /** Source file and line of the element at `path` in the merged value. */
  locate(path: readonly PathSegment[]): SourceLocation;
}

function isPlainMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Assign without ever invoking the __proto__ setter. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function kindName(value: unknown): string {
  if (Array.isArray(value)) return "a list";
  if (isPlainMap(value)) return "a map";
  return "a single value";
}

export function mergeSources(sources: readonly ParsedSource[]): MergeResult {
  const value: Record<string, unknown> = {};
  const origins = new Map<string, Origin>();
  const diagnostics: Diagnostic[] = [];

  const where = (file: number, path: PathSegment[]): string => {
    const line = lineOf(sources[file]!, path);
    return line === undefined ? sources[file]!.name : `${sources[file]!.name} (line ${line})`;
  };

  const init = (key: string, v: unknown, file: number): void => {
    if (isPlainMap(v)) {
      const copy: Record<string, unknown> = {};
      const owners = new Map<string, number>();
      for (const [sub, subValue] of Object.entries(v)) {
        setOwn(copy, sub, subValue);
        owners.set(sub, file);
      }
      setOwn(value, key, copy);
      origins.set(key, { kind: "map", first: file, owners });
    } else if (Array.isArray(v)) {
      setOwn(value, key, [...v]);
      origins.set(key, { kind: "array", parts: [{ file, start: 0, length: v.length }] });
    } else {
      setOwn(value, key, v);
      origins.set(key, { kind: "scalar", file });
    }
  };

  sources.forEach((source, file) => {
    const top = source.value;
    if (top === undefined || top === null) return; // empty file
    if (!isPlainMap(top)) {
      diagnostics.push({
        severity: "error",
        code: "compile.not-a-map",
        path: "",
        file: source.name,
        line: lineOf(source, []),
        message: `The top level of ${source.name} must be a mapping of pack keys (format, id, rooms, objects, …), got ${kindName(top)}.`,
      });
      return;
    }
    for (const [key, v] of Object.entries(top)) {
      const origin = origins.get(key);
      const current = value[key];
      if (origin === undefined || current === null || current === undefined) {
        init(key, v, file);
        continue;
      }
      if (v === null || v === undefined) continue; // an empty section adds nothing
      const firstFile = origin.kind === "map" ? origin.first : origin.kind === "array" ? origin.parts[0]!.file : origin.file;
      if (origin.kind === "map" && isPlainMap(v) && isPlainMap(current)) {
        for (const [sub, subValue] of Object.entries(v)) {
          const owner = origin.owners.get(sub);
          if (owner !== undefined) {
            diagnostics.push({
              severity: "error",
              code: "compile.duplicate-key",
              path: formatPath([key, sub]),
              file: source.name,
              line: lineOf(source, [key, sub]),
              message: `"${formatPath([key, sub])}" is defined in both ${where(owner, [key, sub])} and ${where(file, [key, sub])}. Each entry may be defined in one file only: remove or rename one of them.`,
            });
            continue;
          }
          setOwn(current, sub, subValue);
          origin.owners.set(sub, file);
        }
      } else if (origin.kind === "array" && Array.isArray(v) && Array.isArray(current)) {
        origin.parts.push({ file, start: current.length, length: v.length });
        current.push(...v);
      } else if (origin.kind === "scalar" && !isPlainMap(v) && !Array.isArray(v)) {
        diagnostics.push({
          severity: "error",
          code: "compile.duplicate-key",
          path: key,
          file: source.name,
          line: lineOf(source, [key]),
          message: `"${key}" is set in both ${where(firstFile, [key])} and ${where(file, [key])}. Top-level values such as title or version may appear in one file only.`,
        });
      } else {
        diagnostics.push({
          severity: "error",
          code: "compile.type-mismatch",
          path: key,
          file: source.name,
          line: lineOf(source, [key]),
          message: `"${key}" is ${kindName(current)} in ${where(firstFile, [key])} but ${kindName(v)} in ${where(file, [key])}. Use the same form in every file (maps are merged, lists are concatenated).`,
        });
      }
    }
  });

  const locate = (path: readonly PathSegment[]): SourceLocation => {
    const primary = sources[0]?.name;
    const top = path[0];
    if (top === undefined) return { file: primary };
    const origin = origins.get(String(top));
    if (origin === undefined) return { file: primary };
    let file: number;
    let local: PathSegment[] = [...path];
    if (origin.kind === "map") {
      const sub = path[1];
      file = sub !== undefined ? (origin.owners.get(String(sub)) ?? origin.first) : origin.first;
      if (sub !== undefined && !origin.owners.has(String(sub))) local = [top];
    } else if (origin.kind === "array") {
      const index = path[1];
      const part =
        typeof index === "number"
          ? origin.parts.find((p) => index >= p.start && index < p.start + p.length)
          : undefined;
      if (part === undefined || typeof index !== "number") {
        file = origin.parts[0]!.file;
        local = [top];
      } else {
        file = part.file;
        local = [top, index - part.start, ...path.slice(2)];
      }
    } else {
      file = origin.file;
    }
    const source = sources[file]!;
    return { file: source.name, line: lineOf(source, local) };
  };

  return { value, diagnostics, locate };
}
