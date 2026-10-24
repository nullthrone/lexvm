# Write a LexVM text adventure

You are an experienced adventure game designer in the tradition of the classic LucasArts and Infocom games, a writer of fiction who can carry a story through scenes, and a precise technical writer. Your task: turn the idea at the very end of this prompt into a complete, playable **LexVM content pack** — one `pack.yaml` file.

LexVM is an offline text-adventure player for phones and tablets. Players mostly tap: they tap an object, pick a verb from its action sheet, and for two-object verbs pick a second object; a text parser is optional. A pack is pure data in the YAML format specified below; it contains no code. Every pack is checked by `lexvm check`: schema, references, a replay of the walkthrough, and an exhaustive exploration of all reachable game states that proves the game can always still be won.

## Parameters

- **Pack language:** the language the idea is written in — `de` for German, `en` for English. LexVM supports these two pack languages; if the idea is written in another language, use English (`en`) unless the user asks for German.
- **Target play time:** the length the idea asks for; if it names none, about 30 minutes. Write it into `playtime`.
- **Pacing:** `narrative` if the idea is story-driven (a mystery, a drama, a character story: about 60% of the play time is reading), `puzzle` for a puzzle box or escape room (about 30%), otherwise `balanced` (about 45%). Write it into `pacing`.
- **Size budget:** LexVM estimates the play time from the walkthrough and the texts, and `lexvm check` warns when the estimate misses `playtime` by more than 25%, or when the reading share misses the pacing. Pick the row that matches the requested length and the pacing (no length requested: 30 minutes; between two rows: interpolate) and keep the walkthrough and the player-visible text of the whole pack within it. About a quarter of the walkthrough steps are dialogue choices, and about 60% of the words appear along the walkthrough.

| Play time | Pacing | `de`: walkthrough steps | `de`: words of text | `en`: walkthrough steps | `en`: words of text |
|---|---|---|---|---|---|
| 15 min | narrative | 17–21 | 1,900–2,350 | 17–21 | 2,150–2,700 |
| 15 min | balanced | 23–29 | 1,390–1,780 | 23–29 | 1,600–2,050 |
| 15 min | puzzle | 30–37 | 930–1,190 | 30–37 | 1,070–1,360 |
| 30 min | narrative | 34–42 | 3,750–4,750 | 34–42 | 4,300–5,450 |
| 30 min | balanced | 46–58 | 2,800–3,550 | 46–58 | 3,200–4,100 |
| 30 min | puzzle | 59–74 | 1,900–2,350 | 59–74 | 2,150–2,700 |
| 45 min | narrative | 50–64 | 5,600–7,100 | 50–64 | 6,400–8,200 |
| 45 min | balanced | 69–88 | 4,200–5,350 | 69–88 | 4,800–6,150 |
| 45 min | puzzle | 88–112 | 2,800–3,550 | 88–112 | 3,200–4,100 |
| 60 min | narrative | 67–85 | 7,450–9,500 | 67–85 | 8,550–10,950 |
| 60 min | balanced | 92–117 | 5,600–7,100 | 92–117 | 6,400–8,200 |
| 60 min | puzzle | 117–149 | 3,750–4,750 | 117–149 | 4,300–5,450 |

- **Policy:** `forgiving` — no deaths, no losing endings, no dead ends.

Everything below up to "How to answer" is reference material: first the authoring guide (how to make the game good), then the normative format specification (what is valid), then a complete worked example.

# Authoring guide (condensed)

## Shape and pacing
- A 30–45 minute game has about 10–12 rooms, 6–8 puzzles, 3–5 characters and 8–15 clues or key items. Scale proportionally for other lengths (15 minutes: ~5 rooms, 3–4 puzzles).
- The intro states a clear goal; the first small success comes within the first few minutes.
- Structure the game in 2–3 chapters separated by bottlenecks (a key event everything converges on). Within a chapter several puzzles are open at once.
- End with a climax that uses what the player learned (a confrontation, a deduction), then a winning ending.
- Score is a progress signal: usually 1 point per solved puzzle, 2 for a major deduction. Award each point exactly once (guard with a flag, a `not: { has: … }` condition or a `once` rule). `maxScore` equals the total score collected by the walkthrough.

## Story and scenes
- Write the story before the data: the truth in causal order (who did what, and why), the player character's goal and how their understanding changes, and a scene plan in play order. Then derive room, object, dialogue and rule texts from the scenes.
- Everything the ending relies on reaches the player in game text. Motives, relationships and backstory that only live in the design notes do not exist for the player.
- Every scene has an arrival (where am I, who is here, what is at stake), a turn (something learned or changed) and a way out (why the player goes on, and where). Write the transitions: the first entry to a room, the moment after a key clue, the move from one chapter to the next (a `once` rule on `enter`, or the response that solves the puzzle).
- Give the player character an inner voice in moderation: after a key clue or deduction, one or two sentences on what it means and what follows from it. That is how a reader keeps track of a case.
- Characters want something the player can see, and speak like themselves. A conversation has a turning point; write it out as a scene, not as one line of information.
- Prose rhythm: vary sentence length. Short sentences are accents, not the default; join thoughts that belong together with their logic (because, but, so, while). No telegram style, no chains of fragments, no adjective padding.
- Review the transcript of the walkthrough (`lexvm transcript`): it must read as a story a reader can follow from start to end.

## Length budget and pacing
- LexVM estimates the play time of a pack: reading the text the walkthrough shows (German 200, English 230 words per minute), about 10 seconds per walkthrough command and 6 per dialogue choice, plus part of the optional content (descriptions the walkthrough never examines, unchosen dialogue options, custom responses) and about one wrong attempt per productive command. `lexvm check` warns when the estimate misses `playtime` by more than 25%; set `playtime` to the target length.
- `pacing` says how that time divides between reading and acting: `narrative` (about 60% reading: mysteries, dramas, character stories), `balanced` (about 45%, the default), `puzzle` (about 30%: puzzle boxes, escape rooms). Declare it in the metadata; `lexvm check` then warns when the reading share leaves the band (±10 points). A narrative pack with the same play time has fewer puzzles and more story.
- Follow the size budget the prompt gives for the target length and pacing (walkthrough steps and words of player-visible text). About a quarter of the walkthrough steps are dialogue choices; optional text is about 60% of the walkthrough's text.
- Length comes from content, never from padding. Content is both mechanics (a puzzle, a character to question, custom responses) and story (an arrival, a turning point, what a clue means, a transition between acts). Padding is adjectives, repeated atmosphere and summaries of what the player just saw. To shorten a narrative pack, cut a side puzzle before you cut a scene.

## Puzzle dependency chart
- Design the puzzles as a dependency chart (Ron Gilbert): start from the winning ending and work backwards — what must be true right before it, and what before that. Nodes are puzzles, events, items and clues; an arrow means "is needed for".
- The chart must branch: at nearly every point the player has 2–3 open puzzles in parallel. Never build one long linear chain.
- Every node has a concrete solution in canonical commands, a place in the text where it is signposted, and a hint.
- Every item or clue a puzzle needs is obtainable before that puzzle and can never be lost afterwards.
- Example (Mermaid):
  ```mermaid
  flowchart TD
    intro([Start]) --> photo[Find photo in desk]
    intro --> harbour[Go to harbour]
    photo --> lie((Clue: barkeeper lied))
    harbour --> night((Clue: ship left at night))
    lie --> deduce{use clue_lie clue_night}
    night --> deduce
    deduce --> confront[Confront captain] --> win([Ending])
  ```

