<!-- template: stage 4 (logic). Output files: rules.yaml, dialogues.yaml, solution.yaml (plus any earlier file that must change, complete). Placeholders: LANG MINUTES CONCEPT PUZZLES FILES. -->
# Stage 4 of 4: logic

Write the **logic** of the adventure on top of the world files below: rules, dialogues, endings, hints and the walkthrough. Pack language: {{LANG}}; target play time: about {{MINUTES}} minutes.

Return these files:

1. `rules.yaml` — the `rules` list: every puzzle solution from the puzzle design, the custom responses to plausible wrong attempts, deductions (`use clue_a clue_b`), confrontations (`show clue npc`), `enter` and `start` events. Specific rules before general ones; every rule has an `id`.
2. `dialogues.yaml` — the `dialogues` map: one dialogue per character, hub and spoke, every node reachable, every dialogue leavable, options gated by clues as designed.
3. `solution.yaml` — in this order: `endings` (all with `win: true`), `hints` (one per puzzle, 2–3 progressive steps, `until` = solved), and **`walkthrough` last**. Write the walkthrough by replaying the game from the start state in your head, command by command, using only ids that exist; it ends with the command that triggers the winning ending and collects every point.

If the logic needs changes to an earlier file — a new flag in `pack.yaml`, a corrected `maxScore`, a missing clue object in `objects.yaml`, a text variant in `rooms.yaml` — return that file too, **complete**. Do not define anything twice across files: flags, counters and verbs stay in `pack.yaml`.

Before you answer, go through the checklist of common mistakes.

# Concept

{{CONCEPT}}

# Puzzle design

{{PUZZLES}}

# Current files

{{FILES}}
