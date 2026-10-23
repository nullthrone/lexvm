/**
 * Reference and structure checks: every id that is used must be declared and
 * of the right kind; rooms, exits and objects must be well-formed.
 */
import { markupRefs, type PackIndex, walkPack } from "./analyze-walk.ts";
import { type DiagnosticList, didYouMean, joinPath, listIds } from "./diagnostics.ts";
import { CORE_VERBS, type Id, INVENTORY, NOWHERE, RESERVED_IDS, STANDARD_EXITS } from "./schema.ts";

const STANDARD_EXIT_SET = new Set<string>(STANDARD_EXITS);
const CORE_VERB_SET = new Set<string>(CORE_VERBS);

/** Reference checkers bound to one pack. */
export class Refs {
  readonly ix: PackIndex;
  readonly out: DiagnosticList;
  constructor(ix: PackIndex, out: DiagnosticList) {
    this.ix = ix;
    this.out = out;
  }

  room(id: Id, path: string): boolean {
    const { ix } = this;
    if (ix.rooms.has(id)) return true;
    if (ix.objects.has(id)) {
      this.out.error(
        "ref.unknown-room",
        path,
        `"${id}" is an object, not a room; a room id is needed here. Rooms: ${listIds(ix.rooms)}.`,
      );
    } else {
      this.out.error(
        "ref.unknown-room",
        path,
        `Unknown room "${id}".${didYouMean(id, ix.rooms)} Use one of: ${listIds(ix.rooms)}, or add rooms.${id}.`,
      );
    }
    return false;
  }

  object(id: Id, path: string): boolean {
    const { ix } = this;
    if (ix.objects.has(id)) return true;
    if (ix.rooms.has(id)) {
      this.out.error("ref.unknown-object", path, `"${id}" is a room, not an object; an object id is needed here.`);
    } else if (id === INVENTORY || id === NOWHERE) {
      this.out.error("ref.unknown-object", path, `"${id}" is a location, not an object; an object id is needed here.`);
    } else {
      this.out.error(
        "ref.unknown-object",
        path,
        `Unknown object "${id}".${didYouMean(id, ix.objects)} Fix the id or add objects.${id} with a name and a location.`,
      );
    }
    return false;
  }

  location(id: Id, path: string): boolean {
    const { ix } = this;
    if (id === INVENTORY || id === NOWHERE || ix.rooms.has(id)) return true;
    const object = ix.pack.objects[id];
    if (object !== undefined) {
      if (object.container) return true;
      this.out.error(
        "ref.not-a-container",
        path,
        `"${id}" is an object but not a container, so nothing can be located in it. Set container: true on objects.${id}, or use a room id, "${INVENTORY}" or "${NOWHERE}".`,
      );
      return false;
    }
    this.out.error(
      "ref.unknown-location",
      path,
      `Unknown location "${id}".${didYouMean(id, [...ix.rooms, ...ix.objects, ...RESERVED_IDS])} A location is a room id, a container object id, "${INVENTORY}" or "${NOWHERE}".`,
    );
    return false;
  }

  flag(id: Id, path: string): void {
    if (this.ix.flags.has(id)) return;
    this.out.error(
      "ref.unknown-flag",
      path,
      `Undeclared flag "${id}".${didYouMean(id, this.ix.flags)} Declare every flag with its initial value under flags: (e.g. ${id}: false).`,
    );
  }

  counter(id: Id, path: string): void {
    if (this.ix.counters.has(id)) return;
    this.out.error(
      "ref.unknown-counter",
      path,
      `Undeclared counter "${id}".${didYouMean(id, this.ix.counters)} Declare every counter with its initial value under counters: (e.g. ${id}: 0).`,
    );
  }

  verb(id: Id, path: string): boolean {
    if (this.ix.verbs.has(id)) return true;
    const packVerbs = Object.keys(this.ix.pack.verbs);
    this.out.error(
      "ref.unknown-verb",
      path,
      `Unknown verb "${id}".${didYouMean(id, this.ix.verbs)} Core verbs: ${CORE_VERBS.join(", ")}. Pack verbs: ${listIds(packVerbs)}. Declare new verbs under verbs: with a label.`,
    );
    return false;
  }

  dialogue(id: Id, path: string): void {
    if (this.ix.dialogues.has(id)) return;
    this.out.error(
      "ref.unknown-dialogue",
      path,
      `Unknown dialogue "${id}".${didYouMean(id, this.ix.dialogues)} Dialogues: ${listIds(this.ix.dialogues)}.`,
    );
  }

