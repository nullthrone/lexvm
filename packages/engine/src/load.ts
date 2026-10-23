import type { Pack } from "./schema.ts";
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
export function loadPack(_json: unknown): Pack {
  throw new Error("not implemented: loadPack");
}