## The LucasArts rules (forgiving policy)
- No deaths and no losing endings: every ending has `win: true`. Danger is a narrow escape ("You step back just in time.") that leaves the game state as it was.
- No dead ends: from every reachable state the game stays winnable. Never consume, destroy or give away an item that is still needed; if an action uses an item up, record the result permanently (a flag) instead of needing the item again. Never lock the player out of a room they still need.
- Players can drop carried items. If one the solution needs could be left behind a one-way exit, keep it with the player: a rule `on: { verb: drop, object: key }` that only says why (`lexvm check` explores dropping as well).
- Progress never depends on `inventory` or another command that no action sheet offers: the inventory button only shows the bag.
- Essential information must stay obtainable. Dialogue options with `once: true` are fine when the option `learn`s the clue (clues are permanent); otherwise keep a repeatable way to get the information.
- No "guess the verb": solutions use the core verbs (look, take, open, close, use, talk, give, show, push, pull, go) or a pack verb that the object lists in its `verbs`, so it appears in the action sheet.
- No pixel hunting: every object the player can interact with is visibly mentioned. Hidden objects are revealed with a clear message (`say` + `reveal`).
- No timed puzzles, no mazes, no randomness (the engine has none).

## Fair clueing
- Signpost every puzzle in the text before the player must solve it: describe the obstacle, and hint at the solution through an observation, a character's remark or a document. Important solutions get two independent hints.
- Answer plausible wrong attempts with specific rules that teach something: `use rusty_key cellar_door` → "The key is far too small for this lock." Reserve the engine's default "That doesn't work." for implausible ideas.
- Examine texts carry the clues: an object description says what is odd or useful about the object.
- Reflect state changes with text variants (`when`) in room and object descriptions (the door now stands open, the drawer is empty).

## Rules and state
- Rules replace defaults: a rule for `take x` must `move` x to `inventory` itself if the player should get it.
- Only the first matching command rule whose `when` holds fires. Put specific rules before general ones; add a second rule for the "already done" response (see `pull_red_book` / `pull_red_book_again` in the example).
- Remember progress in flags; guard one-time effects (score, reveal, learn) with `when: { not: { flag: … } }` or `once: true` plus an `id`.
- Doors: an openable, non-container object with `locked: true` and `unlockedBy: key_id`; the default `use key_id door_id` unlocks it, `open door_id` opens it; both exits name the door.
- Containers: `container: true`, `openable: true`, `open: false`; contents are only present while open.
- Counters changed by `turn` rules must be bounded by their `when`. Prefer flags over counters.

## Characters and dialogue
- Hub and spoke: a dialogue starts at a hub node (e.g. `hello`) that offers topics; each topic node leads back to the hub ("I see." → `goto: hello`). The hub always has a way out: an option without `goto` ("Goodbye.").
- Interrogations progress by knowledge: options with `when: { has: clue_x }` appear once the player knows something. `once: true` hides an option after use.
- Confrontations: let the player show evidence — a rule `on: { verb: show, object: clue_x, with: npc_id }` — or offer a dialogue option gated by `has: clue_x`. Give characters a reaction to every clue that plausibly concerns them, and one generic reaction (`on: { verb: show, with: npc_id }`) placed after the specific rules.
- Characters remember: change greetings and descriptions with flags after key events.
- Node `say` ≤ 300 characters, option text ≤ 80. Options are the player's words; narration belongs in `say` or `do`.

## Clues and deductions
- A clue is a piece of knowledge: an object with `clue: true` and `location: nowhere`, acquired with the `learn` effect (reading a document, examining something, a dialogue). Clues sit in the notebook and cannot be dropped or lost.
- Clue names are short and telling (≤ 24 characters: "Torn ticket", "Alibi gap"); the description states the fact.
- Deductions combine two clues: a rule `on: { verb: use, object: clue_a, with: clue_b }` with `when: { not: { has: clue_c } }` that `learn`s the conclusion `clue_c` (rules are tried in both orders). Only ask for deductions a player can reasonably see; answer plausible wrong combinations gently.
- Players tap a clue and choose "Combine with …" ("Kombinieren mit …"), which sends `use`; typed, "combine X with Y" / "kombiniere X mit Y" / "vergleiche X mit Y" work. If the story depends on deductions, teach combining once early (a line of inner voice or the first hint step).
- Interrogations and confrontations use clues as evidence (see dialogue).

## Hints
- Every puzzle has a hint: `when` = the puzzle is known (room visited, clue held), `until` = the puzzle is solved (flag set, item held, room visited).
- 2–3 progressive steps: a nudge ("The butler seems to know more than he says."), a direction ("Ask him about last night."), the explicit solution ("Talk to Graves and ask where your uncle is.").
- The first hint whose `when` holds and whose `until` does not is shown, so order hints in the usual solving order, and make sure some hint applies at every point until the ending.

## Text for phone screens
- Budgets: room descriptions ≤ 600 characters, object descriptions ≤ 400, dialogue lines ≤ 300 (`pacing: narrative`: 1,000, 600 and 600); option texts ≤ 80, names ≤ 24 for every pacing. The player scrolls like a book; a long text needs paragraphs, not cuts.
- Paragraphs of 1–4 sentences, separated by a blank line. In descriptions the first sentence says what matters; atmosphere second.
- First visits get the full scene; return visits to a room get one or two sentences (a text variant with `visited`).
- Mention exits naturally in the room description ("The library lies to the west.").
- Every interactable object appears as `{id}` (or `{id|inflected text}`) in its room's description or in its own `roomText`. Portable objects without `roomText` are listed automatically.
- Names are short, without articles, and distinct: "brass key", not "the small brass key".
- Rule messages (`say`) are 1–3 sentences; the response that solves a puzzle or reveals a clue may be a short scene.

## Language conventions
- All player-facing text is in the pack `language`. Ids are ASCII `lower_snake_case` (English ids are fine for any language).
- German (`de`): narrate in the du-form, present tense ("Du stehst im Kontor.") unless the pack deliberately decides otherwise — then stay consistent. Each character consistently says "Sie" or "du" to the player, as fits the setting. Object names without articles ("Logbuch", "Messingschlüssel"). Inflected references use `{id|text}`: `{logbook|des Logbuchs}`, `{door|die Tür}`. Quotes »…« or „…“ — choose one style and use it everywhere. Real umlauts and ß. Add inflected and short forms to `synonyms` (`[Logbuchs, Buch]`).
- English (`en`): second person, present tense ("You are in the hall."). Names lower case except proper nouns ("brass key", "Graves"). One quote style throughout.
- Pack verbs need a `label` in the pack language and parser `synonyms` (German: imperative and infinitive, e.g. `[lies, lese, lesen]`).

## YAML pitfalls
- Prefer block style. Use flow style (`{ … }`, `[ … ]`) only for short, simple values like `{ to: hall }`, `{ has: brass_key }`, `[pull]`.
- Inside a flow mapping, `, ` and `: ` end the value: `do: { say: Hello, world }` is broken. Write effects that contain text in block style:
  ```yaml
  do:
    - say: "Hello, world: nice to see you."
  ```
- Quote a string with double quotes if it contains `: ` or ` #`, ends with `:`, or starts with `"`, `'`, `{`, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, a backtick, `- `, `? ` or `: `. Inside double quotes escape `"` as `\"` (or use »…« / “…” quotes, which need no escaping). Inside single quotes write an apostrophe as `''`.
- Multi-paragraph text: a literal block `|-` with a blank line between paragraphs.
- `version: 1.0.0` (three numbers; `1.0` would be a number). Booleans are `true`/`false` only.
- Indent with two spaces, never tabs.