  ending(id: Id, path: string): void {
    if (this.ix.endings.has(id)) return;
    this.out.error(
      "ref.unknown-ending",
      path,
      `Unknown ending "${id}".${didYouMean(id, this.ix.endings)} Endings: ${listIds(this.ix.endings)}. Add endings.${id} with title, text and win.`,
    );
  }
}

/** References inside conditions, effects and text markup. */
function checkLogicRefs(refs: Refs): void {
  const { ix, out } = refs;
  walkPack(ix.pack, {
    condition(c, path) {
      if ("has" in c) refs.object(c.has, joinPath(path, "has"));
      else if ("here" in c) refs.object(c.here, joinPath(path, "here"));
      else if ("isOpen" in c) refs.object(c.isOpen, joinPath(path, "isOpen"));
      else if ("isLocked" in c) refs.object(c.isLocked, joinPath(path, "isLocked"));
      else if ("at" in c) refs.room(c.at, joinPath(path, "at"));
      else if ("visited" in c) refs.room(c.visited, joinPath(path, "visited"));
      else if ("in" in c) {
        refs.object(c.in.object, `${path}.in.object`);
        refs.location(c.in.location, `${path}.in.location`);
      } else if ("flag" in c) refs.flag(c.flag, joinPath(path, "flag"));
      else if ("counter" in c) {
        refs.counter(c.counter.name, `${path}.counter.name`);
        const { name: _name, ...tests } = c.counter;
        if (Object.values(tests).every((t) => t === undefined)) {
          out.warning(
            "condition.counter-no-test",
            `${path}.counter`,
            `Counter condition on "${c.counter.name}" has no comparison, so it always holds. Add one of eq, ne, gt, gte, lt, lte.`,
          );
        }
      }
    },
    effect(e, path) {
      if ("move" in e) {
        refs.object(e.move.object, `${path}.move.object`);
        refs.location(e.move.to, `${path}.move.to`);
      } else if ("goto" in e) refs.room(e.goto, joinPath(path, "goto"));
      else if ("set" in e) refs.flag(e.set, joinPath(path, "set"));
      else if ("clear" in e) refs.flag(e.clear, joinPath(path, "clear"));
      else if ("counter" in e) refs.counter(e.counter.name, `${path}.counter.name`);
      else if ("open" in e) refs.object(e.open, joinPath(path, "open"));
      else if ("close" in e) refs.object(e.close, joinPath(path, "close"));
      else if ("lock" in e) refs.object(e.lock, joinPath(path, "lock"));
      else if ("unlock" in e) refs.object(e.unlock, joinPath(path, "unlock"));
      else if ("reveal" in e) refs.object(e.reveal, joinPath(path, "reveal"));
      else if ("hide" in e) refs.object(e.hide, joinPath(path, "hide"));
      else if ("learn" in e) {
        const p = joinPath(path, "learn");
        if (refs.object(e.learn, p) && !ix.pack.objects[e.learn]!.clue) {
          out.error(
            "learn.not-a-clue",
            p,
            `"${e.learn}" is not a clue, but learn only works on clues. Set clue: true (and usually location: nowhere) on objects.${e.learn}, or use { move: { object: ${e.learn}, to: inventory } } for items.`,
          );
        }
      } else if ("dialogue" in e) refs.dialogue(e.dialogue, joinPath(path, "dialogue"));
      else if ("end" in e) refs.ending(e.end, joinPath(path, "end"));
    },
    text(text, path) {
      for (const ref of markupRefs(text)) {
        if (ix.objects.has(ref.id) && ref.display !== "") continue;
        let message: string;
        if (ref.display === "") message = `Empty display text in ${ref.raw}. Write {${ref.id}} or {${ref.id}|text}.`;
        else if (ix.rooms.has(ref.id))
          message = `${ref.raw} refers to a room; markup can only refer to objects. Remove the braces or refer to an object.`;
        else
          message = `${ref.raw} refers to unknown object "${ref.id}".${didYouMean(ref.id, ix.objects)} Markup {id} must name an object id; to show plain text, remove the braces.`;
        out.error("text.unknown-ref", path, message);
      }
      // Braces are reserved for markup; a stray one is almost always a typo.
      const stripped = text.replace(/\{[^{}]*\}/g, "");
      if (/[{}]/.test(stripped)) {
        out.warning(
          "text.stray-brace",
          path,
          "Unbalanced '{' or '}' in text. Braces are only used for object references like {brass_key} or {brass_key|the key}.",
        );
      }
    },
  });
}

