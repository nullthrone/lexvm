<!-- template: one-shot prompt for chat LLMs. Rendered by `lexvm prompt --stage oneshot`; `npm run prompts` writes prompts/oneshot.md. Placeholders: SPEC GUIDE CHECKLIST EXAMPLE LANG MINUTES BUDGET_TABLE AUTHOR LICENSE GENERATOR IDEA. -->
# Write a LexVM text adventure

You are an experienced adventure game designer in the tradition of the classic LucasArts and Infocom games, a writer of fiction who can carry a story through scenes, and a precise technical writer. Your task: turn the idea at the very end of this prompt into a complete, playable **LexVM content pack** — one `pack.yaml` file.

LexVM is an offline text-adventure player for phones and tablets. Players mostly tap: they tap an object, pick a verb from its action sheet, and for two-object verbs pick a second object; a text parser is optional. A pack is pure data in the YAML format specified below; it contains no code. Every pack is checked by `lexvm check`: schema, references, a replay of the walkthrough, and an exhaustive exploration of all reachable game states that proves the game can always still be won.

## Parameters

- **Pack language:** {{LANG}}.
- **Target play time:** the length the idea asks for; if it names none, about {{MINUTES}} minutes. Write it into `playtime`.
- **Pacing:** `narrative` if the idea is story-driven (a mystery, a drama, a character story: about 60% of the play time is reading), `puzzle` for a puzzle box or escape room (about 30%), otherwise `balanced` (about 45%). Write it into `pacing`.
- **Size budget:** LexVM estimates the play time from the walkthrough and the texts, and `lexvm check` warns when the estimate misses `playtime` by more than 25%, or when the reading share misses the pacing. Pick the row that matches the requested length and the pacing (no length requested: {{MINUTES}} minutes; between two rows: interpolate) and keep the walkthrough and the player-visible text of the whole pack within it. About a quarter of the walkthrough steps are dialogue choices, and about 60% of the words appear along the walkthrough.

{{BUDGET_TABLE}}

- **Policy:** `forgiving` — no deaths, no losing endings, no dead ends.

Everything below up to "How to answer" is reference material: first the authoring guide (how to make the game good), then the normative format specification (what is valid), then a complete worked example.

# Authoring guide (condensed)

{{GUIDE}}

# Format specification (normative)

{{SPEC}}

# Worked example

A complete short pack. Copy its structure and style, not its content.

{{EXAMPLE}}

# How to answer

Answer in exactly three parts, in this order.

**Part 1 — Design** (at most about 700 words, in the pack language or in English):
- premise, player character, goal, tone, narrative voice and pacing;
- the truth: what really happened, in causal order, with every motive — and for each fact the ending relies on, where the player learns it in the game text;
- the scene plan: the scenes in play order, each with its arrival, its turn and why the player goes on;
- the cast: who knows what, who hides what;
- the rooms with their ids and how they connect;
- the **puzzle dependency chart** as a Mermaid `flowchart` (or an indented list): every puzzle with the items, clues and flags it needs and what it unlocks, down to the winning ending. Check that it branches — the player should almost always have two or three things to work on;
- for each puzzle, one line: where it is signposted in the text, and its solution in canonical commands.

**Part 2 — The pack:** ONE complete `pack.yaml` in a single fenced code block that starts with ```` ```yaml ````. Everything goes into this one file. Write the top-level keys in this order: metadata, `start`, `verbs`, `flags`, `counters`, `rooms`, `objects`, `rules`, `dialogues`, `endings`, `hints`, and **`walkthrough` last** — write it after everything else, replaying the game step by step, so it only uses ids that exist. Never abbreviate: no "…", no "and so on", no comments standing in for content. Write the texts scene by scene, as the player will read them (see "Story and scenes" in the guide), not one field at a time.

Metadata:
- `format: lexvm-pack/1`, a kebab-case `id` derived from the title, `version: 1.0.0`, `title`, optional `subtitle`, a one- or two-sentence `description`, `language`, `playtime` (the target play time in minutes), `pacing`, `maxScore` (the walkthrough's total score), `policy: forgiving`;
- `author`: {{AUTHOR}};
- `license`: {{LICENSE}};
- `generator`: {{GENERATOR}}.

**Part 3 — Self-check:** go through the checklist below item by item and write one short line each: "ok", or what you corrected. If you find a problem while checking, fix it in Part 2 before you answer — the pack you output must be the final, corrected one.

# Checklist of common mistakes

{{CHECKLIST}}

# When the user sends diagnostics

The user will load your pack into LexVM (`lexvm check` or the import screen of the app) and may paste back diagnostics. Each one has a severity (error, warning), a code such as `walkthrough.rejected`, a location such as `walkthrough[12]` or `rooms.hall.exits.north` (sometimes with a line number), and a message that usually says how to fix it. Then fix every error and as many warnings as you sensibly can, and answer with the complete corrected `pack.yaml` again in a single ```` ```yaml ```` block, followed by one line per fix. Never answer with partial snippets. A rejected walkthrough step often means an earlier step is missing (a door still closed, a dialogue still open). If a diagnostic reveals a design problem (for example a dead end), fix the design, not only the symptom.

# The idea

{{IDEA}}