## The walkthrough
- A list of canonical commands with ids — never display names or translated words: `take brass_key`, `go north`, `use brass_key study_door`, `give coin ferryman`, `show clue_ticket inspector`, `talk graves`, `choose ask_uncle`, `read letter` (pack verb).
- Two-object commands list both ids without a preposition: `use a b`, `give a b`, `show a b`.
- Replay it in your head from the start: be in the right room; open doors and containers before going through or taking from them; reveal hidden objects before taking them; inside a dialogue only `choose <option_id>` works, for an option available at that moment; leave the dialogue (an option without `goto`) before the next non-dialogue command.
- It ends with the command that triggers the winning ending, and collects every point (total = `maxScore`).
- Write it last, after all rooms, objects, rules and dialogues exist.

# Format specification (normative)

## LexVM Content Pack Format — `lexvm-pack/1`

Status: **normative** for LexVM 0.x. The machine-readable source of truth is
[`packages/engine/src/schema.ts`](../../packages/engine/src/schema.ts); a JSON
Schema is generated from it with `npm run lexvm -- schema`. If this document and
the schema disagree, that is a bug, and both are fixed in the same PR.

A content pack is a complete text adventure expressed as **data**. It contains
no code. All game logic uses a closed vocabulary of *conditions* and *effects*.
That constraint gives the project four properties:

1. **Safety**: packs from strangers or LLMs cannot execute anything.
2. **Determinism**: the same commands always produce the same game.
3. **Verifiability**: tools can prove a pack is winnable and has no dead ends.
4. **Generatability**: an LLM can write a pack from this document alone.

---

### 1. Files

A pack lives in its own directory under `packs/<pack-id>/`:

```
packs/hamburg-1948/
  pack.yaml        # required: metadata (and optionally everything else)
  rooms.yaml       # optional: any number of additional *.yaml files
  objects.yaml
  dialogues.yaml
  design/          # optional: design notes, never compiled
```

The compiler reads `pack.yaml` first, then every other `*.yaml` / `*.json`
file in the directory (not subdirectories) in name order, and merges them by
top-level key:

- maps (`rooms`, `objects`, `flags`, …) are merged; a key defined twice is an error;
- lists (`rules`, `hints`, `walkthrough`) are concatenated in file order;
- scalars (`title`, `version`, …) may appear in one file only.

The compiled output is one normalised JSON file, `<pack-id>.lexpack.json`,
which is what the player loads. The player can also import `.yaml` and
`.lexpack.json` files directly.

### 2. Identifiers

- All ids (rooms, objects, flags, counters, verbs, rules, dialogues, nodes,
  options, endings, hints) are `lower_snake_case` and start with a letter:
  `^[a-z][a-z0-9_]*$`.
- Room ids and object ids share one namespace (both can be locations).
- `inventory` and `nowhere` are reserved and cannot be used as ids.
- The pack id is kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$`.

### 3. Top level

| Key | Type | Req. | Meaning |
|---|---|---|---|
| `format` | `"lexvm-pack/1"` | yes | Format version. |
| `id` | pack id | yes | Unique, stable id. |
| `version` | semver | yes | Bump on every content change; saves are bound to it. |
| `title`, `subtitle` | string | title | Display title. |
| `description` | string | yes | One or two sentences for the library. |
| `language` | BCP 47 | yes | Language of all player-facing text (`de`, `en`). Selects engine messages and parser. |
| `author` | string | yes | Human authors and/or the generating pipeline. |
| `license` | SPDX id | yes | License of the content, e.g. `CC-BY-4.0`. |
| `policy` | `"forgiving"` | no | Default and currently the only policy: no losing endings, no dead ends. |
| `generator` | `{pipeline?, notes?}` | no | Provenance, free text. |
| `playtime` | int (minutes) | no | Target play time. `lexvm check` compares its play time estimate against it (section 17). |
| `maxScore` | int | no | Enables the score display. |
| `start` | `{room, intro?}` | yes | Starting room and intro text. |
| `verbs` | map id → Verb | no | Pack verbs and overrides for core verbs. |
| `rooms` | map id → Room | yes | |
| `objects` | map id → Object | no | Items, scenery, characters, clues, containers, doors. |
| `flags` | map id → boolean | no | **All** flags with initial value. Using an undeclared flag is an error. |
| `counters` | map id → int | no | All counters with initial value. |
| `rules` | list of Rule | no | Game logic. Order matters. |
| `dialogues` | map id → Dialogue | no | Conversations. |
| `endings` | map id → Ending | yes | At least one winning ending. |
| `hints` | list of Hint | no | Progressive hints. Strongly recommended. |
| `walkthrough` | list of command strings | yes | A complete winning solution. Verified by `lexvm check`. |

### 4. Text

`Text` is either a string or a list of variants:

```yaml
description:
  - when: { flag: lamp_lit }
    text: The lamp throws a warm circle of light.
  - text: It is too dark to make out much.
```

The first variant whose `when` holds is used; a variant without `when` always
holds and should come last.

Inside strings:

- `{object_id}` renders the object's `name` as a tappable reference.
- `{object_id|display text}` renders custom text (for inflected forms such as
  German cases: `{logbook|des Logbuchs}`) as a reference to `object_id`.
- A blank line separates paragraphs; a single newline is a line break.
- Nothing else is markup. Text is never interpreted as HTML.

Keep texts short for phone screens: room descriptions ≤ 600 characters,
object descriptions ≤ 400, dialogue lines ≤ 300, option texts ≤ 80, names ≤ 24.
Longer texts produce warnings.

### 5. Rooms and exits

```yaml
rooms:
  harbour_office:
    name: Hafenkontor
    description: Ein enger Raum voller Aktenschränke. …
    exits:
      north: { to: quay }
      cellar:
        to: archive
        label: Kellertreppe
        door: cellar_hatch
        blocked: Die Luke ist verriegelt.
```

Exit ids `north south east west northeast northwest southeast southwest up down
in out` are standard: the engine provides localized labels and parser words.
Any other exit id needs a `label`.

| Exit key | Meaning |
|---|---|
| `to` | Destination room. |
| `label` | Chip label (required for non-standard ids). |
| `synonyms` | Extra parser words. |
| `visibleWhen` | Exit is listed only while this holds (secret passages). |
| `when` | Exit can be used only while this holds. |
| `door` | Door object; exit usable only while the door is open. |
| `blocked` | Text printed when the exit is listed but not usable. |

Exits are one-way. Add the reverse exit in the destination room explicitly.

### 6. Objects

Everything the player can refer to is an object.

| Key | Meaning |
|---|---|
| `name` | Display name without article, e.g. `Logbuch`, `brass key`. |
| `synonyms` | Extra parser words. The words of `name` always work. |
| `description` | Text printed on *look*. |
| `roomText` | Sentence appended to the room description while the object lies directly in the current room (or the current room is listed in its `alsoIn`). Objects without `roomText` that are portable are listed automatically ("You see here: …"). Scenery without `roomText` must be mentioned in the room description. |
| `location` | **Required.** Room id, container object id, `inventory` or `nowhere` (not in play yet). |
| `alsoIn` | Extra rooms where a non-portable object is present (doors, the sea, the sky). Only the object itself is present there, not its contents. |
| `portable` | Can be taken and dropped. |
| `clue` | A clue (piece of knowledge). Lives in the notebook part of the inventory; cannot be dropped. Usually starts `nowhere` and is acquired with the `learn` effect. |
| `npc` | A character: offers *talk*, receives *give* and *show*. |
| `dialogue` | Dialogue started by the default *talk* behaviour. |
| `container` | Holds objects. Contents are present while it is open (or if not `openable`). |
| `openable`, `open`, `locked` | Initial open/locked state. Doors are openable non-container objects. |
| `unlockedBy` | Key object for the default *use key with this* behaviour. |
| `hidden` | Absent until revealed with `reveal`. |
| `verbs` | Extra verbs offered in the action sheet (e.g. `read`, `push`). |

**Presence.** An object is *present* when it is not hidden and either its
location chain leads to the current room or to `inventory` (through containers
that are open or not openable), or the current room is listed in `alsoIn`.
`alsoIn` makes only the object itself present: a container listed in another
room's `alsoIn` does not bring its contents along. Commands can only refer to
present objects.

### 7. Verbs

Core verbs, implemented by the engine with default behaviour (section 10):

| id | Arity | Notes |
|---|---|---|
| `look` | 0 or 1 | 0 = describe room, 1 = examine object |
| `take`, `drop` | 1 | |
| `open`, `close` | 1 | |
| `use` | 1 or 2 | `use a` or `use a with b`; tried in both orders |
| `talk` | 1 | |
| `give`, `show` | 2 | `give item to npc`, `show item to npc` |
| `push`, `pull` | 1 | |
| `go` | exit | object is the exit id |
| `wait`, `inventory` | 0 | |
| `choose` | option | object is a dialogue option id |

Pack verbs add new verbs or relabel core verbs:

```yaml
verbs:
  read:
    label: Lesen
    synonyms: [lies, lese, lesen]
    default: Da gibt es nichts zu lesen.
  look:
    label: Untersuchen        # relabel a core verb
