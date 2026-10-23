/**
 * Static checks of walkthrough command strings ("verb [object [with]]").
 * Whether the commands actually work is verified by runWalkthrough.
 */
import { verbArity } from "./analyze-refs.ts";
import type { PackIndex } from "./analyze-walk.ts";
import type { DiagnosticList } from "./diagnostics.ts";

const ID = /^[a-z][a-z0-9_]*$/;

export function checkWalkthrough(ix: PackIndex, out: DiagnosticList): void {
  ix.pack.walkthrough.forEach((line, i) => {
    const path = `walkthrough[${i}]`;
    const fail = (why: string) =>
      out.error(
        "walkthrough.malformed",
        path,
        `Walkthrough step ${JSON.stringify(line)}: ${why} Steps are canonical commands "verb [object [with]]" using ids, e.g. "take brass_key", "use brass_key study_door", "go north", "choose ask_uncle".`,
      );
    const tokens = line
      .trim()
      .split(/\s+/)
      .filter((t) => t !== "");
    if (tokens.length === 0 || tokens.length > 3) {
      fail(`expected 1 to 3 space-separated ids, got ${tokens.length}.`);
      return;
    }
    const bad = tokens.find((t) => !ID.test(t));
    if (bad !== undefined) {
      fail(`"${bad}" is not an id (lower_snake_case). Use ids, not display names or free text.`);
      return;
    }
    const [verb, object, second] = tokens as [string, string | undefined, string | undefined];
    if (!ix.verbs.has(verb)) {
      fail(`unknown verb "${verb}".${out.suggest(verb, ix.verbs)}`);
      return;
    }
    const objects = tokens.length - 1;
    if (verb === "go" || verb === "choose") {
      if (objects !== 1) {
        fail(`"${verb}" takes exactly one ${verb === "go" ? "exit id" : "option id"}.`);
        return;
      }
      if (verb === "go" && !ix.exits.has(object!)) {
        fail(`no room has an exit "${object}".${out.suggest(object!, ix.exits)}`);
      } else if (verb === "choose" && !ix.options.has(object!)) {
        fail(`no dialogue has an option "${object}".${out.suggest(object!, ix.options)}`);
      }
      return;
    }
    const arity = verbArity(ix, verb);
    if (objects < arity.min || objects > arity.max) {
      const expected = arity.min === arity.max ? `${arity.min}` : `${arity.min} or ${arity.max}`;
      fail(`"${verb}" takes ${expected} object${arity.max === 1 ? "" : "s"}, got ${objects}.`);
      return;
    }
    for (const id of [object, second]) {
      if (id !== undefined && !ix.objects.has(id)) fail(`unknown object "${id}".${out.suggest(id, ix.objects)}`);
    }
  });
}
