/**
 * Helpers shared by the compiler, the analyzer and the loader: diagnostic
 * paths, deterministic ordering and "did you mean" suggestions.
 *
 * Paths use JavaScript accessor syntax relative to the pack root:
 * `rules[3].when[0].flag`, `rooms.hall.exits.north`, `rooms["Big Room"]`.
 */
import type { Diagnostic, Severity } from "./types.ts";

export type PathSegment = string | number;

const SIMPLE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Append one segment to a formatted path. */
export function joinPath(base: string, segment: PathSegment): string {
  if (typeof segment === "number") return `${base}[${segment}]`;
  if (SIMPLE_KEY.test(segment)) return base === "" ? segment : `${base}.${segment}`;
  return `${base}[${JSON.stringify(segment)}]`;
}

export function formatPath(segments: readonly PathSegment[]): string {
  let path = "";
  for (const segment of segments) path = joinPath(path, segment);
  return path;
}

/** Inverse of formatPath. Unparseable remainders end the path (best effort). */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let i = 0;
  while (i < path.length) {
    const ch = path[i];
    if (ch === ".") {
      i++;
      continue;
    }
    if (ch === "[") {
      if (path[i + 1] === '"') {
        // Quoted key: find the closing quote that is followed by "]".
        let j = i + 2;
        while (j < path.length && !(path[j] === '"' && path[j - 1] !== "\\" && path[j + 1] === "]")) j++;
        try {
          segments.push(JSON.parse(path.slice(i + 1, j + 1)) as string);
        } catch {
          return segments;
        }
        i = j + 2;
        continue;
      }
      const end = path.indexOf("]", i);
      if (end < 0) return segments;
      const n = Number(path.slice(i + 1, end));
      if (!Number.isInteger(n)) return segments;
      segments.push(n);
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
    segments.push(path.slice(i, j));
    i = j;
  }
  return segments;
}

function compareSegments(a: readonly PathSegment[], b: readonly PathSegment[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Deterministic order: by path (numeric indices compared numerically), then severity, code, message. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const keyed = diagnostics.map((d) => ({ d, segments: parsePath(d.path) }));
  keyed.sort(
    (a, b) =>
      compareSegments(a.segments, b.segments) ||
      SEVERITY_RANK[a.d.severity] - SEVERITY_RANK[b.d.severity] ||
      (a.d.code < b.d.code ? -1 : a.d.code > b.d.code ? 1 : 0) ||
      (a.d.message < b.d.message ? -1 : a.d.message > b.d.message ? 1 : 0),
  );
  return keyed.map((k) => k.d);
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Work budget of did-you-mean suggestions, in edit-distance table cells. */
export interface SuggestionBudget {
  cells: number;
}

/**
 * Edit-distance cells the suggestions of one DiagnosticList may compute
 * (about a third of a second). A hostile pack with thousands of unknown ids
 * would otherwise cost errors × ids comparisons; once the budget is spent,
 * diagnostics simply carry no suggestion.
 */
export const SUGGESTION_BUDGET = 20_000_000;

/**
 * The candidate closest to `word`, if it is plausibly a typo of it
 * (case-insensitive, at most a third of the characters differ). Ties go to
 * the earlier candidate, so results are deterministic.
 */
export function closest(word: string, candidates: Iterable<string>, budget?: SuggestionBudget): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const limit = Math.max(1, Math.floor(Math.max(w.length, candidate.length) / 3));
    // The edit distance is at least the difference in length.
    if (Math.abs(w.length - candidate.length) > limit) continue;
    if (budget !== undefined) {
      budget.cells -= (w.length + 1) * (candidate.length + 1);
      if (budget.cells < 0) return undefined;
    }
    const d = editDistance(w, candidate.toLowerCase());
    if (d <= limit && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** " Did you mean "x"?" or "". */
export function didYouMean(word: string, candidates: Iterable<string>, budget?: SuggestionBudget): string {
  const match = closest(word, candidates, budget);
  return match === undefined ? "" : ` Did you mean "${match}"?`;
}

/** Comma-separated list, truncated for very large sets so messages stay readable. */
export function listIds(ids: Iterable<string>, max = 25): string {
  const all = [...ids];
  if (all.length === 0) return "(none)";
  if (all.length <= max) return all.join(", ");
  return `${all.slice(0, max).join(", ")}, … (${all.length - max} more)`;
}

/** Best-effort conversion of arbitrary text into a valid lower_snake_case id. */
export function toSnakeId(text: string): string {
  const id = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (id === "") return "id";
  return /^[a-z]/.test(id) ? id : `x_${id}`;
}

/** Collects diagnostics with a compact API. */
export class DiagnosticList {
  readonly items: Diagnostic[] = [];
  private readonly budget: SuggestionBudget = { cells: SUGGESTION_BUDGET };
  /** didYouMean within this list's suggestion budget. */
  suggest(word: string, candidates: Iterable<string>): string {
    return didYouMean(word, candidates, this.budget);
  }
  error(code: string, path: string, message: string): void {
    this.items.push({ severity: "error", code, path, message });
  }
  warning(code: string, path: string, message: string): void {
    this.items.push({ severity: "warning", code, path, message });
  }
  info(code: string, path: string, message: string): void {
    this.items.push({ severity: "info", code, path, message });
  }
}
