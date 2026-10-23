/**
 * Parsing of pack source files (YAML, and JSON as a YAML subset) with line
 * information, and lookup of the source line for a path inside a document.
 */
import { type Document, isMap, isScalar, isSeq, LineCounter, type Node, parseDocument, type YAMLError } from "yaml";
import type { PathSegment } from "./diagnostics.ts";
import type { Diagnostic, SourceFile } from "./types.ts";

export interface ParsedSource {
  name: string;
  /** Parsed document; null when the text could not be parsed at all. */
  doc: Document | null;
  lineCounter: LineCounter;
  /** Plain JS value of the document (undefined for an empty file). */
  value: unknown;
}

/** YAML codes whose usual cause is unquoted prose containing ': ' or ', '. */
const QUOTE_HINTS: Partial<Record<string, string>> = {
  BLOCK_AS_IMPLICIT_KEY:
    'A ": " inside an unquoted string starts a nested mapping. Quote the whole string: say: "Er sagt: Hallo."',
  BLOCK_IN_FLOW:
    'Inside { … } or [ … ], ": " and ", " separate values. Quote strings that contain them: { say: "Er sagt: Hallo, dann geht er." }',
  MULTILINE_IMPLICIT_KEY:
    "An unquoted string continues on the next line or a ': ' is missing. Quote the string or use a block scalar (|- or >-).",
  UNEXPECTED_TOKEN:
    "If a line starts with a quoted part and continues after the closing quote, quote the whole value (for example with single quotes around double quotes).",
  MISSING_CHAR: "A quote or bracket is not closed. Check that every \" ' { [ has its closing partner.",
  TAB_AS_INDENT: "Indent with spaces, never tabs.",
  BAD_INDENT: "All keys of one mapping must start at the same column; list items need consistent indentation.",
  DUPLICATE_KEY: "A key may appear only once per mapping. Merge the two entries or rename one.",
};

function yamlDiagnostic(file: string, error: YAMLError, severity: "error" | "warning", lc: LineCounter): Diagnostic {
  const { line, col } = lc.linePos(error.pos[0]);
  // The library appends " at line X, column Y:" plus a code excerpt; keep the first sentence only.
  const reason = error.message.split(/ at line \d+, column \d+/)[0]!.trim();
  const hint = QUOTE_HINTS[error.code];
  return {
    severity,
    code: `yaml.${error.code.toLowerCase().replaceAll("_", "-")}`,
    path: "",
    file,
    line,
    message: `YAML ${severity === "error" ? "syntax error" : "warning"} at line ${line}, column ${col}: ${reason}.${hint ? ` ${hint}` : ""}`,
  };
}

/** Parse one source file. Never throws. */
export function parseSource(file: SourceFile): { source: ParsedSource; diagnostics: Diagnostic[] } {
  const lineCounter = new LineCounter();
  const diagnostics: Diagnostic[] = [];
  let doc: Document | null = null;
  let value: unknown;
  try {
    doc = parseDocument(file.text, { lineCounter, prettyErrors: false, uniqueKeys: true });
    for (const e of doc.errors) diagnostics.push(yamlDiagnostic(file.name, e, "error", lineCounter));
    for (const w of doc.warnings) diagnostics.push(yamlDiagnostic(file.name, w, "warning", lineCounter));
    if (doc.errors.length === 0) value = doc.toJS({ maxAliasCount: 100 });
  } catch (e) {
    diagnostics.push({
      severity: "error",
      code: "yaml.unreadable",
      path: "",
      file: file.name,
      message: `Cannot read ${file.name}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return { source: { name: file.name, doc, lineCounter, value }, diagnostics };
}

function keyMatches(key: unknown, segment: PathSegment): boolean {
  if (isScalar(key)) return String(key.value) === String(segment);
  return false;
}

/**
 * 1-based line of the deepest node along `path` in `doc` (the key's line for
 * map entries). A numeric segment that meets a non-list is skipped: the
 * normalised pack turns a single condition or effect into a one-element list.
 */
export function lineOf(source: ParsedSource, path: readonly PathSegment[]): number | undefined {
  const doc = source.doc;
  if (doc === null) return undefined;
  let node: unknown = doc.contents;
  let offset: number | undefined = (node as Node | null)?.range?.[0];
  for (const segment of path) {
    if (typeof segment === "number" && !isSeq(node)) {
      if (segment === 0) continue;
      break;
    }
    if (isMap(node)) {
      const pair = node.items.find((p) => keyMatches(p.key, segment));
      if (pair === undefined) break;
      const keyRange = (pair.key as Node | null)?.range;
      if (keyRange) offset = keyRange[0];
      node = pair.value;
      continue;
    }
    if (isSeq(node) && typeof segment === "number") {
      const item = node.items[segment] as Node | undefined;
      if (item === undefined) break;
      if (item.range) offset = item.range[0];
      node = item;
      continue;
    }
    break;
  }
  return offset === undefined ? undefined : source.lineCounter.linePos(offset).line;
}
