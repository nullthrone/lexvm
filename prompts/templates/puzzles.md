<!-- template: stage 2 (puzzle design). Output: the document design/puzzles.md. Placeholders: IDEA LANG MINUTES CONCEPT. -->
# Stage 2 of 4: puzzles

Design the puzzles for the adventure described in the concept below, as a **puzzle dependency chart** (Ron Gilbert). Target play time: about {{MINUTES}} minutes; pack language: {{LANG}}.

Write a Markdown document with these sections:

1. **Chart:** a Mermaid `flowchart TD` from the start to the winning ending. Nodes are puzzles, events, items and clues (use their ids); an arrow means "is needed for". The chart must branch: at almost every point the player has two or three open puzzles. About 6–8 puzzles for 30–45 minutes.
2. **Puzzles:** for each puzzle, in solving order:
   - id and one-line goal;
   - the obstacle, and where it is signposted in the text before the player must solve it;
   - the solution in canonical commands (`use brass_key study_door`, `show clue_ticket inspector`, `choose ask_alibi`);
   - plausible wrong attempts and the custom response each deserves;
   - what it unlocks, the flags it sets, and its score;
   - hint steps: nudge → direction → solution.
3. **State:** all flags (with initial values) and counters the logic will need, one line each.
4. **Dialogues:** for each character, the hub topics, which options are gated by which clue, and what each reveals.
5. **Forgiving check:** for each item or clue that is used up, given away or moved, explain why the game stays winnable; confirm there is no losing ending.

Answer with the Markdown document only, starting with `# Puzzles`.

# Concept

{{CONCEPT}}

# The original idea

{{IDEA}}