```

Pack verbs have `arity` 1 (default) or 2 (with `prep`). A pack verb only
appears in an object's action sheet if the object lists it in `verbs`; the
parser accepts it everywhere.

An entry for a core verb relabels it and adds parser words. For `push`,
`pull`, `use` and `wait` its `default` text also replaces the generic message
("Nothing happens.", "That doesn't work.", "Time passes."); other core verbs
ignore `default`. `go` and `choose` have fixed behaviour (exit chips, dialogue
option buttons): an entry for them changes nothing a player sees, and the
validator warns (`verb.reserved`).

**Action sheets.** Tapping an object offers `look`; `talk` for an `npc`;
`take` for a portable object or clue lying around; `open` or `close` for an
openable object; `use` for everything except characters. A carried object
offers `look`, `use`, `open`/`close` if openable, `show` (and `give`, not for
clues) while a character is in the room, and `drop` (not for clues). Every
verb listed in the object's `verbs` is added, core verbs included: `push`,
`pull` and `talk` on a non-character must be listed to be tappable. Two-object
verbs then ask for the second object. For a clue, players see `use` as
"Combine with …" ("Kombinieren mit …"), the other clues come first in the
list of second objects, and the notebook says that entries can be combined:
`use clue_a clue_b` is how deductions are tapped.

### 8. Conditions

Each condition is an object with **exactly one key**:

| Condition | True when |
|---|---|
| `{ has: obj }` | `obj` is in the inventory (top level). |
| `{ at: room }` | The player is in `room`. |
| `{ here: obj }` | `obj` is present (section 6). |
| `{ in: { object: obj, location: loc } }` | `obj`'s location is exactly `loc`. |
| `{ flag: f }` | Flag `f` is true. |
| `{ counter: { name: c, gte: 3, lt: 5 } }` | All given comparisons hold (`eq ne gt gte lt lte`). |
| `{ visited: room }` | The player has entered `room` before (the current room counts). |
| `{ isOpen: obj }` / `{ isLocked: obj }` | Object state. |
| `{ not: cond }` | |
| `{ all: [cond, …] }` / `{ any: [cond, …] }` | |

Wherever a key takes conditions (`when`, `until`, `visibleWhen`), a single
condition or a list may be given; a list means *all*.

### 9. Effects

Each effect is an object with **exactly one key**. Effects run in order; later
effects see the changes of earlier ones.

| Effect | Does |
|---|---|
| `{ say: text }` | Print text. |
| `{ move: { object: obj, to: loc } }` | Move an object to a room, container, `inventory` or `nowhere`. Silent. |
| `{ goto: room }` | Move the player; prints the room and fires `enter` rules. |
| `{ set: flag }` / `{ clear: flag }` | Set flag true / false. |
| `{ counter: { name: c, add: 1 } }` / `{ counter: { name: c, set: 0 } }` | Change a counter. |
| `{ open: obj }` `{ close: obj }` `{ lock: obj }` `{ unlock: obj }` | Change object state. Silent. |
| `{ reveal: obj }` / `{ hide: obj }` | Make an object visible / hidden. Silent. |
| `{ learn: clue }` | Put a clue into the notebook and announce it; a hidden clue becomes visible. No-op if already known. |
| `{ dialogue: id }` | Start a dialogue. |
| `{ endDialogue: true }` | Leave the current dialogue. |
| `{ score: n }` | Add points and announce them. |
| `{ end: ending }` | End the game. Remaining effects are skipped. |
| `{ look: true }` | Describe the current room. |
| `{ if: { when: conds, then: [effects], else: [effects] } }` | Conditional effects. |

Wherever a key takes effects (`do`), a single effect or a list may be given.

### 10. Turn processing

`step(pack, state, command)` processes one command:

1. **Game over** → rejected.
2. **Dialogue active** → only `choose <option>` with an option currently
   available in the current node is accepted (else rejected). See section 12.
3. **Validation** → the verb must exist; objects must be present; for `go`,
   the exit must be listed in the current room; arity must fit (`give` and
   `show` need two objects, `take` needs one, …). Invalid → **rejected**:
   state unchanged, a system message explains why.
4. **Echo** → an `echo` block with the localized command.
5. **Command rules** → rules whose trigger matches are tried **in pack order**.
   A trigger `{ verb, object?, with? }` matches when the verb is equal and
   `object` / `with` are equal *or omitted* (omitted = any). The **first**
   matching rule whose `when` holds (and which is not a spent `once` rule)
   fires; no other command rule fires. For `use a with b`, if no rule matches,
   matching is retried as `use b with a`.
6. **Default behaviour** → only if no rule fired (see below).
7. **Turn** → the turn counter increases. Unless the game ended or a dialogue
   is active, all `turn` event rules whose `when` holds fire, in order.

**Rules replace defaults.** If a rule fires for `take lamp`, the lamp is not
moved unless the rule moves it. Put specific rules before general ones; the
validator warns about rules shadowed by earlier, more general rules.

**Event rules** (`on: { event: … }`): `start` fires once when a new game begins
(after the intro, before the first room description). `enter` fires after the
player enters a room, after the room description; all matching `enter` rules
fire, in order. `turn` fires at the end of each accepted command (step 7). An
event rule's `when` and `once` apply as usual.

A `room` on an event trigger restricts the rule to that room: an `enter` rule
fires only when the player enters that room (even if an earlier `enter` rule
moved the player on); a `turn` or `start` rule fires only while the player is
currently in that room. A `start` rule always runs in the start room, so
`room` there is redundant or keeps the rule from ever firing; the validator
warns (`rule.start-room`).

`once: true` rules fire at most once per game and need an `id`.

Default behaviours (messages are localized by the engine):

| Command | Default |
|---|---|
| `look` | Describe the room: title, description, `roomText` of present objects, list of other portable objects, contents of open containers, exits. |
| `look obj` | `description` (or "nothing special"); contents if an open container. |
| `take obj` | If portable or clue and not held: move to inventory. Otherwise a refusal. |
| `drop obj` | If held and not a clue: move to the current room. |
| `open obj` | If openable and closed: open (if locked and the player holds `unlockedBy`: unlock and open). Lists contents. |
| `close obj` | If openable and open: close. |
| `use a with b` | If `b.unlockedBy == a` and `b` is locked: unlock `b`. Both orders work: `use door key` unlocks the door as well. Otherwise the `default` text of `use`, or "that doesn't work". |
| `use a`, `push`, `pull` | The verb's `default` text (`verbs.push.default`, …), or "Nothing happens." |
| `talk npc` | Start `npc.dialogue` if set; otherwise "no answer". |
| `give a b`, `show a b` | `b` is not interested. |
| `go exit` | Move if usable; otherwise print `blocked` (or a default). |
| `wait` | `verbs.wait.default`, or "Time passes." |
| `inventory` | List items and clues. |
| pack verb | The verb's `default` text. |

The engine contains no randomness, reads no clock and performs no I/O.

### 11. Rules

```yaml
rules:
  - id: pull_red_book
    on: { verb: pull, object: red_book }
    when: { not: { flag: book_moved } }
    do:
      - say: Mit einem Klicken kippt das Buch nach vorn.
      - set: book_moved
      - reveal: brass_key
      - score: 1
  - id: enter_cellar_first_time
    on: { event: enter, room: cellar }
    once: true
    do: { say: Es riecht nach Kohle und nassem Stein. }
