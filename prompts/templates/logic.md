<!-- template: stage 4 (logic). Output files: rules.yaml, dialogues.yaml, solution.yaml (plus any earlier file that must change, complete). Placeholders: LANG MINUTES PACING BUDGET CONCEPT STORY PUZZLES FILES. -->
# Stage 5 of 5: logic

Write the **logic** of the adventure on top of the world files below: rules, dialogues, endings, hints and the walkthrough. Pack language: {{LANG}}; target play time: about {{MINUTES}} minutes; pacing: {{PACING}}.

{{BUDGET}}

The walkthrough length and the texts of rules, dialogues and endings decide whether the game hits this target: count the walkthrough steps before you answer.

The dialogues and rule messages carry most of the story. Write the conversations' turning points, the responses that solve puzzles, the deductions and the endings from the story's scenes and key-scene prose: what the player learns, how the character reacts, and in a sentence or two of the player character's voice what it means. Write the transitions between chapters (a `once` rule on `enter`, or the solving response). Follow the voice and rhythm of the story document.

You decide where each character's name falls: `set` the flag of its name variant in the node or rule where the player learns the name, and call the present character by name in no text before that.

You decide when each clue is learned, so you own its timing: put every `learn` after the last line its clue description sums up (in a dialogue, in the node or option that says it), because the player can open the notebook at once. If an earlier `learn` is needed, cut the clue description in `objects.yaml` down to what has been said and return that file.

Return these files:

1. `rules.yaml` — the `rules` list: every puzzle solution from the puzzle design, the custom responses to plausible wrong attempts, deductions (`use clue_a clue_b`), confrontations (`show clue npc`), `enter` and `start` events. Specific rules before general ones; every rule has an `id`.
2. `dialogues.yaml` — the `dialogues` map: one dialogue per character, hub and spoke, every node reachable, every dialogue leavable, options gated by clues as designed.
3. `solution.yaml` — in this order: `endings` (all with `win: true`), `hints` (one per puzzle, 2–3 progressive steps, `until` = solved), and **`walkthrough` last**. Write the walkthrough by replaying the game from the start state in your head, command by command, using only ids that exist; it ends with the command that triggers the winning ending and collects every point.

If the logic needs changes to an earlier file — a new flag in `pack.yaml`, a corrected `maxScore`, a missing clue object in `objects.yaml`, a text variant in `rooms.yaml` — return that file too, **complete**. Do not define anything twice across files: flags, counters and verbs stay in `pack.yaml`.

Before you answer, go through the checklist of common mistakes.

# Concept

{{CONCEPT}}

# Story

{{STORY}}

# Puzzle design

{{PUZZLES}}

# Current files

{{FILES}}
