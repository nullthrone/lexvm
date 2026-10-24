/**
 * Player-facing text checks: phone-screen length budgets, unreachable text
 * variants, scenery that is never mentioned, characters you cannot talk to.
 */
import { markupRefs, type PackIndex, renderedText, textStrings, walkPack } from "./analyze-walk.ts";
import type { DiagnosticList } from "./diagnostics.ts";
import type { Id, Pacing, Text } from "./schema.ts";

/** Character budgets from spec section 4 (packs with pacing 'balanced' or 'puzzle', or none). */
export const TEXT_LIMITS = {
  roomDescription: 600,
  objectDescription: 400,
  dialogueSay: 300,
  optionText: 80,
  name: 24,
} as const;

/**
 * A narrative pack tells its scenes in full: a first arrival, a confession, a
 * turning point need more room than one phone screen of 300 characters. The
 * player scrolls like a book; options and names stay short for the buttons.
 */
const NARRATIVE_LIMITS: Record<keyof typeof TEXT_LIMITS, number> = {
  roomDescription: 1000,
  objectDescription: 600,
  dialogueSay: 600,
  optionText: 80,
  name: 24,
};

/** The character budgets for a pack's pacing (spec section 4). */
export function textLimits(pacing: Pacing | undefined): Readonly<Record<keyof typeof TEXT_LIMITS, number>> {
  return pacing === "narrative" ? NARRATIVE_LIMITS : TEXT_LIMITS;
}

function length(text: string, ix: PackIndex): number {
  return [...renderedText(text, ix.pack)].length;
}

function checkLength(
  ix: PackIndex,
  out: DiagnosticList,
  text: Text | undefined,
  path: string,
  what: string,
  max: number,
) {
  if (text === undefined) return;
  const variants =
    typeof text === "string" ? [{ text, path }] : text.map((v, i) => ({ text: v.text, path: `${path}[${i}].text` }));
  for (const v of variants) {
    const n = length(v.text, ix);
    if (n > max) {
      out.warning(
        "text.too-long",
        v.path,
        `${what} has ${n} characters; keep it at most ${max} so it reads well on a phone. Shorten it or split it up.`,
      );
    }
  }
}

function checkLengths(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  const limits = textLimits(pack.pacing);
  for (const [id, room] of Object.entries(pack.rooms)) {
    checkLength(ix, out, room.name, `rooms.${id}.name`, "Room name", limits.name);
    checkLength(ix, out, room.description, `rooms.${id}.description`, "Room description", limits.roomDescription);
  }
  for (const [id, object] of Object.entries(pack.objects)) {
    checkLength(ix, out, object.name, `objects.${id}.name`, "Object name", limits.name);
    checkLength(
      ix,
      out,
      object.description,
      `objects.${id}.description`,
      "Object description",
      limits.objectDescription,
    );
  }
  for (const [id, dialogue] of Object.entries(pack.dialogues)) {
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      const p = `dialogues.${id}.nodes.${nodeId}`;
      checkLength(ix, out, node.say, `${p}.say`, "Dialogue line", limits.dialogueSay);
      (node.options ?? []).forEach((option, i) => {
        checkLength(ix, out, option.text, `${p}.options[${i}].text`, "Option text", limits.optionText);
      });
    }
  }
}

function checkVariantOrder(ix: PackIndex, out: DiagnosticList): void {
  walkPack(ix.pack, {
    textBlock(text, path) {
      if (typeof text === "string") return;
      const fallback = text.findIndex((v) => v.when === undefined || v.when.length === 0);
      if (fallback >= 0 && fallback < text.length - 1) {
        out.warning(
          "text.variant-after-default",
          `${path}[${fallback + 1}]`,
          `This variant is never used: the variant at ${path}[${fallback}] has no 'when' and always matches first. Put the variant without 'when' last.`,
        );
      }
    },
  });
}

/** Objects players can see in a room but would not know about from the room text. */
function checkUnmentioned(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  for (const [id, object] of Object.entries(pack.objects)) {
    // Portable objects without roomText are listed automatically; clues live in the notebook.
    if (object.portable || object.clue || object.roomText !== undefined) continue;
    const rooms = [...(pack.rooms[object.location] ? [object.location] : []), ...(object.alsoIn ?? [])];
    const name = object.name.toLowerCase();
    for (const roomId of rooms) {
      const room = pack.rooms[roomId];
      if (room === undefined) continue;
      const mentioned = textStrings(room.description).some(
        (s) => markupRefs(s).some((r) => r.id === id) || s.toLowerCase().includes(name),
      );
      if (!mentioned) {
        out.info(
          "object.unmentioned",
          `objects.${id}`,
          `"${id}" is present in room "${roomId}" but neither a roomText nor the room description mentions it, so players will not know it is there. Mention it as {${id}} in rooms.${roomId}.description or give it a roomText.`,
        );
      }
    }
  }
}

function checkNpcs(ix: PackIndex, out: DiagnosticList): void {
  const { pack } = ix;
  const talkTargets = new Set<Id | undefined>();
  for (const rule of pack.rules) if ("verb" in rule.on && rule.on.verb === "talk") talkTargets.add(rule.on.object);
  for (const [id, object] of Object.entries(pack.objects)) {
    if (!object.npc || object.dialogue !== undefined) continue;
    if (talkTargets.has(id) || talkTargets.has(undefined)) continue;
    out.info(
      "npc.no-talk",
      `objects.${id}`,
      `NPC "${id}" has no dialogue and no talk rule, so talking to it only gets a default reply. Add dialogue: <id> or a rule on { verb: talk, object: ${id} }.`,
    );
  }
}

export function checkText(ix: PackIndex, out: DiagnosticList): void {
  checkLengths(ix, out);
  checkVariantOrder(ix, out);
  checkUnmentioned(ix, out);
  checkNpcs(ix, out);
}
