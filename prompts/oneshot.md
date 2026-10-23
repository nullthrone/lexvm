# Write a LexVM text adventure

You are an experienced adventure game designer in the tradition of the classic LucasArts and Infocom games, and a precise technical writer. Your task: turn the idea at the very end of this prompt into a complete, playable **LexVM content pack** — one `pack.yaml` file.

LexVM is an offline text-adventure player for phones and tablets. Players mostly tap: they tap an object, pick a verb from its action sheet, and for two-object verbs pick a second object; a text parser is optional. A pack is pure data in the YAML format specified below; it contains no code. Every pack is checked by `lexvm check`: schema, references, a replay of the walkthrough, and an exhaustive exploration of all reachable game states that proves the game can always still be won.

## Parameters

- **Pack language:** the language the idea is written in — `de` for German, `en` for English. LexVM supports these two pack languages; if the idea is written in another language, use English (`en`) unless the user asks for German.
- **Target play time:** about 30 minutes, unless the idea asks for a different length.
- **Policy:** `forgiving` — no deaths, no losing endings, no dead ends.

Everything below up to "How to answer" is reference material: first the authoring guide (how to make the game good), then the normative format specification (what is valid), then a complete worked example.

# Authoring guide (condensed)

## Shape and pacing
- A 30–45 minute game has about 10–12 rooms, 6–8 puzzles, 3–5 characters and 8–15 clues or key items. Scale proportionally for other lengths (15 minutes: ~5 rooms, 3–4 puzzles).
- The intro states a clear goal; the first small success comes within the first few minutes.
- Structure the game in 2–3 chapters separated by bottlenecks (a key event everything converges on). Within a chapter several puzzles are open at once.
- End with a climax that uses what the player learned (a confrontation, a deduction), then a winning ending.
- Score is a progress signal: usually 1 point per solved puzzle, 2 for a major deduction. Award each point exactly once (guard with a flag, a `not: { has: … }` condition or a `once` rule). `maxScore` equals the total score collected by the walkthrough.

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
- Interrogations and confrontations use clues as evidence (see dialogue).

## Hints
- Every puzzle has a hint: `when` = the puzzle is known (room visited, clue held), `until` = the puzzle is solved (flag set, item held, room visited).
- 2–3 progressive steps: a nudge ("The butler seems to know more than he says."), a direction ("Ask him about last night."), the explicit solution ("Talk to Graves and ask where your uncle is.").
- The first hint whose `when` holds and whose `until` does not is shown, so order hints in the usual solving order, and make sure some hint applies at every point until the ending.

## Text for phone screens
- Budgets: room descriptions ≤ 600 characters, object descriptions ≤ 400, dialogue lines ≤ 300, option texts ≤ 80, names ≤ 24. Aim well below.
- Short paragraphs of 1–3 sentences. The first sentence says what matters; atmosphere second.
- Mention exits naturally in the room description ("The library lies to the west.").
- Every interactable object appears as `{id}` (or `{id|inflected text}`) in its room's description or in its own `roomText`. Portable objects without `roomText` are listed automatically.
- Names are short, without articles, and distinct: "brass key", not "the small brass key".
- Rule messages (`say`) are 1–2 sentences.

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
| `playtime` | int (minutes) | no | Estimated play time. |
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
| `roomText` | Sentence appended to the room description while the object lies directly in the current room. Objects without `roomText` that are portable are listed automatically ("You see here: …"). Scenery without `roomText` must be mentioned in the room description. |
| `location` | **Required.** Room id, container object id, `inventory` or `nowhere` (not in play yet). |
| `alsoIn` | Extra rooms where a non-portable object is present (doors, the sea, the sky). |
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
Commands can only refer to present objects.

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
| `{ learn: clue }` | Put a clue into the notebook and announce it. No-op if already known. |
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
player enters a room (optionally only `room`), after the room description; all
matching `enter` rules fire, in order. `turn` fires at the end of each accepted
command (step 7). An event rule's `when` and `once` apply as usual.

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
| `use a with b` | If `b.unlockedBy == a` and `b` is locked: unlock `b`. Otherwise "that doesn't work". |
| `use a`, `push`, `pull` | "Nothing happens." |
| `talk npc` | Start `npc.dialogue` if set; otherwise "no answer". |
| `give a b`, `show a b` | `b` is not interested. |
| `go exit` | Move if usable; otherwise print `blocked` (or a default). |
| `wait` | "Time passes." |
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
| `on` | `{ verb, object?, with? }` or `{ event: start | enter | turn, room? }` |
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
   and the last command reaches a winning ending.
4. **Exploration**: a breadth-first search over all reachable logical states
   (using every offered action except `drop`) proves that a winning ending is
   reachable from **every** reachable state and that no losing ending is
   reachable. It also reports rooms, rules, endings and dialogue options that
   are never reached. If the state space exceeds the limit, the result is
   reported as incomplete (warning).

A pack is publishable when `lexvm check` reports no errors.

### 15. Saves

A save stores the pack id, version and content hash, the game state and the
log of accepted commands. If the pack changed, the player can replay the log
against the new version.

### 16. Versioning of this format

Breaking changes to the format get a new `format` string (`lexvm-pack/2`).
Additive, backwards-compatible changes keep `lexvm-pack/1` and are listed in
the changelog.

# Worked example

A complete five-minute pack. Copy its structure and style, not its content.

```yaml
# A five-minute demo that exercises most of the format: a locked door, a hidden
# item, a container, a pack verb, a clue, a conversation, hints and a score.
# It doubles as the reference example for authors and LLM prompts.
format: lexvm-pack/1
id: locked-study
version: 1.0.0
title: The Locked Study
subtitle: A five-minute LexVM demo
description: Your uncle has vanished and his study is locked. A tiny tour of rooms, items, a locked door, a clue and a conversation.
language: en
author: LexVM contributors
license: CC0-1.0
playtime: 5
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
    description: Your uncle's study smells of pipe smoke and ink. A {desk} stands under the window.
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

**Part 1 — Design** (short: at most about 400 words, in the pack language or in English):
- premise, player character, goal, tone and narrative voice;
- the cast: who knows what, who hides what;
- the rooms with their ids and how they connect;
- the **puzzle dependency chart** as a Mermaid `flowchart` (or an indented list): every puzzle with the items, clues and flags it needs and what it unlocks, down to the winning ending. Check that it branches — the player should almost always have two or three things to work on;
- for each puzzle, one line: where it is signposted in the text, and its solution in canonical commands.

**Part 2 — The pack:** ONE complete `pack.yaml` in a single fenced code block that starts with ```` ```yaml ````. Everything goes into this one file. Write the top-level keys in this order: metadata, `start`, `verbs`, `flags`, `counters`, `rooms`, `objects`, `rules`, `dialogues`, `endings`, `hints`, and **`walkthrough` last** — write it after everything else, replaying the game step by step, so it only uses ids that exist. Never abbreviate: no "…", no "and so on", no comments standing in for content.

Metadata:
- `format: lexvm-pack/1`, a kebab-case `id` derived from the title, `version: 1.0.0`, `title`, optional `subtitle`, a one- or two-sentence `description`, `language`, `playtime` (minutes), `maxScore` (the walkthrough's total score), `policy: forgiving`;
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
