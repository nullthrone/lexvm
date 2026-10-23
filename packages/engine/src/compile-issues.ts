/**
 * Converts zod issues into diagnostics that are precise enough for an LLM
 * repair loop to converge: one diagnostic per actual problem, the most
 * specific union branch instead of a list of alternatives, "did you mean"
 * suggestions for unknown keys, and a hint for the most common YAML trap
 * (unquoted prose inside a `{ … }` flow mapping).
 */
import type { z } from "zod";
import {
  effectiveKind,
  expectation,
  isSingleKeyKind,
  kindAt,
  kindNoun,
  type NodeKind,
  validKeys,
} from "./compile-context.ts";
import { closest, formatPath, type PathSegment, toSnakeId } from "./diagnostics.ts";
import type { Diagnostic } from "./types.ts";

type Issue = z.core.$ZodIssue;

/** A diagnostic whose path is still a list of segments (for source mapping). */
export interface RawDiagnostic {
  severity: Diagnostic["severity"];
  code: string;
  segments: PathSegment[];
  message: string;
}

interface FlatIssue {
  issue: Issue;
  segments: PathSegment[];
}

function toSegment(key: PropertyKey): PathSegment {
  return typeof key === "number" ? key : String(key);
}

/** The input value at a path, or undefined. */
export function valueAt(input: unknown, segments: readonly PathSegment[]): unknown {
  let value = input;
  for (const segment of segments) {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.hasOwn(value, segment)) return undefined;
    value = (value as Record<PathSegment, unknown>)[segment];
  }
  return value;
}

/** True when a union branch failed only because the value has the wrong JSON type. */
function isShapeMismatch(branch: readonly Issue[]): boolean {
  return branch.every((i) => i.code === "invalid_type" && i.path.length === 0);
}

/**
 * Lower is a better fit. Wrong JSON type of the whole value and unknown or
 * missing top-level keys mean the input was probably meant as another branch.
 */
function branchScore(branch: readonly Issue[], value: unknown): number {
  let score = 0;
  for (const issue of branch) {
    if (issue.code === "invalid_type" && issue.path.length === 0) score += 100;
    else if (issue.code === "unrecognized_keys" && issue.path.length === 0) score += 10 * issue.keys.length;
    else if (
      issue.code === "invalid_type" &&
      issue.path.length === 1 &&
      valueAt(value, issue.path.map(toSegment)) === undefined
    )
      score += 10;
    else score += 1;
  }
  return score;
}

function pickBranch(issue: Extract<Issue, { code: "invalid_union" }>, value: unknown): Issue[] | null {
  const viable = issue.errors.filter((b) => b.length > 0 && !isShapeMismatch(b));
  if (viable.length === 0) return null;
  let best: Issue[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let tie = false;
  for (const branch of viable) {
    const score = branchScore(branch, value);
    if (score < bestScore) {
      best = branch;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) tie = true;
  }
  // An exact tie means the input mixes two forms; report the union as a whole.
  return tie ? null : best;
}

function flatten(issues: readonly Issue[], base: PathSegment[], input: unknown, out: FlatIssue[]): void {
  for (const issue of issues) {
    const segments = [...base, ...issue.path.map(toSegment)];
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      const branch = pickBranch(issue, valueAt(input, segments));
      if (branch !== null) {
        flatten(branch, segments, input, out);
        continue;
      }
    }
    out.push({ issue, segments });
  }
}

