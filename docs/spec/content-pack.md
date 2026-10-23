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

Keep texts short for phone screens: room descriptions ≤ 600 characters,
object descriptions ≤ 400, dialogue lines ≤ 300, option texts ≤ 80, names ≤ 24.
Longer texts produce warnings.

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

**Action sheets.** Tapping an object offers `look`; `talk` for an `npc`;
`take` for a portable object or clue lying around; `open` or `close` for an
openable object; `use` for everything except characters. A carried object
offers `look`, `use`, `open`/`close` if openable, `show` (and `give`, not for
clues) while a character is in the room, and `drop` (not for clues). Every
verb listed in the object's `verbs` is added, core verbs included: `push`,
`pull` and `talk` on a non-character must be listed to be tappable. Two-object
verbs then ask for the second object.

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
| `{ learn: clue }` | Put a clue into the notebook and announce it. No-op if already known. |
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
| `on` | `{ verb, object?, with? }` or `{ event: start | enter | turn, room? }` |
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
   reported as incomplete (warning).

   *Offered actions* are what a tap player can do: listed exits, dialogue
   options, look around / wait / inventory, `verb obj` when the verb is in
   the object's action sheet, `verb a b` when the verb is in `a`'s sheet, and
   give/show between a carried item and a character in the room. A pack
   whose solution needs a typed-only command (e.g. `push statue` while the
   statue does not list `push` in `verbs`) is not winnable. Typed commands are
   explored as well: no losing ending may be reachable with them, and states
   reachable only by typing must not be dead ends either.

A pack is publishable when `lexvm check` reports no errors.

## 15. Saves

A save stores the pack id, version and content hash, the game state and the
log of accepted commands. If the pack changed, the player can replay the log
against the new version.

## 16. Versioning of this format

Breaking changes to the format get a new `format` string (`lexvm-pack/2`).
Additive, backwards-compatible changes keep `lexvm-pack/1` and are listed in
the changelog.