```

| Key | Meaning |
|---|---|
| `id` | Required for `once` rules; recommended always (diagnostics refer to it). |
| `on` | `{ verb, object?, with? }` or `{ event: start | enter | turn, room? }` (`room`: see section 10) |
| `when` | Conditions (default: always). |
| `do` | Effects. |
| `once` | Fire at most once. |

Counters changed by `turn` rules must be bounded by their `when` condition
(e.g. `when: { counter: { name: tide, lt: 4 } }`); unbounded counters make the
state space infinite and cannot be verified.

### 12. Dialogues

```yaml
dialogues:
  bartender_talk:
    with: bartender
    start: hello
    nodes:
      hello:
        say: "»Was soll's sein?«"
        options:
          - id: ask_brandt
            text: "»Kennen Sie Karl Brandt?«"
            goto: brandt
          - id: show_photo
            text: "»Den hier schon mal gesehen?«"
            when: { has: photo }
            once: true
            do: { learn: clue_bartender_lied }
            goto: photo
          - id: bye
            text: "»Schon gut.«"
      brandt:
        say: "»Nie gehört.« Er poliert weiter."
        options:
          - id: back
            text: "»Verstehe.«"
            goto: hello
      photo:
        say: "Er wird blass. »Nie gesehen.«"
```

- Entering a node prints its `say` (as an `npc` block), then runs its `do`.
- The node's options whose `when` holds and that are not spent (`once`) are
  offered. If none are available, the dialogue ends.
- Choosing an option prints the option text (as a `player` block), runs its
  `do`, then enters `goto`. Without `goto` the dialogue ends.
- While a dialogue is active, only `choose` commands are accepted and `turn`
  rules do not fire.
- Every node should be reachable and every dialogue should be leavable.

### 13. Endings, score, hints

```yaml
endings:
  solved:
    title: Fall gelöst
    text: Der Regen hat aufgehört. …
    win: true
hints:
  - id: find_key
    when: { visited: library }
    until: { has: brass_key }
    steps:
      - Bücher sind nicht nur zum Lesen da.
      - Eines der Bücher sieht anders aus als die anderen.
      - Zieh am roten Buch.
```

- Under the `forgiving` policy **every ending must have `win: true`**, and from
  every reachable state a winning ending must remain reachable (no dead ends).
- The current hint is the first hint whose `when` holds and whose `until` does
  not. The UI reveals its steps one at a time.
- `score` effects add points; `maxScore` should equal the walkthrough's score.

### 14. Walkthrough and verification

`walkthrough` lists canonical command strings: `verb [object [with]]` with
ids, e.g. `take brass_key`, `use brass_key study_door`, `go north`,
`talk graves`, `choose ask_uncle`. `lexvm check` verifies, in order:

1. **Schema**: structure and types.
2. **Semantics**: every referenced id exists, flags/counters are declared,
   doors are openable, custom exits have labels, `once` rules have ids, text
   references point to objects, dialogue `goto`s exist, endings are wins.
3. **Walkthrough**: replaying it from a new game, every command is accepted
   and the last command reaches a winning ending. A step that no action sheet
   offers (see below) gets a warning: tap players cannot perform it.
4. **Exploration**: a breadth-first search over all reachable logical states
   (using every offered action except `drop`) proves that a winning ending is
   reachable from **every** reachable state and that no losing ending is
   reachable. It also reports rooms, rules, endings and dialogue options that
   are never reached. If the state space exceeds the limit, the result is
   incomplete and proves nothing: `lexvm check` reports it as an error
   (`explore.incomplete`; `--allow-incomplete` makes it a warning).

   When that exploration is complete and finds no problem, a second one also
   drops every carried item (action sheets offer `drop`), with a smaller state
   budget: an item left behind a one-way exit is a dead end too. If the second
   exploration cannot finish, an info (`explore.drop-incomplete`) says so; a
   rule on `drop` for the items the solution needs keeps them with the player.

   *Offered actions* are what a tap player can do: listed exits, dialogue
   options, look around and wait, `verb obj` when the verb is in the object's
   action sheet, `verb a b` when the verb is in `a`'s sheet, and give/show
   between a carried item and a character in the room. `inventory` is not
   offered: the inventory button shows the bag without running a command, so
   progress must not depend on it. A pack whose solution needs a typed-only
   command (e.g. `push statue` while the statue does not list `push` in
   `verbs`) is not winnable. Typed commands are explored as well: no losing
   ending may be reachable with them, and states reachable only by typing must
   not be dead ends either.

`lexvm check` also prints a play time estimate and warns when it misses the
pack's `playtime` by more than 25% (section 17).

A pack is publishable when `lexvm check` reports no errors. Every diagnostic
has a stable code; Appendix A lists them all.

### 15. Saves

A save stores the pack id, version and content hash, the game state and the
log of accepted commands. If the pack changed, the player can replay the log
against the new version. A saved state is untrusted: when the log does not
reproduce it, players use it only if it is a valid state of the pack (every
id declared, exactly the pack's objects, flags and counters, an active
dialogue with an available option); otherwise they continue from what the
log reproduces.

### 16. Versioning of this format

Breaking changes to the format get a new `format` string (`lexvm-pack/2`).
Additive, backwards-compatible changes keep `lexvm-pack/1` and are listed in
the changelog.

### 17. Play time estimate (informative)

LexVM estimates how long a pack takes to play from its walkthrough and its
texts. `lexvm check` prints the estimate, `lexvm build` writes it to the
catalog, `lexvm generate` steers generated packs towards a target length with
it, and the player's import screen shows it. The estimate never makes a pack
invalid; it warns when a pack misses its target.

**Model.** Two numbers: a *speedrun* that follows the walkthrough without
detours, and the *expected* time of a typical first play.

```
minutes_min      = W_path / wpm + (C_path · t_cmd + D_path · t_choice) / 60
minutes_expected = minutes_min + (c · W_optional) / wpm
                   + (c · L_unseen · t_cmd + c · O_unchosen · t_choice + f · C_path · t_cmd) / 60
