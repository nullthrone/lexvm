import { analyze } from "./analyze.ts";
import { issuesToDiagnostics } from "./compile-issues.ts";
import { sortDiagnostics } from "./diagnostics.ts";
import { type Pack, PackSchema } from "./schema.ts";
import type { Diagnostic } from "./types.ts";

/** Thrown by loadPack when the input is not a valid pack. */
export class PackError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"));
    this.name = "PackError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Validate and normalise an already-parsed JSON value (e.g. a compiled
 * .lexpack.json file) into a Pack. Runs schema validation and semantic
 * analysis; throws PackError if any error-severity diagnostic is found.
 * Safe to call on untrusted input.
 */
export function loadPack(json: unknown): Pack {
  try {
    const parsed = PackSchema.safeParse(json);
    if (!parsed.success) throw new PackError(sortDiagnostics(issuesToDiagnostics(parsed.error.issues, json)));
    // Only errors make a pack unloadable; warnings are for authors (see compile and lexvm check).
    const errors = analyze(parsed.data).filter((d) => d.severity === "error");
    if (errors.length > 0) throw new PackError(errors);
    return parsed.data;
  } catch (e) {
    if (e instanceof PackError) throw e;
    // E.g. a stack overflow on absurdly deep nesting: still report it as an invalid pack.
    throw new PackError([
      {
        severity: "error",
        code: "load.failed",
        path: "",
        message: `The pack could not be read: ${e instanceof Error ? e.message : String(e)}`,
      },
    ]);
  }
}
