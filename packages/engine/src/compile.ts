import { analyze } from "./analyze.ts";
import { convertIssues } from "./compile-issues.ts";
import { mergeSources } from "./compile-merge.ts";
import { type ParsedSource, parseSource } from "./compile-yaml.ts";
import { formatPath, hasErrors, parsePath, sortDiagnostics } from "./diagnostics.ts";
import { type Pack, PackSchema } from "./schema.ts";
import type { CompileResult, Diagnostic, SourceFile } from "./types.ts";

const PRIMARY = /^pack\.(ya?ml|json)$/;

/** pack.yaml first, then the remaining files sorted by name (code point order, locale independent). */
function orderFiles(files: readonly SourceFile[]): SourceFile[] {
  return [...files].sort((a, b) => {
    const pa = PRIMARY.test(a.name) ? 0 : 1;
    const pb = PRIMARY.test(b.name) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * Compile pack sources (one or more YAML or JSON files) into a validated Pack.
 * Files are merged by top-level key: maps are merged (duplicate keys are an
 * error), arrays are concatenated in file order (pack.yaml first, then the
 * remaining files sorted by name), scalars may appear in one file only.
 * Never throws on bad input; problems are reported as diagnostics.
 */
export function compile(files: SourceFile[]): CompileResult {
  try {
    return compileUnchecked(files);
  } catch (e) {
    // Pathological input (e.g. nesting deep enough to exhaust the stack) must not crash callers.
    return {
      pack: null,
      diagnostics: [
        {
          severity: "error",
          code: "compile.failed",
          path: "",
          message: `The pack could not be compiled: ${e instanceof Error ? e.message : String(e)}. Simplify deeply nested conditions or effects.`,
        },
      ],
    };
  }
}

function compileUnchecked(files: SourceFile[]): CompileResult {
  if (files.length === 0) {
    return {
      pack: null,
      diagnostics: [
        { severity: "error", code: "compile.no-files", path: "", message: "No source files given. A pack needs pack.yaml." },
      ],
    };
  }

  // 1. Parse every file. YAML errors make the rest meaningless, so stop there.
  const sources: ParsedSource[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const file of orderFiles(files)) {
    const parsed = parseSource(file);
    sources.push(parsed.source);
    diagnostics.push(...parsed.diagnostics);
  }
  if (hasErrors(diagnostics)) return { pack: null, diagnostics };

  // 2. Merge by top-level key.
  const merged = mergeSources(sources);
  diagnostics.push(...merged.diagnostics);

  // 3. Schema validation and normalisation.
  const parsed = PackSchema.safeParse(merged.value);
  if (!parsed.success) {
    const schemaDiagnostics = convertIssues(parsed.error.issues, merged.value).map((raw): Diagnostic => {
      const where = merged.locate(raw.segments);
      return withLocation(
        { severity: raw.severity, code: raw.code, path: formatPath(raw.segments), message: raw.message },
        where.file,
        where.line,
      );
    });
    diagnostics.push(...sortDiagnostics(schemaDiagnostics));
    return { pack: null, diagnostics };
  }
  const pack: Pack = parsed.data;

  // 4. Semantic analysis, mapped back to the sources.
  for (const d of analyze(pack)) {
    const where = merged.locate(parsePath(d.path));
    diagnostics.push(withLocation(d, where.file, where.line));
  }

  return { pack: hasErrors(diagnostics) ? null : pack, diagnostics };
}

function withLocation(d: Diagnostic, file: string | undefined, line: number | undefined): Diagnostic {
  const out: Diagnostic = { ...d };
  if (file !== undefined && out.file === undefined) out.file = file;
  if (line !== undefined && out.line === undefined) out.line = line;
  return out;
}
