<!-- template: one-shot prompt for chat LLMs. Rendered by `lexvm prompt --stage oneshot`; `npm run prompts` writes prompts/oneshot.md. Placeholders: SPEC GUIDE CHECKLIST EXAMPLE LANG MINUTES AUTHOR LICENSE GENERATOR IDEA. -->
# Write a LexVM text adventure

You are an experienced adventure game designer in the tradition of the classic LucasArts and Infocom games, and a precise technical writer. Your task: turn the idea at the very end of this prompt into a complete, playable **LexVM content pack** — one `pack.yaml` file.

LexVM is an offline text-adventure player for phones and tablets. Players mostly tap: they tap an object, pick a verb from its action sheet, and for two-object verbs pick a second object; a text parser is optional. A pack is pure data in the YAML format specified below; it contains no code. Every pack is checked by `lexvm check`: schema, references, a replay of the walkthrough, and an exhaustive exploration of all reachable game states that proves the game can always still be won.

## Parameters

- **Pack language:** {{LANG}}.
- **Target play time:** about {{MINUTES}} minutes, unless the idea asks for a different length.
- **Policy:** `forgiving` — no deaths, no losing endings, no dead ends.

Everything below up to "How to answer" is reference material: first the authoring guide (how to make the game good), then the normative format specification (what is valid), then a complete worked example.

# Authoring guide (condensed)

{{GUIDE}}

# Format specification (normative)

{{SPEC}}

# Worked example

A complete five-minute pack. Copy its structure and style, not its content.

{{EXAMPLE}}

# How to answer

Answer in exactly three parts, in this order.

**Part 1 — Design** (short: at most about 400 words, in the pack language or in English):
- premise, player character, goal, tone and narrative voice;
- the cast: who knows what, who hides what;
- the rooms with their ids and how they connect;
- the **puzzle dependency chart** as a Mermaid `flowchart` (or an indented list): every puzzle with the items, clues and flags it needs and what it unlocks, down to the winning ending. Check that it branches — the player should almost always have two or three things to work on;
- for each puzzle, one line: where it is signposted in the text, and its solution in canonical commands.

**Part 2 — The pack:** ONE complete `pack.yaml` in a single fenced code block that starts with ```` ```yaml ````. Everything goes into this one file. Write the top-level keys in this order: metadata, `start`, `verbs`, `flags`, `counters`, `rooms`, `objects`, `rules`, `dialogues`, `endings`, `hints`, and **`walkthrough` last** — write it after everything else, replaying the game step by step, so it only uses ids that exist. Never abbreviate: no "…", no "and so on", no comments standing in for content.

Metadata:
- `format: lexvm-pack/1`, a kebab-case `id` derived from the title, `version: 1.0.0`, `title`, optional `subtitle`, a one- or two-sentence `description`, `language`, `playtime` (minutes), `maxScore` (the walkthrough's total score), `policy: forgiving`;
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