function checkRoomsAndExits(refs: Refs): void {
  const { ix, out } = refs;
  const { pack } = ix;
  refs.room(pack.start.room, "start.room");
  for (const [roomId, room] of Object.entries(pack.rooms)) {
    if (RESERVED_IDS.includes(roomId)) {
      out.error(
        "id.reserved",
        `rooms.${roomId}`,
        `"${roomId}" is reserved for locations and cannot be a room id. Rename the room.`,
      );
    }
    for (const [exitId, exit] of Object.entries(room.exits ?? {})) {
      const p = `rooms.${roomId}.exits.${exitId}`;
      refs.room(exit.to, `${p}.to`);
      if (!STANDARD_EXIT_SET.has(exitId) && exit.label === undefined) {
        out.error(
          "exit.label-required",
          p,
          `Exit "${exitId}" is not a standard direction (${STANDARD_EXITS.join(", ")}), so it needs a label, e.g. label: "${pack.rooms[exit.to]?.name ?? exitId}".`,
        );
      }
      if (exit.door !== undefined && refs.object(exit.door, `${p}.door`)) {
        const door = pack.objects[exit.door]!;
        if (!door.openable) {
          out.error(
            "exit.door-not-openable",
            `${p}.door`,
            `Door "${exit.door}" is not openable, so this exit can never be used. Set openable: true on objects.${exit.door}.`,
          );
        }
        if (door.location !== roomId && !(door.alsoIn ?? []).includes(roomId)) {
          out.warning(
            "exit.door-not-here",
            `${p}.door`,
            `Door "${exit.door}" is not present in room "${roomId}", so the player cannot open it from here. Add "${roomId}" to objects.${exit.door}.alsoIn.`,
          );
        }
      }
    }
  }
}

function checkObjects(refs: Refs): void {
  const { ix, out } = refs;
  const { pack } = ix;
  for (const [id, object] of Object.entries(pack.objects)) {
    const p = `objects.${id}`;
    if (RESERVED_IDS.includes(id)) {
      out.error("id.reserved", p, `"${id}" is reserved for locations and cannot be an object id. Rename the object.`);
    }
    if (ix.rooms.has(id)) {
      out.error(
        "id.collision",
        p,
        `"${id}" is both a room id and an object id. Rooms and objects share one namespace; rename one of them (e.g. "${id}_object").`,
      );
    }
    if (object.location === id) {
      out.error(
        "object.contains-itself",
        `${p}.location`,
        `Object "${id}" is located in itself. Choose a room, a container, "inventory" or "nowhere".`,
      );
    } else {
      refs.location(object.location, `${p}.location`);
    }
    (object.alsoIn ?? []).forEach((room, i) => {
      refs.room(room, `${p}.alsoIn[${i}]`);
    });
    if (object.alsoIn !== undefined && object.alsoIn.length > 0 && object.portable) {
      out.error(
        "object.alsoIn-portable",
        `${p}.alsoIn`,
        `Object "${id}" is portable but has alsoIn. Only fixed objects (doors, sky, river) can be in several rooms; remove alsoIn or portable.`,
      );
    }
    if (object.unlockedBy !== undefined) refs.object(object.unlockedBy, `${p}.unlockedBy`);
    if (object.dialogue !== undefined) {
      refs.dialogue(object.dialogue, `${p}.dialogue`);
      if (!object.npc) {
        out.warning(
          "object.dialogue-not-npc",
          `${p}.dialogue`,
          `Object "${id}" has a dialogue but is not an npc, so 'talk' is not offered. Set npc: true.`,
        );
      }
    }
    (object.verbs ?? []).forEach((verb, i) => {
      const vp = `${p}.verbs[${i}]`;
      if (refs.verb(verb, vp) && (verb === "go" || verb === "choose" || verb === "wait" || verb === "inventory")) {
        out.warning(
          "object.verb-not-applicable",
          vp,
          `Verb "${verb}" does not take an object; remove it from objects.${id}.verbs.`,
        );
      }
    });
  }
  checkContainerCycles(refs);
}

