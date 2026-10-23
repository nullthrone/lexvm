/** Terminal output helpers: ANSI colors (only on a TTY and without NO_COLOR) and diagnostic formatting. */
import { join, relative } from "node:path";
import type { Diagnostic, Severity } from "@lexvm/engine";

function colorEnabled(stream: NodeJS.WriteStream): boolean {
  const noColor = process.env.NO_COLOR;
  return stream.isTTY === true && (noColor === undefined || noColor === "");
}

function style(code: string, stream: NodeJS.WriteStream) {
  return (text: string) => (colorEnabled(stream) ? `\u001b[${code}m${text}\u001b[0m` : text);
}

export const color = {
  red: style("31", process.stdout),
  yellow: style("33", process.stdout),
  blue: style("34", process.stdout),
  green: style("32", process.stdout),
  dim: style("2", process.stdout),
  bold: style("1", process.stdout),
};

/**
 * C0 controls other than tab and newline, DEL, C1 controls, and the Unicode
 * bidirectional overrides and isolates.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: finding control characters is the point
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/**
 * Text from a pack (or any other untrusted source) made safe for a terminal:
 * control characters become visible escapes ("\u{1b}"), so pack text can
 * neither set the window title, write the clipboard (OSC 52), move the cursor
 * nor reorder what is shown. Apply it to the untrusted parts before adding
 * colors, which are escape sequences themselves.
 */
export function clean(text: string): string {
  return text.replace(UNSAFE, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`);
}

export function out(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function err(text = ""): void {
  process.stderr.write(`${text}\n`);
}

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  error: color.red,
  warning: color.yellow,
  info: color.blue,
};

/** Display path of a diagnostic's file, relative to the working directory. */
export function diagnosticFile(d: Diagnostic, baseDir: string, fallback: string): string {
  if (d.file === undefined) return fallback;
  const rel = relative(process.cwd(), join(baseDir, d.file));
  return rel === "" ? d.file : rel;
}

/** "file:line  severity  code  path  message", with pack-derived parts made safe for the terminal. */
export function formatDiagnostic(d: Diagnostic, baseDir: string, fallback: string): string {
  const file = clean(diagnosticFile(d, baseDir, fallback));
  const where = d.line === undefined ? file : `${file}:${d.line}`;
  const severity = SEVERITY_COLOR[d.severity](d.severity.padEnd(7));
  return `${where}  ${severity}  ${color.bold(clean(d.code))}  ${d.path === "" ? "-" : clean(d.path)}  ${clean(d.message)}`;
}

export function countDiagnostics(diagnostics: readonly Diagnostic[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  return counts;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function summarizeCounts(diagnostics: readonly Diagnostic[]): string {
  const c = countDiagnostics(diagnostics);
  const errors = plural(c.error, "error");
  const warnings = plural(c.warning, "warning");
  return `${c.error > 0 ? color.red(errors) : errors}, ${c.warning > 0 ? color.yellow(warnings) : warnings}, ${c.info} info`;
}