```

| Term | Meaning |
|---|---|
| `W_path` | Words output while replaying the walkthrough from a new game: blocks of kind text, room title, NPC line, player line and ending (not the echo of the command, not system lines such as exits or score). |
| `W_optional` | Words of pack texts a player can see but the walkthrough never displays: object descriptions (if an object has several variants, only the longest one), dialogue node `say` and option texts, the `say` texts of command rules (including inside `if`), and room description variants. |
| `C_path`, `D_path` | Walkthrough commands except `choose`, and `choose` steps. |
| `L_unseen` | Objects with a description that the walkthrough never examines (`look <object>`). |
| `O_unchosen` | Dialogue options the walkthrough never chooses. |

Counting rules: words are counted on plain rendered text, with markup
resolved (`{id}` → the object's name, `{id|text}` → `text`), as maximal runs of
letters and digits that may be joined by an apostrophe or a hyphen
(`/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/u` on NFC-normalised text), so
"Messingschlüssel", "don't", "Hafen-Kontor" and "1948" are one word each. A
pack text counts as *seen* when exactly its rendered paragraph appeared in the
walkthrough output; every paragraph counts at most once. A walkthrough that
fails is measured up to its first failing step, and the estimate then says so.
The computation is deterministic and uses no locale-dependent functions.

**Parameters.** All of them are options of `estimatePlaytime(pack, options)`
in `@lexvm/engine`.

| Parameter | Default | Option | Meaning |
|---|---|---|---|
| `wpm` | `de` 200, `en` 230, other languages 220 | `wordsPerMinute`, `readingSpeeds`, `otherWordsPerMinute`; CLI `--wpm` | Silent reading speed in words per minute, chosen by the primary language subtag. |
| `t_cmd` | 10 s | `secondsPerCommand` | Per command: perceive the scene, tap the object, pick the verb. |
| `t_choice` | 6 s | `secondsPerChoice` | Per dialogue choice. |
| `c` | 0.6 | `coverage` | Share of the optional content a typical player sees. |
| `f` | 0.5 | `failedAttemptsPerCommand` | Unproductive attempts per productive command. |
| tolerance | 0.25 | `tolerance` | Allowed relative deviation from the target. |
| target | `playtime` | `targetMinutes`; CLI `--target-minutes` | The length the pack should have. |

Sources for the reading speeds: a meta-analysis of 190 studies (Brysbaert,
2019, *Journal of Memory and Language* 109) puts adult silent reading of
English at 238 words per minute for non-fiction and 260 for fiction. The
IReST norm texts (Trauzettel-Klosinski et al., 2012, *Investigative
Ophthalmology & Visual Science* 53) measured young adults at 1126 characters
per minute in German and 1234 in English; German words are longer, so German
gets fewer words per minute. The defaults are deliberately below the lab
values: the text is read on a phone screen, in a game, and partly re-read.

**Diagnostics** (path `playtime`; Appendix A):

- `playtime.estimate` (info, always): "≈ 34 min expected (speedrun 21 min);
  target 35 min", followed by the counts the estimate is based on.
- `playtime.no-target` (info): the pack has no `playtime`; suggests the
  rounded expected time.
- `playtime.too-short` / `playtime.too-long` (warning): `|expected / target − 1|`
  is greater than the tolerance. The message gives concrete numbers derived
  from the pack's own proportions, e.g. "≈ 12 min short: add 1-2 puzzles, or ≈
  25 walkthrough commands, or ≈ 900 words of optional dialogue/description" or
  "≈ 4 min too long: trim ≈ 1,100 words or ≈ 20 commands". They are left out
  while the walkthrough does not reach a winning ending.

**Budget.** `budgetForMinutes(minutes, language)` inverts the model for a
target length with typical ratios of a pack: `W_optional ≈ 0.6 · W_path`,
`D_path ≈ 0.25 ·` all walkthrough steps, `W_path ≈ 20 · C_path` (words of new
text per productive command), `L_unseen ≈ 0.5 · C_path` and
`O_unchosen ≈ 0.25 · D_path`. The ratios are calibrated against the reference
pack `packs/locked-study` (English) and the German test fixture
`packages/engine/test/fixtures/runtime/hafen.yaml`, pooled over both
walkthroughs: measured 0.34, 0.28, 20.7, 0.56 and 0.14. The optional-word
ratio is set higher than measured because these two packs are tiny, and a
full-length game carries more side content (custom responses to wrong
attempts, dialogue branches); the unchosen-option ratio is rounded up for the
same reason. The budget gives ranges of walkthrough steps and player-visible
words of ±tolerance/2 around the target, so a pack that stays within both
ranges lands within the tolerance under the model's assumptions.

**Where it is used.**

- `lexvm check` prints the estimate for every pack and includes the
  diagnostics (also in `--json`). `--wpm <n>` sets the reading speed,
  `--target-minutes <n>` overrides `playtime`.
- `lexvm build` adds `estimatedMinutes` (the rounded expected time) to each
  catalog entry in `index.json` when the walkthrough reaches a win. The
  player's library shows `playtime` and falls back to `estimatedMinutes`;
  imported packs keep the estimate computed at import.
- `lexvm generate --minutes <n>` writes the target to `playtime` in the
  metadata (world) stage and keeps it there, puts the budget into the stage
  prompts, and checks the estimate in its verification gate. Play time
  warnings come right after the errors in repair prompts. A pack that passes
  every gate but misses the target gets one more repair round for its length
  (if `--max-repairs` allows); if that round breaks the pack and the
  remaining rounds cannot fix it, the last passing version is restored. The
  generic one-shot prompt contains a budget table for 15, 30, 45 and 60
  minutes.

### Appendix A. Diagnostic codes

Every diagnostic has a stable code, a severity, a path into the pack (and a
file and line where known) and a message that says how to fix the problem.
Errors make a pack invalid; warnings and info do not. For repair loops,
`lexvm validate --errors-only --json <pack>` prints only the errors as JSON
(`[{ target, pack, ok, diagnostics }]`); `lexvm check --json` adds the
walkthrough, play time and exploration results.

**Reading and merging files** (compile)

| Code | Severity | Meaning |
|---|---|---|
| `yaml.<code>` | error (warning for YAML warnings) | YAML syntax problem, e.g. `yaml.block-in-flow`, `yaml.block-as-implicit-key`, `yaml.bad-indent`, `yaml.tab-as-indent`, `yaml.missing-char`, `yaml.duplicate-key`; the message often names the usual cause (unquoted `: ` or `, `). |
| `yaml.unreadable` | error | The file could not be parsed at all. |
| `compile.no-files` | error | No source files were given. |
| `compile.not-a-map` | error | The top level of a file is not a mapping of pack keys. |
| `compile.duplicate-key` | error | The same entry (or top-level scalar) is defined in two files. |
| `compile.type-mismatch` | error | A top-level key is a map in one file and a list or scalar in another. |
| `compile.failed` | error | Internal failure while compiling (e.g. absurdly deep nesting). |
| `load.failed` | error | A compiled `.lexpack.json` could not be read (player import, `loadPack`). |

**Schema** (structure and types)

| Code | Severity | Meaning |
|---|---|---|
| `schema.unrecognized_keys` | error | Unknown key (often a typo or a key at the wrong level). |
| `schema.invalid_type` | error | Missing key or a value of the wrong type. |
| `schema.invalid_union` | error | A value matches none of the allowed forms (e.g. a trigger with both `verb` and `event`). |
| `schema.invalid_key` | error | A map key is not a valid id. |
| `schema.invalid_value` | error | A value outside the allowed set (e.g. `format`, `event`). |
| `schema.invalid_format` | error | A string in the wrong format (ids, pack id, version, language). |
| `schema.too_small`, `schema.too_big` | error | Empty text or list, number out of range. |
| `schema.custom` | error | A condition or effect without exactly one key, a counter effect without exactly one of `add`/`set`. |
| `schema.<code>` | error | Any other schema issue. |

**Semantics** (validator; `lexvm validate`)

| Code | Severity | Meaning |
|---|---|---|
| `ref.unknown-room`, `ref.unknown-object`, `ref.unknown-location`, `ref.unknown-flag`, `ref.unknown-counter`, `ref.unknown-verb`, `ref.unknown-dialogue`, `ref.unknown-ending`, `ref.unknown-node`, `ref.unknown-exit` | error | An id that is used is not declared (or is of the wrong kind). |
| `ref.not-a-container` | error | Something is located in an object that is not a container. |
| `id.reserved` | error | A room or object is called `inventory` or `nowhere`. |
| `id.collision` | error | A room and an object share an id. |
| `object.contains-itself` | error | An object is (indirectly) located in itself. |
| `object.alsoIn-portable` | error | A portable object has `alsoIn`. |
| `object.dialogue-not-npc` | warning | An object with a dialogue is not an `npc`, so its sheet does not offer *talk*. |
| `object.verb-not-applicable` | warning | An object lists a verb that takes no object (`go`, `choose`, `wait`, `inventory`). |
| `object.unmentioned` | info | A present object is mentioned neither in the room description nor by a `roomText`. |
| `npc.no-talk` | info | A character has no dialogue and no talk rule. |
| `verb.reserved` | warning | A pack entry for `go` or `choose`, whose behaviour is fixed. |
| `exit.label-required` | error | A non-standard exit id without `label`. |
| `exit.door-not-openable` | error | An exit's door is not openable, so the exit can never be used. |
| `exit.door-not-here` | warning | An exit's door is not present in the exit's room. |
| `rule.once-without-id` | error | A `once` rule without `id`. |
| `rule.duplicate-id` | error | Two rules with the same id. |
| `rule.choose-trigger` | error | A rule triggered by `choose` (rules never fire for it). |
| `rule.trigger-object-not-allowed` | error | A trigger names an object the verb cannot take (e.g. `wait lamp`, `with` on a one-object verb). |
| `rule.start-room` | warning | `room` on a `start` rule. |
| `rule.shadowed` | warning | A command rule can never fire because an earlier, more general rule always matches first. |
| `learn.not-a-clue` | error | `learn` on an object that is not a clue. |
| `condition.counter-no-test` | warning | A counter condition without comparison always holds. |
| `flag.never-read`, `flag.never-set` | warning | A flag that no condition reads, or that starts false and is never set. |
| `counter.never-read`, `counter.never-changed` | warning | A counter that no condition tests, or that no effect changes. |
| `counter.unbounded-turn-rule` | warning | A `turn` rule changes a counter every turn without bounding it, so the state space is infinite. |
| `counter.unbounded` | info | A rule may change a counter without bound. |
| `dialogue.duplicate-option` | error | Two options with the same id in one dialogue. |
| `dialogue.unknown-goto` | error | An option goes to a node that does not exist. |
| `dialogue.unreachable-node` | warning | A node no option leads to. |
| `dialogue.no-exit` | warning | A dialogue that can never be left. |
| `dialogue.unused` | warning | A dialogue that is never started. |
| `dialogue.with-not-npc` | warning | A dialogue's `with` is not an `npc`. |
| `ending.none-winning` | error | No ending has `win: true`. |
| `policy.losing-ending` | error | An ending with `win: false` under the forgiving policy. |
| `ending.unused` | warning | An ending no `end` effect leads to. |
| `score.maxScore-missing` | info | Score effects without `maxScore`. |
| `score.maxScore-unreachable` | warning | `maxScore` is higher than all score effects together. |
| `hint.none` | warning | The pack has no hints. |
| `hint.duplicate-id` | error | Two hints with the same id. |
| `room.unreachable` | warning | A room that no exit or `goto` leads to. |
| `text.unknown-ref` | error | Markup `{id}` that names no object (or has empty display text). |
| `text.stray-brace` | warning | An unbalanced `{` or `}` in a text. |
| `text.too-long` | warning | A text over its phone budget (section 4). |
| `text.variant-after-default` | warning | A text variant after a variant without `when`, so it is never used. |
| `walkthrough.malformed` | error | A walkthrough step is not a canonical command. |

**Walkthrough replay** (`lexvm check`)

| Code | Severity | Meaning |
|---|---|---|
| `walkthrough.rejected` | error | A step was rejected; the message describes the situation (room, objects, exits, dialogue). |
| `walkthrough.ended-early` | error | The game ended before the last step. |
| `walkthrough.not-won` | error | The walkthrough does not end in a winning ending. |
| `walkthrough.not-offered` | warning | A step works only as a typed command: no action sheet offers it. |
| `walkthrough.score-mismatch` | warning | The walkthrough's final score differs from `maxScore` (not reported again when `score.maxScore-unreachable` already explains it). |

**Exploration** (`lexvm check`)

| Code | Severity | Meaning |
|---|---|---|
| `explore.not-winnable` | error | No winning ending is reachable with the offered actions (reported only for a complete exploration). |
| `explore.dead-end` | error | A reachable state from which no winning ending can be reached. |
| `explore.losing-ending` | error | A non-winning ending is reachable. |
| `explore.incomplete` | error | The state limit was hit; dead ends and winnability were not proven (a warning with `lexvm check --allow-incomplete`). |
| `explore.drop-incomplete` | info | The second exploration, which also drops carried items, hit its state budget. |
| `explore.unreached-room`, `explore.unreached-ending`, `explore.unreached-rule`, `explore.unreached-option` | info | Content never reached in any explored state. |

**Play time** (section 17)

| Code | Severity | Meaning |
|---|---|---|
| `playtime.estimate` | info | The estimate and what it is based on. |
| `playtime.no-target` | info | No `playtime`; suggests a value. |
| `playtime.too-short`, `playtime.too-long` | warning | The expected time misses the target by more than the tolerance, with concrete advice. |

**Tools**

| Code | Severity | Meaning |
|---|---|---|
| `check.walkthrough-crashed`, `check.playtime-crashed`, `check.explore-crashed` | error | `lexvm check` hit an internal error (an engine bug; please report it). |
| `verify.compile-crashed`, `verify.walkthrough-crashed`, `verify.exploration-crashed` | error | A verification gate of `lexvm generate` hit an internal error. |
| `verify.no-pack` | error | The files did not compile to a pack, but no error was reported. |

# Worked example

A complete short pack. Copy its structure and style, not its content.

```yaml
# A short demo that exercises most of the format: a locked door, a hidden
# item, a container, a pack verb, a clue, a conversation, hints and a score.
# It doubles as the reference example for authors and LLM prompts.
format: lexvm-pack/1
id: locked-study
version: 1.0.1
title: The Locked Study
subtitle: A short LexVM demo
description: Your uncle has vanished and his study is locked. A tiny tour of rooms, items, a locked door, a clue and a conversation.
language: en
author: LexVM contributors
license: CC0-1.0
playtime: 7
maxScore: 3

