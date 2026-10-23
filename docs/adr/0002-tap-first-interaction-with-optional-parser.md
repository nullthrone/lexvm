# 0002. Tap-first interaction with an optional parser

- Status: Accepted
- Date: 2026-10-23

## Context

The primary devices are phones in portrait mode and tablets, often used
offline (on a train, in airplane mode). Classic parser interfaces work poorly
there:

- Typing on a touch keyboard is slow, and the keyboard covers half the
  screen.
- Parser games suffer from "guess the verb": the player knows what to do but
  not which words the game accepts.

LucasArts' SCUMM games solved a similar problem with a verb list and
pointing at objects. A full SCUMM verb grid, however, takes too much space on
a phone and invites trying every verb on every object.

Some players still prefer typing, and typing is faster for experienced
players on tablets with keyboards.

## Decision

The player is **tap-first and object-first**:

- Object names in the story text, in the room's object list and in the
  inventory are tappable references.
- Tapping an object opens an action sheet with only the verbs that make sense
  for that object, as reported by the engine's `view`. Pack verbs appear only
  on objects that list them.
- Two-object verbs (`use … with …`, `give … to …`, `show … to …`) ask for the
  second object in a follow-up step.
- Exits and dialogue options are buttons.

An **optional text parser** for German and English maps typed input to the
same structured `Command` that taps produce. Both input paths are equal: they
produce identical commands, identical output and identical command logs.

## Consequences

- No guess-the-verb problem for tap players; the action sheet is a short,
  relevant list.
- Content packs must name every interactable thing as an object and mention
  scenery in descriptions (the specification requires this).
- Puzzles cannot rely on the player finding an unusual verb by typing it.
  Pack verbs are offered on the objects that list them.
- The parser is a secondary path; parser coverage (synonyms, articles,
  inflection) can grow without changing the format.
- The engine must expose affordances (`view`) in addition to `step`, so the
  UI never offers an action the engine would reject.

## Alternatives considered

- **Parser only** (classic interactive fiction). Familiar to genre fans, but
  slow on phones and hostile to newcomers.
- **Choice-only interface** (as in Twine or ink games). Excellent on phones,
  but there is no world model of rooms, objects and inventory, so state-based
  puzzles and automatic verification of the world are lost.
- **Verb-first SCUMM grid** (pick a verb, then an object). Faithful to the
  inspiration, but a grid of nine verbs does not fit a portrait phone screen
  and encourages brute-force combinations.
- **Context-free "smart" single tap** (one default action per object). Too
  little control for puzzles that need specific verbs.
