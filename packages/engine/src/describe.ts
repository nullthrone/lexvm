/** Generated descriptions: rooms, container contents, examined objects, inventory. */
import { exitLabel, listedExits } from "./affordances.ts";
import { fmt, joinSpans } from "./messages/index.ts";
import type { PackIndex } from "./pack-index.ts";
import { reachableRoot } from "./presence.ts";
import { INVENTORY, type Pack } from "./schema.ts";
import { inlineSpans, objectSpan, resolveText, textBlocks } from "./text.ts";
import type { GameState, OutputBlock, Span } from "./types.ts";

/**
 * Room description blocks:
 * 1. room-title; 2. description paragraphs; 3. one paragraph joining the
 * `roomText` of visible objects lying directly in the room (or listing it in
 * `alsoIn`); 4. "Hier liegt: …" for other portable/clue objects directly in
 * the room; 5. one line per open container in the room with visible
 * contents; 6. a system line with the listed exits.
 */
export function roomBlocks(pack: Pack, ix: PackIndex, state: GameState): OutputBlock[] {
  const m = ix.m;
  const roomId = state.room;
  const room = pack.rooms[roomId];
  const blocks: OutputBlock[] = [{ kind: "room-title", spans: [{ text: room?.name ?? roomId }] }];
  if (room) {
    const desc = resolveText(pack, state, room.description);
    if (desc !== null) blocks.push(...textBlocks(pack, "text", desc));
  }

  const roomTexts: Span[][] = [];
  const loose: Span[][] = [];
  const containers: string[] = [];
  for (const id of ix.objectIds) {
    const def = pack.objects[id];
    const os = state.objects[id];
    if (!def || !os || os.hidden) continue;
    const direct = os.location === roomId;
    if (def.roomText !== undefined && (direct || def.alsoIn?.includes(roomId))) {
      const text = resolveText(pack, state, def.roomText);
      if (text !== null) roomTexts.push(inlineSpans(pack, text));
    } else if (direct && (def.portable || def.clue)) {
      loose.push(objectSpan(pack, id));
    }
    if (direct && def.container) containers.push(id);
  }
  if (roomTexts.length > 0) blocks.push({ kind: "text", spans: joinSpans(roomTexts, " ") });
  if (loose.length > 0) blocks.push({ kind: "text", spans: fmt(m.hereLies, { list: joinSpans(loose) }) });
  for (const id of containers) {
    const line = contentsLine(pack, ix, state, id);
    if (line) blocks.push(line);
  }

  const exits = listedExits(pack, state);
  if (exits.length > 0) {
    const labels = exits.map(({ id, exit }) => [{ text: exitLabel(m, id, exit) }]);
    blocks.push({ kind: "system", spans: fmt(m.exits, { list: joinSpans(labels) }) });
  }
  return blocks;
}

/** Visible objects directly inside a container, in pack order (empty when it is closed). */
export function visibleContents(pack: Pack, ix: PackIndex, state: GameState, containerId: string): string[] {
  const cs = state.objects[containerId];
  if (!cs || cs.hidden) return [];
  if (pack.objects[containerId]?.openable && !cs.open) return [];
  const out: string[] = [];
  for (const id of ix.objectIds) {
    const os = state.objects[id];
    if (os && !os.hidden && os.location === containerId) out.push(id);
  }
  return out;
}

/** "In Schreibtisch: Brief." or null when nothing is visible inside. */
export function contentsLine(pack: Pack, ix: PackIndex, state: GameState, containerId: string): OutputBlock | null {
  const contents = visibleContents(pack, ix, state, containerId);
  if (contents.length === 0) return null;
  return {
    kind: "text",
    spans: fmt(ix.m.contents, {
      obj: objectSpan(pack, containerId),
      list: joinSpans(contents.map((id) => objectSpan(pack, id))),
    }),
  };
}

/** `look obj`: description (or "nothing special"); for containers: closed, contents or empty. */
export function examineBlocks(pack: Pack, ix: PackIndex, state: GameState, id: string): OutputBlock[] {
  const m = ix.m;
  const def = pack.objects[id];
  const blocks: OutputBlock[] = [];
  const desc = resolveText(pack, state, def?.description);
  if (desc !== null) blocks.push(...textBlocks(pack, "text", desc));
  else blocks.push({ kind: "text", spans: fmt(m.nothingSpecial) });
  if (def?.container) {
    if (def.openable && !state.objects[id]?.open) blocks.push({ kind: "text", spans: fmt(m.isClosed) });
    else blocks.push(contentsLine(pack, ix, state, id) ?? { kind: "text", spans: fmt(m.isEmpty) });
  }
  return blocks;
}

/** Inventory listing: carried items, contents of open carried containers, notebook. */
export function inventoryBlocks(pack: Pack, ix: PackIndex, state: GameState): OutputBlock[] {
  const m = ix.m;
  const items: Span[][] = [];
  const clues: Span[][] = [];
  const containers: string[] = [];
  for (const id of ix.objectIds) {
    const def = pack.objects[id];
    const os = state.objects[id];
    if (!def || !os || os.hidden || os.location !== INVENTORY) continue;
    if (def.clue) clues.push(objectSpan(pack, id));
    else {
      items.push(objectSpan(pack, id));
      if (def.container) containers.push(id);
    }
  }
  const blocks: OutputBlock[] = [
    {
      kind: "text",
      spans: items.length > 0 ? fmt(m.carrying, { list: joinSpans(items) }) : fmt(m.carryingNothing),
    },
  ];
  for (const id of containers) {
    if (reachableRoot(pack, state, id) !== INVENTORY) continue;
    const line = contentsLine(pack, ix, state, id);
    if (line) blocks.push(line);
  }
  if (clues.length > 0) blocks.push({ kind: "text", spans: fmt(m.notebook, { list: joinSpans(clues) }) });
  return blocks;
}
