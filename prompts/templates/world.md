<!-- template: stage 3 (world). Output files: pack.yaml, rooms.yaml, objects.yaml. Placeholders: LANG MINUTES PACK_ID AUTHOR LICENSE GENERATOR CONCEPT PUZZLES. -->
# Stage 3 of 4: world

Build the **world** of the adventure from the concept and the puzzle design below: metadata, rooms, exits and objects. The next stage writes rules, dialogues, endings, hints and the walkthrough on top of it, so define every room, object and clue the puzzles need now.

Return exactly these three files:

1. `pack.yaml` — metadata and global declarations:
   - `format: lexvm-pack/1`, `id: {{PACK_ID}}`, `version: 1.0.0`, `title`, optional `subtitle`, `description`, `language` ({{LANG}}), `playtime: {{MINUTES}}`, `policy: forgiving`, `maxScore` (the total from the puzzle design);
   - `author`: {{AUTHOR}};
   - `license`: {{LICENSE}};
   - `generator`: {{GENERATOR}};
   - `start` (room and intro), `verbs` (pack verbs with label and synonyms), `flags` (every flag from the puzzle design, with its initial value) and `counters` (if any).
2. `rooms.yaml` — the `rooms` map: every room with name, description (text variants where the state changes the room) and exits. Every exit has its reverse in the destination room; doors are named in both exits.
3. `objects.yaml` — the `objects` map: items, scenery, characters (with `npc: true` and `dialogue: <npc_id>_talk`; the next stage writes these dialogues), containers, doors, and every clue (`clue: true`, `location: nowhere`).

Requirements:
- Every interactable object is referenced as `{id}` in its room's description or has a `roomText`.
- Object descriptions carry the signposting described in the puzzle design.
- Respect the text budgets and the language conventions of the guide.
- Do not write rules, dialogues, endings, hints or the walkthrough yet.

# Concept

{{CONCEPT}}

# Puzzle design

{{PUZZLES}}
