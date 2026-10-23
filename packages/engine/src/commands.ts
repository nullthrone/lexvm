import type { Pack } from "./schema.ts";
import type { Command } from "./types.ts";

/** Canonical string form: "verb [object [with]]". */
export function formatCommand(_command: Command): string {
  throw new Error("not implemented: formatCommand");
}

/** Parse the canonical string form. Returns null if malformed. */
export function parseCanonical(_text: string): Command | null {
  throw new Error("not implemented: parseCanonical");
}

/** Localized human-readable label, e.g. "Benutze Schlüssel mit Tür". */
export function commandLabel(_pack: Pack, _command: Command): string {
  throw new Error("not implemented: commandLabel");
}