start:
  room: hall
  intro: |-
    Uncle Ambrose invited you for the weekend and then, rather rudely, vanished.

    The house is quiet. Somewhere a clock is ticking.

verbs:
  read:
    label: Read
    synonyms: [read, peruse]
    default: There is nothing to read there.

flags:
  book_moved: false
  letter_read: false
  told_password: false

rooms:
  hall:
    name: Entrance Hall
    description: A draughty hall with a chequered floor. The library lies to the west; a heavy {study_door|oak door} leads north to the study.
    exits:
      west: { to: library }
      north:
        to: study
        door: study_door
        blocked: The oak door is closed.
  library:
    name: Library
    description:
      - when: { flag: book_moved }
        text: Shelves full of unread classics. One {red_book} now leans forward at an odd angle.
      - text: Shelves full of unread classics. One {red_book} sticks out a little further than the rest.
    exits:
      east: { to: hall }
  study:
    name: Study
    description: Your uncle's study smells of pipe smoke and ink. A {desk} stands under the window; the {study_door|oak door} leads back to the hall.
    exits:
      south:
        to: hall
        door: study_door
        blocked: The oak door is closed.

objects:
  graves:
    name: Graves
    synonyms: [butler, mr graves]
    location: hall
    npc: true
    dialogue: graves_talk
    roomText: Graves, the butler, waits by the stairs with professional patience.
    description: Immaculate, unhurried and entirely unreadable.
  study_door:
    name: oak door
    synonyms: [door, study door]
    location: hall
    alsoIn: [study]
    openable: true
    open: false
    locked: true
    unlockedBy: brass_key
    description:
      - when: { isLocked: study_door }
        text: Solid oak with a brass keyhole. Locked.
      - when: { isOpen: study_door }
        text: Solid oak, standing open.
      - text: Solid oak with a brass keyhole. It is unlocked now.
  red_book:
    name: red book
    synonyms: [book]
    location: library
    verbs: [pull]
    description: A red leather spine without a title. It doesn't quite sit flush with its neighbours.
  brass_key:
    name: brass key
    synonyms: [key]
    location: library
    hidden: true
    portable: true
    description: A small brass key, warm from its hiding place.
  desk:
    name: desk
    synonyms: [writing desk, drawer]
    location: study
    container: true
    openable: true
    open: false
    description: A writing desk with one wide drawer.
  letter:
    name: letter
    synonyms: [note, envelope]
    location: desk
    portable: true
    verbs: [read]
    description: A letter in your uncle's spidery hand, addressed to you.
  clue_library:
    name: Late reading
    location: nowhere
    clue: true
    description: Graves says your uncle was reading in the library late last night.
  clue_password:
    name: The password
    location: nowhere
    clue: true
    description: "The letter says: tell Graves the word \"Perihelion\"."

