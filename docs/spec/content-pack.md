# LexVM Content Pack Format — `lexvm-pack/1`

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

## 1. Files

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

## 2. Identifiers

- All ids (rooms, objects, flags, counters, verbs, rules, dialogues, nodes,
  options, endings, hints) are `lower_snake_case` and start with a letter:
  `^[a-z][a-z0-9_]*$`.
- Room ids and object ids share one namespace (both can be locations).
- `inventory` and `nowhere` are reserved and cannot be used as ids.
- The pack id is kebab-case: `^[a-z0-9]+(-[a-z0-9]+)*$`.

## 3. Top level

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
| `pacing` | `"narrative"` \| `"balanced"` \| `"puzzle"` | no | How the play time divides between reading and interaction (about 60%, 45% or 30% reading). Sizes the text budgets (section 4) and, when declared, is checked by the play time estimate (section 17). |
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

## 4. Text

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

Keep texts readable on phone screens: room descriptions ≤ 600 characters,
object descriptions ≤ 400, dialogue lines ≤ 300, option texts ≤ 80, names ≤ 24.
A pack with `pacing: narrative` tells its scenes in full and gets room
descriptions ≤ 1000, object descriptions ≤ 600 and dialogue lines ≤ 600; option
texts and names keep their limits, because they are buttons. Longer texts
produce warnings (`text.too-long`).

## 5. Rooms and exits

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

## 6. Objects

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

## 7. Verbs

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

## 8. Conditions

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

## 9. Effects

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

## 10. Turn processing

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

## 11. Rules

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

## 12. Dialogues

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

## 13. Endings, score, hints

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

## 14. Walkthrough and verification

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

## 15. Saves

A save stores the pack id, version and content hash, the game state and the
log of accepted commands. If the pack changed, the player can replay the log
against the new version. A saved state is untrusted: when the log does not
reproduce it, players use it only if it is a valid state of the pack (every
id declared, exactly the pack's objects, flags and counters, an active
dialogue with an available option); otherwise they continue from what the
log reproduces.

## 16. Versioning of this format

Breaking changes to the format get a new `format` string (`lexvm-pack/2`).
Additive, backwards-compatible changes keep `lexvm-pack/1` and are listed in
the changelog.

## 17. Play time estimate (informative)

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
| `f` | 1 | `failedAttemptsPerCommand` | Unproductive attempts per productive command. |
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

The attempt rate `f` comes from the playtests of
`packs/letzte-nacht-der-reichsmark` (74 walkthrough steps, 47 of them
commands): a tap-only player made 180 commands, an adventure veteran 226.
After the optional looks and dialogue options the model counts separately,
that leaves about 0.9 and 1.8 unproductive attempts per productive command;
`f = 1` is the cautious end. Earlier versions used 0.5, which underestimated
the interaction time of real players and therefore pushed packs to cut text
to meet their target ([ADR 0012](../adr/0012-narrative-pacing.md)).

**Reading share and pacing.** `reading = (W_path + c · W_optional) / wpm` is
the part of `minutes_expected` spent reading; the reading share is
`reading / minutes_expected`. A pack declares how it means to divide its time
with `pacing`: `narrative` 0.6, `balanced` 0.45, `puzzle` 0.3. When `pacing` is
declared and the share is more than 0.1 away from its value, `lexvm check`
warns (`playtime.pacing`): a narrative pack whose story is told too thinly for
its mechanics, or a pack that reads much more than it plays. A pack without
`pacing` is never warned and is sized as `balanced`.

**Diagnostics** (path `playtime`; Appendix A):

- `playtime.estimate` (info, always): "≈ 34 min expected (speedrun 21 min);
  target 35 min", followed by the counts the estimate is based on.
- `playtime.no-target` (info): the pack has no `playtime`; suggests the
  rounded expected time.
- `playtime.pacing` (warning, only when `pacing` is declared): the reading
  share is outside the pacing's band; the message says how many words of scene
  prose are missing, or what to trim.
- `playtime.too-short` / `playtime.too-long` (warning): `|expected / target − 1|`
  is greater than the tolerance. The message gives concrete numbers derived
  from the pack's own proportions, e.g. "≈ 12 min short: add 1-2 puzzles, or ≈
  25 walkthrough commands, or ≈ 900 words of optional dialogue/description" or
  "≈ 4 min too long: trim ≈ 1,100 words or ≈ 20 commands". They are left out
  while the walkthrough does not reach a winning ending.

**Budget.** `budgetForMinutes(minutes, language, { pacing })` inverts the
model for a target length. The reading share of the pacing (default
`balanced`) splits the minutes: the interaction part sizes the walkthrough
(steps × interaction minutes per step, with tapping, wrong attempts, side looks
and unchosen options), the reading part sizes the text
(`W_path + c · W_optional = reading minutes · wpm`). The other ratios are
typical of a pack: `W_optional ≈ 0.6 · W_path`, `D_path ≈ 0.25 ·` all
walkthrough steps, `L_unseen ≈ 0.5 · C_path` and `O_unchosen ≈ 0.25 · D_path`.
They are calibrated against the reference pack `packs/locked-study` (English)
and the German test fixture `packages/engine/test/fixtures/runtime/hafen.yaml`,
pooled over both walkthroughs: measured 0.34, 0.28, 0.56 and 0.14. The
optional-word ratio is set higher than measured because these two packs are
tiny, and a full-length game carries more side content (custom responses to
wrong attempts, dialogue branches); the unchosen-option ratio is rounded up
for the same reason. Earlier versions fixed the words per command at 20 instead
of deriving them from a reading share; that implied a reading share of about
30% for every pack. The budget gives ranges of walkthrough steps and
player-visible words of ±tolerance/2 around the target, so a pack that stays
within both ranges lands within the tolerance under the model's assumptions.

**Where it is used.**

- `lexvm check` prints the estimate for every pack and includes the
  diagnostics (also in `--json`). `--wpm <n>` sets the reading speed,
  `--target-minutes <n>` overrides `playtime`.
- `lexvm build` adds `estimatedMinutes` (the rounded expected time) to each
  catalog entry in `index.json` when the walkthrough reaches a win. The
  player's library shows `playtime` and falls back to `estimatedMinutes`;
  imported packs keep the estimate computed at import.
- `lexvm generate --minutes <n> --pacing <pacing>` writes the target to
  `playtime` and the pacing to `pacing` in the metadata (world) stage and
  keeps them there, puts the budget into the stage prompts, and checks the
  estimate in its verification gate. Play time warnings come right after the
  errors in repair prompts. A pack that passes every gate but misses the
  target or its pacing gets one more repair round for its length (if
  `--max-repairs` allows); if that round breaks the pack and the remaining
  rounds cannot fix it, the last passing version is restored. The generic
  one-shot prompt contains a budget table for 15, 30, 45 and 60 minutes and
  every pacing.

## Appendix A. Diagnostic codes

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
| `playtime.pacing` | warning | The reading share misses the declared `pacing` by more than 0.1. |

**Tools**

| Code | Severity | Meaning |
|---|---|---|
| `check.walkthrough-crashed`, `check.playtime-crashed`, `check.explore-crashed` | error | `lexvm check` hit an internal error (an engine bug; please report it). |
| `verify.compile-crashed`, `verify.walkthrough-crashed`, `verify.exploration-crashed` | error | A verification gate of `lexvm generate` hit an internal error. |
| `verify.no-pack` | error | The files did not compile to a pack, but no error was reported. |
