/** Canonical command strings ("use brass_key study_door") and localized echo labels. */
import { exitLabelAnywhere } from "./affordances.ts";
import { fill, type StandardExit } from "./messages/index.ts";
import { indexPack, isCoreVerb } from "./pack-index.ts";
import type { Pack } from "./schema.ts";
import type { Command } from "./types.ts";

/** Canonical string form: "verb [object [with]]". */
export function formatCommand(command: Command): string {
  let s = command.verb;
  if (command.object !== undefined) {
    s += ` ${command.object}`;
    if (command.with !== undefined) s += ` ${command.with}`;
  }
  return s;
}

const CANONICAL = /^[a-z][a-z0-9_]*(?: [a-z][a-z0-9_]*){0,2}$/;

/**
 * Parse the canonical string form. Returns null if malformed: ids must be
 * lower_snake_case, separated by single spaces, at most three tokens.
 * Surrounding whitespace is ignored.
 */
export function parseCanonical(text: string): Command | null {
  const trimmed = text.trim();
  if (!CANONICAL.test(trimmed)) return null;
  const [verb, object, withObj] = trimmed.split(" ");
  if (verb === undefined) return null;
  const cmd: Command = { verb };
  if (object !== undefined) cmd.object = object;
  if (withObj !== undefined) cmd.with = withObj;
  return cmd;
}

const COMPASS: ReadonlySet<string> = new Set([
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
]);

/**
 * Localized human-readable label used for the echo, e.g. "Benutze Schlüssel
 * mit Tür", "Geh nach Norden", "Talk to Graves". Core verbs use imperative
 * templates unless the pack relabels the verb; pack verbs read
 * "<Label> <object> [<prep> <object>]". For `choose` the option text is
 * returned.
 */
export function commandLabel(pack: Pack, command: Command): string {
  return commandLabelIn(pack, command, undefined);
}

/** commandLabel with the current room known, so `go` uses that room's exit label. */
export function commandLabelIn(pack: Pack, command: Command, room: string | undefined): string {
  const ix = indexPack(pack);
  const m = ix.m;
  const { verb } = command;
  const name = (id: string | undefined) => (id === undefined ? "" : (pack.objects[id]?.name ?? id));
  const obj = name(command.object);
  const withName = name(command.with);

  if (verb === "choose") return optionText(pack, command.object) ?? command.object ?? verb;
  if (verb === "go") {
    const id = command.object ?? "";
    const roomLabel = room !== undefined ? pack.rooms[room]?.exits?.[id]?.label : undefined;
    const label = roomLabel ?? exitLabelAnywhere(pack, m, id);
    const standardLabel = m.exitLabels[id as StandardExit];
    if (standardLabel === undefined || label !== standardLabel) return fill(m.cmd.goLabel, { label });
    return fill(COMPASS.has(id) ? m.cmd.goCompass : m.cmd.goPlain, { dir: label });
  }

  const info = ix.verbs.get(verb);
  // A pack label equal to the catalog label is not a relabel ("look: { label: Untersuchen }" in a German pack).
  const packLabel = pack.verbs[verb]?.label;
  const relabeled = isCoreVerb(verb) && packLabel !== undefined && packLabel !== m.verbLabels[verb];
  if (isCoreVerb(verb) && !relabeled) {
    const c = m.cmd;
    switch (verb) {
      case "look":
        return command.object === undefined ? c.look0 : fill(c.look, { obj });
      case "use":
        return command.with === undefined ? fill(c.use, { obj }) : fill(c.useWith, { obj, with: withName });
      case "take":
      case "drop":
      case "open":
      case "close":
      case "talk":
      case "push":
      case "pull":
        return fill(c[verb], { obj });
      case "give":
      case "show":
        return fill(c[verb], { obj, with: withName });
      case "wait":
        return c.wait;
      case "inventory":
        return c.inventory;
    }
  }
  if (verb === "look" && command.object === undefined) return m.cmd.look0;
  const label = info?.label ?? verb;
  if (command.object === undefined) return label;
  if (command.with === undefined) return fill(m.cmd.generic1, { verb: label, obj });
  return fill(m.cmd.generic2, { verb: label, obj, prep: info?.prep ?? m.preps.use, with: withName });
}

/** Text of a dialogue option by id (first dialogue in pack order that defines it). */
function optionText(pack: Pack, optionId: string | undefined): string | undefined {
  if (optionId === undefined) return undefined;
  for (const d of Object.values(pack.dialogues)) {
    for (const node of Object.values(d.nodes)) {
      const o = node.options?.find((x) => x.id === optionId);
      if (o) return o.text;
    }
  }
  return undefined;
}
