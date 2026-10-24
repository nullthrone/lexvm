# 0013. Names the player knows: object names are text with variants

- Status: Accepted
- Date: 2026-10-24

## Context

A playtest of *Die letzte Nacht der Reichsmark* found that characters carry
their names before the player can know them. The watchman at the Zollkanal is
"Tadeusz" on his chip, in the room text and in the command "Sprich mit
Tadeusz" before he has said a word; the very first command of the game reads
"Sprich mit Anni" while the text still calls her "die Frau"; and the dealer in
the backyard is "Lene" although nobody ever tells Voss her name.

The cause is in the format, not only in the text:

1. **An object had exactly one, static `name`.** The engine shows it on
   chips, in command labels and echoes, in the conversation heading, in
   default messages and wherever a text says `{id}`. What the player knows
   about a character was not part of the model, so the only name available
   was the omniscient one. Descriptions could vary with the state; names
   could not.
2. **Authors and prompts wrote the name into the prose as well** ("Auf einem
   Poller sitzt Tadeusz"), because the format suggested that the id's name is
   the character. No rule in the guide, the checklist or the review asked
   when the player learns a name, and no check could tell, because the moment
   a name is revealed was nowhere in the pack.

The same pattern let notebook entries run ahead of the story (fixed earlier
by showing them in the transcript): what the player knows at a given moment
was implicit, and nothing checked it.

## Decision

1. **`name` is a `Text`.** Like `description`, it is a string or a list of
   variants; the first variant whose `when` holds is shown. By convention the
   first variant is the name the character ends up with and the last one,
   without `when`, the description the player starts with:

   ```yaml
   name:
     - when: { flag: kennt_tadeusz }
       text: Tadeusz
     - text: Wächter
   ```

   A plain string keeps working, so the change is additive within
   `lexvm-pack/1`.
2. **Every place that shows a name resolves it against the current state:**
   chips and the inventory, command labels and echoes, the conversation
   heading, default messages, `{id}` markup, parser candidate lists and hint
   texts. Code that renders names takes the state explicitly (`null` where
   there is none, which shows the first variant).
3. **The parser recognises every variant.** A player who types "Tadeusz"
   before the watchman has introduced himself still means the watchman; this
   follows the forgiving policy ([ADR 0005](0005-forgiving-policy-verified-by-exploration.md))
   and reveals nothing the player did not type.
4. **A walkthrough check.** `lexvm check` warns (`text.name-before-reveal`)
   when a walkthrough step prints an earlier variant's text (the real name,
   also as a genitive) while that character is present and still unrevealed
   after the step. Mentions in their absence ("Fragen Sie Tadeusz am
   Zollkanal") are fine; the step that reveals the name is not checked,
   because the reveal usually comes with it. `lexvm generate` ranks the
   warning with the walkthrough findings.
5. **The rule for authors:** a character is called by name only once the
   player knows the name *and* that this person has it: it falls in
   conversation, or it follows compellingly from what the player knows.
   Before that, the character is described by appearance or role. The guide,
   its checklist and the world, logic and review prompts state it.

## Consequences

- Packs can introduce characters the way stories do. The reveal is an
  explicit, checkable condition in the pack, usually a flag set where the
  name falls.
- Prose before the reveal needs text variants where it mentions a present
  character; a `{id}` reference resolves by itself, but German inflection
  often needs written-out variants.
- The check only covers the walkthrough, and only the literal name while the
  character is present. Paths off the walkthrough and paraphrases still need
  the transcript review.
- Saves are unaffected (names are not state); the content hash of a changed
  pack changes as with any edit.

## Alternatives considered

- **Generic names forever** ("Wächter", "Händlerin"). No format change, but
  the game could never call a character by the name the player has learned.
- **Two objects per character**, swapped when the name is revealed. Every
  rule, dialogue and condition about the character would exist twice, and
  the swap would have to carry location and state across.
- **A dedicated `known` flag per object with an `introduce` effect.** Less
  general than conditions and a second mechanism next to text variants; the
  variants already express "this name once that holds", and a flag set in
  the right dialogue node is just as explicit.
- **Rejecting the real name in the parser before the reveal.** Stricter, but
  it punishes players for a guess the story invites and contradicts the
  forgiving policy.
