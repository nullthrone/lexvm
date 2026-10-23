import type { CompileResult, SourceFile } from "./types.ts";

/**
 * Compile pack sources (one or more YAML or JSON files) into a validated Pack.
 * Files are merged by top-level key: maps are merged (duplicate keys are an
 * error), arrays are concatenated in file order (pack.yaml first, then the
 * remaining files sorted by name), scalars may appear in one file only.
 * Never throws on bad input; problems are reported as diagnostics.
 */
export function compile(_files: SourceFile[]): CompileResult {
  throw new Error("not implemented: compile");
}