/** Short description of a value for messages. */
export function describeValue(value: unknown): string {
  if (value === null) return "an empty value";
  if (value === undefined) return "nothing";
  if (typeof value === "string") {
    const shown = value.length > 40 ? `${value.slice(0, 37)}…` : value;
    return `the string ${JSON.stringify(shown)}`;
  }
  if (typeof value === "number") return `the number ${value}`;
  if (typeof value === "boolean") return `the boolean ${value}`;
  if (Array.isArray(value)) return `a list of ${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return keys.length === 0 ? "an empty map {}" : `a map with key${keys.length === 1 ? "" : "s"} ${keys.join(", ")}`;
  }
  return typeof value;
}

const PROSE_HINT =
  "It looks like prose that YAML split into keys: quote the string. In { … } flow mappings, ', ' and ': ' split values, " +
  'so write { say: "Er sagt: Hallo, dann geht er." } or use a block mapping with a quoted string.';

function looksLikeProse(key: string): boolean {
  return /[\s,.;:!?»«"'„“”()…]/.test(key);
}

function unknownKey(segments: PathSegment[], key: string, input: unknown): RawDiagnostic {
  const container = valueAt(input, segments);
  const kind = effectiveKind(kindAt(segments), container);
  const keys = validKeys(kind);
  const noun = kindNoun(kind);
  const keyValue = valueAt(container, [key]);
  const suggestion = closest(key, keys);
  let message = `Unknown key "${key}" in ${noun}.`;
  if (suggestion !== undefined) message += ` Did you mean "${suggestion}"?`;
  // A bare word or phrase with no value is the typical remainder of an unquoted string.
  const bareWord = keyValue === null && suggestion === undefined && kind !== "pack";
  if (looksLikeProse(key) || bareWord) message += ` ${PROSE_HINT}`;
  if (kind === "trigger") {
    message +=
      " A command trigger has the keys verb, object, with; an event trigger has event and, for enter events, room. They cannot be mixed.";
  } else if (keys.length > 0) {
    message += isSingleKeyKind(kind)
      ? ` Each ${kind} has exactly one key, one of: ${keys.join(", ")}.`
      : ` Valid keys: ${keys.join(", ")}.`;
  }
  return { severity: "error", code: "schema.unrecognized_keys", segments: [...segments, key], message };
}

function missingKey(segments: PathSegment[], expected: string, input: unknown): RawDiagnostic {
  const key = segments[segments.length - 1];
  const parent = segments.slice(0, -1);
  const parentKind = effectiveKind(kindAt(parent), valueAt(input, parent));
  const what = expectation(kindAt(segments)) ?? expected;
  const where = parent.length === 0 ? "the top level of the pack" : `${kindNoun(parentKind)} (${formatPath(parent)})`;
  return {
    severity: "error",
    code: "schema.invalid_type",
    segments,
    message: `Missing required key "${String(key)}" in ${where}. Expected ${what}.`,
  };
}

function typeMismatch(segments: PathSegment[], expected: string, value: unknown, code: string): RawDiagnostic {
  const kind = kindAt(segments);
  const what = expectation(kind) ?? expected;
  let message = `Expected ${what}, got ${describeValue(value)}.`;
  if (expected === "string" && (typeof value === "number" || typeof value === "boolean")) {
    const key = segments[segments.length - 1];
    const example = typeof key === "string" ? `${key}: "…"` : `"…"`;
    message += ` YAML reads unquoted numbers (1.0 becomes 1) and true/false as non-strings: quote the value, e.g. ${example}.`;
  } else if ((expected === "number" || expected === "int") && typeof value === "string") {
    message += " Write numbers without quotes.";
  } else if (expected === "boolean" && typeof value !== "boolean") {
    message += " Use true or false, without quotes.";
  } else if (value === null && (kind === "text" || expected === "string")) {
    message += " The value is empty: write the text after the colon or remove the key.";
  } else if (typeof value === "string" && (kind === "conditions" || kind === "condition")) {
    message += " Conditions are objects, not strings: write { flag: x } instead of 'flag x'.";
  } else if (typeof value === "string" && (kind === "effects" || kind === "effect")) {
    message += ' Effects are objects, not strings: to print text write { say: "…" }.';
  }
  return { severity: "error", code, segments, message };
}

function convert(flat: FlatIssue, input: unknown): RawDiagnostic[] {
  const { issue, segments } = flat;
  const value = valueAt(input, segments);
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => unknownKey(segments, key, input));
    case "invalid_type":
      if (value === undefined) return [missingKey(segments, issue.expected, input)];
      return [typeMismatch(segments, issue.expected, value, "schema.invalid_type")];
    case "invalid_union":
      return [unionMismatch(segments, value, input)];
    case "invalid_key": {
      const key = segments[segments.length - 1];
      const inner = issue.issues.map((i) => i.message).join("; ");
      const parentKind: NodeKind = kindAt(segments.slice(0, -1));
      return [
        {
          severity: "error",
          code: "schema.invalid_key",
          segments,
          message: `Invalid id "${String(key)}" in ${parentKind}: ${inner}. Rename it, e.g. to "${toSnakeId(String(key))}", and update every reference.`,
        },
      ];
    }
    case "invalid_value": {
      const allowed = issue.values.map((v) => JSON.stringify(v)).join(" or ");
      return [
        {
          severity: "error",
          code: "schema.invalid_value",
          segments,
          message: `Expected ${allowed}, got ${describeValue(value)}.`,
        },
      ];
    }
    case "invalid_format": {
      let message = `${issue.message}; got ${describeValue(value)}.`;
      if (typeof value === "string" && kindAt(segments) === "value" && issue.format === "regex") {
        const suggestion = toSnakeId(value);
        if (issue.message.startsWith("ids ") && suggestion !== value) message += ` Use "${suggestion}" instead.`;
      }
      return [{ severity: "error", code: "schema.invalid_format", segments, message }];
    }
    case "too_small": {
      let message: string;
      if (issue.origin === "string") message = "Must not be empty: write a text or remove the key.";
      else if (issue.origin === "array")
        message = `Must contain at least ${String(issue.minimum)} item${Number(issue.minimum) === 1 ? "" : "s"}.`;
      else
        message = `Must be ${issue.inclusive ? "at least" : "greater than"} ${String(issue.minimum)}, got ${describeValue(value)}.`;
      return [{ severity: "error", code: "schema.too_small", segments, message }];
    }
    case "too_big": {
      const message = `Must be ${issue.inclusive ? "at most" : "less than"} ${String(issue.maximum)}, got ${describeValue(value)}.`;
      return [{ severity: "error", code: "schema.too_big", segments, message }];
    }
    case "custom": {
      const kind = effectiveKind(kindAt(segments), value);
      let message = issue.message;
      if (isSingleKeyKind(kind) && message.includes("exactly one key")) {
        message +=
          kind === "condition"
            ? " A list of conditions means all must hold: when: [{ flag: a }, { has: b }]."
            : ' Effects run in list order: do: [{ set: a }, { say: "…" }].';
      }
      return [{ severity: "error", code: "schema.custom", segments, message }];
    }
    default:
      return [{ severity: "error", code: `schema.${issue.code}`, segments, message: issue.message }];
  }
}

function unionMismatch(segments: PathSegment[], value: unknown, input: unknown): RawDiagnostic {
  if (value === undefined) return missingKey(segments, "a value", input);
  const kind = kindAt(segments);
  if (kind === "trigger" && value !== null && typeof value === "object" && "verb" in value && "event" in value) {
    return {
      severity: "error",
      code: "schema.invalid_union",
      segments,
      message:
        "A rule trigger is either a command trigger { verb, object?, with? } or an event trigger { event: start | enter | turn, room? }; it cannot have both 'verb' and 'event'. Split it into two rules.",
    };
  }
  return typeMismatch(segments, "a different value", value, "schema.invalid_type");
}

/** Convert zod issues for `input` into diagnostics with segment paths. */
export function convertIssues(issues: readonly Issue[], input: unknown): RawDiagnostic[] {
  const flat: FlatIssue[] = [];
  flatten(issues, [], input, flat);
  // "must have exactly one key" is a consequence of an unknown key at the same path; report the cause only.
  const unknownAt = new Set(
    flat.filter((f) => f.issue.code === "unrecognized_keys").map((f) => formatPath(f.segments)),
  );
  const out: RawDiagnostic[] = [];
  const seen = new Set<string>();
  for (const f of flat) {
    if (f.issue.code === "custom" && unknownAt.has(formatPath(f.segments))) continue;
    for (const d of convert(f, input)) {
      // Union branches can repeat the same issue; keep one.
      const key = `${d.code}\u0000${formatPath(d.segments)}\u0000${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

/** Convert zod issues into plain diagnostics (no source locations). */
export function issuesToDiagnostics(issues: readonly Issue[], input: unknown): Diagnostic[] {
  return convertIssues(issues, input).map((d) => ({
    severity: d.severity,
    code: d.code,
    path: formatPath(d.segments),
    message: d.message,
  }));
}
