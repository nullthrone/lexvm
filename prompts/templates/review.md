<!-- template: editorial review round. Output: only the changed files, each complete. Placeholders: LANG PACING BUDGET STORY TRANSCRIPT FILES. -->
# Editorial review

The pack below passes every check of `lexvm check`: it can be won and has no dead ends. Now review it as a **story editor**. Below is the transcript of a winning play — everything the player reads along the walkthrough, in order (`lexvm transcript`). Pack language: {{LANG}}; pacing: {{PACING}}.

{{BUDGET}}

Read the transcript from start to end as a player would, then judge it against the story document and this rubric:

1. **Can it be followed?** After each chapter, could a reader retell what happened, who wants what, and why? Mark every step that happens without a reason the player can see, and every fact the ending relies on that the transcript never states.
2. **Arrivals and transitions:** does each first arrival say where the player is, who is here and what is at stake? Is it clear why the player goes on, and where?
3. **What a clue means:** after each key clue or deduction, does the player character say in a sentence or two what it changes?
4. **Turning points:** is the turning point of every major conversation written out as a scene, with a reaction, or reduced to one line of information?
5. **Characters:** does each one want something visible and speak like themselves?
6. **Rhythm:** varied sentence lengths, thoughts joined by their logic. Rewrite telegram-style chains of fragments; cut adjective padding and repeated atmosphere.

Then improve the **text** of the pack:

- Change player-facing text only: descriptions and their variants, `say` texts, dialogue lines, the intro, endings. Add text variants or `once` rules on `enter` for arrivals and chapter transitions where a scene is missing.
- Do not change ids, conditions, effects, exits, scores, hints' conditions or the walkthrough, unless a new transition rule needs a flag (declare it in `pack.yaml`). Every `{id}` reference must stay valid, and every interactable object must stay mentioned in its room.
- Keep within the text budgets of the pack's pacing and keep the reading share near its target: write out scenes where the transcript is thin, cut where it repeats itself.
- Return **only the files you changed**, each one **complete**, in fenced blocks named with `file=` as usual. Then list your five most important changes, one line each.

# Transcript of the walkthrough

{{TRANSCRIPT}}

# Story (design)

{{STORY}}

# Current files

{{FILES}}