/** A container chain that loops back (a in b, b in a) makes both objects unreachable. */
function checkContainerCycles(refs: Refs): void {
  const { pack } = refs.ix;
  const reported = new Set<Id>();
  for (const start of Object.keys(pack.objects)) {
    if (reported.has(start)) continue;
    const chain: Id[] = [];
    const seen = new Set<Id>();
    let current: Id | undefined = start;
    while (current !== undefined && pack.objects[current] !== undefined && !seen.has(current)) {
      seen.add(current);
      chain.push(current);
      current = pack.objects[current]!.location;
    }
    if (current === undefined || !seen.has(current) || current !== start) continue;
    if (chain.length === 1) continue; // self-location is reported by checkObjects
    for (const id of chain) reported.add(id);
    refs.out.error(
      "object.contains-itself",
      `objects.${start}.location`,
      `Container cycle: ${[...chain, start].join(" → ")}. An object cannot (indirectly) contain itself; move one of them to a room.`,
    );
  }
}

function checkRuleTriggers(refs: Refs): void {
  const { ix, out } = refs;
  const { pack } = ix;
  pack.rules.forEach((rule, i) => {
    const p = `rules[${i}].on`;
    const on = rule.on;
    if ("event" in on) {
      if (on.room !== undefined) {
        if (on.event === "enter") refs.room(on.room, `${p}.room`);
        else {
          out.error(
            "rule.trigger-object-not-allowed",
            `${p}.room`,
            `'room' only applies to enter events; a ${on.event} rule fires regardless of the room. Remove room, or use when: { at: ${on.room} }.`,
          );
        }
      }
      return;
    }
    if (!refs.verb(on.verb, `${p}.verb`)) return;
    if (on.verb === "choose") {
      out.error(
        "rule.choose-trigger",
        `${p}.verb`,
        "Rules never fire for 'choose'. Put the effects into the dialogue option's do: instead.",
      );
      return;
    }
    const arity = verbArity(ix, on.verb);
    if (arity.max === 0 && (on.object !== undefined || on.with !== undefined)) {
      out.error(
        "rule.trigger-object-not-allowed",
        `${p}.${on.object !== undefined ? "object" : "with"}`,
        `Verb "${on.verb}" takes no object, so this trigger can never match. Remove object/with.`,
      );
      return;
    }
    if (arity.max === 1 && on.with !== undefined) {
      out.error(
        "rule.trigger-object-not-allowed",
        `${p}.with`,
        `Verb "${on.verb}" takes one object, so a trigger with 'with' can never match. Remove with, or use an arity-2 verb.`,
      );
    }
    if (on.verb === "go") {
      if (on.object !== undefined && !ix.exits.has(on.object)) {
        out.error(
          "ref.unknown-exit",
          `${p}.object`,
          `For 'go' the object is an exit id, but no room has an exit "${on.object}".${didYouMean(on.object, ix.exits)} Exits: ${listIds(ix.exits)}.`,
        );
      }
      return;
    }
    if (on.object !== undefined) refs.object(on.object, `${p}.object`);
    if (on.with !== undefined) refs.object(on.with, `${p}.with`);
  });
}

/** How many objects a verb takes (core verbs per spec section 7; pack verbs from their arity). */
export function verbArity(ix: PackIndex, verb: Id): { min: number; max: number } {
  switch (verb) {
    case "look":
      return { min: 0, max: 1 };
    case "wait":
    case "inventory":
      return { min: 0, max: 0 };
    case "use":
      return { min: 1, max: 2 };
    case "give":
    case "show":
      return { min: 2, max: 2 };
    default:
      if (CORE_VERB_SET.has(verb)) return { min: 1, max: 1 };
      return ix.pack.verbs[verb]?.arity === 2 ? { min: 2, max: 2 } : { min: 1, max: 1 };
  }
}

function checkDialogueRefs(refs: Refs): void {
  const { ix, out } = refs;
  for (const [id, dialogue] of Object.entries(ix.pack.dialogues)) {
    const p = `dialogues.${id}`;
    if (
      dialogue.with !== undefined &&
      refs.object(dialogue.with, `${p}.with`) &&
      !ix.pack.objects[dialogue.with]!.npc
    ) {
      out.warning(
        "dialogue.with-not-npc",
        `${p}.with`,
        `"${dialogue.with}" is not an npc. Set npc: true on objects.${dialogue.with}.`,
      );
    }
    if (dialogue.nodes[dialogue.start] === undefined) {
      out.error(
        "ref.unknown-node",
        `${p}.start`,
        `Start node "${dialogue.start}" does not exist.${didYouMean(dialogue.start, Object.keys(dialogue.nodes))} Nodes: ${listIds(Object.keys(dialogue.nodes))}.`,
      );
    }
  }
}

export function checkReferences(refs: Refs): void {
  checkRoomsAndExits(refs);
  checkObjects(refs);
  checkRuleTriggers(refs);
  checkDialogueRefs(refs);
  checkLogicRefs(refs);
}