rules:
  - id: pull_red_book
    on: { verb: pull, object: red_book }
    when: { not: { flag: book_moved } }
    do:
      - say: The book tilts forward with a click. Something small drops onto the carpet.
      - set: book_moved
      - reveal: brass_key
      - score: 1
  - id: pull_red_book_again
    on: { verb: pull, object: red_book }
    do: { say: The book will not move any further. }
  - id: take_red_book
    on: { verb: take, object: red_book }
    do: { say: It seems to be attached to the shelf. Curious. }
  - id: read_letter
    on: { verb: read, object: letter }
    do:
      - say: "\"Dear guest, forgive the theatre. I am perfectly safe. Tell Graves the word Perihelion and he will bring you to me. — A.\""
      - if:
          when: { not: { flag: letter_read } }
          then:
            - set: letter_read
            - score: 1
      - learn: clue_password
  - id: enter_study_first
    on: { event: enter, room: study }
    once: true
    do: { say: "Somewhere below, the clock strikes twelve." }

dialogues:
  graves_talk:
    with: graves
    start: hello
    nodes:
      hello:
        say: "\"Good evening. How may I be of service?\""
        options:
          - id: ask_uncle
            text: "\"Where is my uncle?\""
            goto: uncle
          - id: say_password
            text: "\"Perihelion.\""
            when: { has: clue_password }
            goto: password
          - id: bye
            text: "\"Nothing, thank you.\""
      uncle:
        say: "\"I could not say. He was reading in the library rather late last night.\""
        do: { learn: clue_library }
        options:
          - id: back
            text: "\"I see.\""
            goto: hello
      password:
        say: "\"Ah. Then you had better follow me upstairs. He is expecting you.\""
        do:
          - set: told_password
          - score: 1
          - end: found_uncle

endings:
  found_uncle:
    title: The Observatory
    text: Graves leads you up a hidden stair into a glass dome. Uncle Ambrose looks up from his telescope. "You took your time," he says, and hands you a cup of tea.
    win: true

hints:
  - id: ask_graves
    until: { has: clue_library }
    steps:
      - Graves might know where your uncle went.
      - Talk to Graves and ask about your uncle.
  - id: find_key
    until: { has: brass_key }
    steps:
      - Your uncle was reading in the library. Have a look around there.
      - One book is not like the others.
      - Pull the red book, then take the key.
  - id: open_door
    until: { visited: study }
    steps:
      - The key must fit somewhere in the hall.
      - Use the brass key with the oak door, open it and go north.
  - id: read_letter
    until: { has: clue_password }
    steps:
      - The desk might hold something.
      - Open the desk and read the letter.
  - id: password
    until: { flag: told_password }
    steps:
      - The letter mentions a word for Graves.
      - Talk to Graves and say "Perihelion".

walkthrough:
  - talk graves
  - choose ask_uncle
  - choose back
  - choose bye
  - go west
  - pull red_book
  - take brass_key
  - go east
  - use brass_key study_door
  - open study_door
  - go north
  - open desk
  - take letter
  - read letter
  - go south
  - talk graves
  - choose say_password
```

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
- `author`: the user's name or handle if they gave one, otherwise `Anonymous`, followed by ` (written with an LLM)`;
- `license`: `CC-BY-4.0` unless the user asks for another SPDX license id;
- `generator`: `{ pipeline: "lexvm one-shot prompt", notes: "Drafted by an LLM chat assistant from the LexVM one-shot prompt." }`.

**Part 3 — Self-check:** go through the checklist below item by item and write one short line each: "ok", or what you corrected. If you find a problem while checking, fix it in Part 2 before you answer — the pack you output must be the final, corrected one.

# Checklist of common mistakes

1. **Undeclared flags or counters.** Every flag used in `set`, `clear` or a `flag:` condition is declared under `flags:` with its initial value; every counter under `counters:`.
2. **Flow-mapping quoting.** No unquoted `: `, `, ` or ` #` inside `{ … }`; texts with punctuation are in block style or double-quoted.
3. **Missing reverse exits.** Exits are one-way: every exit has a way back in the destination room. A door is in both rooms (`location` + `alsoIn`) and both exits name it with `door:`.
4. **Walkthrough uses names instead of ids.** Every command is `verb id [id]` with exit, object and option ids — no display names, articles, prepositions or translated verbs.
5. **`once` rules without `id`.** Every rule with `once: true` has an `id` (better: every rule has one).
6. **Losing endings.** Every ending has `win: true`; no deaths, no failure endings.
7. **Dead ends.** No reachable state from which the game cannot be won: needed items cannot be used up, given away, locked away or lost; essential clues stay obtainable.
8. **Missing hints.** Every puzzle has a hint with `until` and 2–3 progressive steps; some hint applies at every stage until the ending.
9. **Texts too long for phones.** Room descriptions ≤ 600 characters, object descriptions ≤ 400, dialogue lines ≤ 300, option texts ≤ 80, names ≤ 24.
10. **Unreferenced scenery.** Every non-portable object (scenery, character, container, door) appears as `{id}` in its room's description or has a `roomText`; every `{id}` in a text names an existing object.
11. **Broken references.** Every id used in exits, `door`, `unlockedBy`, `dialogue`, `goto`, conditions and effects exists; characters with `dialogue:` have that dialogue; every dialogue node is reachable and every dialogue can be left.
12. **Invisible verbs.** Every pack verb is declared under `verbs:` and listed in the `verbs` of each object it applies to.
13. **One key per condition and effect.** `{ set: a, score: 1 }` is two effects; two conditions go in a list or `all: […]`.
14. **Score.** Each point is awarded once; `maxScore` equals the walkthrough's total.

# When the user sends diagnostics

The user will load your pack into LexVM (`lexvm check` or the import screen of the app) and may paste back diagnostics. Each one has a severity (error, warning), a code such as `walkthrough.rejected`, a location such as `walkthrough[12]` or `rooms.hall.exits.north` (sometimes with a line number), and a message that usually says how to fix it. Then fix every error and as many warnings as you sensibly can, and answer with the complete corrected `pack.yaml` again in a single ```` ```yaml ```` block, followed by one line per fix. Never answer with partial snippets. A rejected walkthrough step often means an earlier step is missing (a door still closed, a dialogue still open). If a diagnostic reveals a design problem (for example a dead end), fix the design, not only the symptom.

# The idea

> **To the person pasting this prompt:** write your idea after “My idea:” below — a few sentences in any language:
> setting, hero, goal, tone, perhaps a twist, the pack language (`de` or `en`) and the play time you want.
> Then send the whole prompt.

If no idea follows, ask the user for it in one short question and wait; do not invent a story on your own.

My idea:
