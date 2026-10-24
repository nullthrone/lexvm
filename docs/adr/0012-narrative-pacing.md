# 0012. Narrative pacing: calibrate play time by reading share, write story before data

- Status: Accepted
- Date: 2026-10-24

## Context

The first German pack, *Die letzte Nacht der Reichsmark*, passed every check
and its puzzles played well, but a review found the story hard to follow:
telegram-style sentences, scenes without arrivals or transitions, characters
reduced to the facts a puzzle needs. The story existed, but in the design
documents (about 20,000 words) rather than in the game text (about 6,000).

The causes were in the toolchain, not in the model that wrote the text:

1. **The play time budget priced reading as a cost.** `budgetForMinutes`
   assumed 20 words of new text per walkthrough command and charged about 18
   seconds of tapping per command against about 8 seconds of reading. A
   45-minute German pack was budgeted at 2,700–3,400 words in total, and the
   guide told authors to grow a game through puzzles, "not longer
   descriptions". Every added sentence moved a pack towards
   `playtime.too-long`, and the repair loop cut text first.
2. **The interaction rate was too low.** The model assumed 0.5 unproductive
   attempts per productive command. The pack's playtest logs (180 and 226
   commands for a 74-step walkthrough) imply about 0.9 to 1.8 after optional
   looks and dialogue options are taken out. So the model underestimated
   interaction time and overstated how much text a target allowed; the pack
   had text cut to meet a target it already exceeded.
3. **Style rules and prompts asked for brevity.** "6–14 words per sentence",
   "rule messages 1–2 sentences", text budgets with "aim well below", and a
   pipeline whose only prose-producing stages write YAML fields one at a
   time. No stage wrote the story as scenes, and no check ever read the game
   the way a player does.
4. **No signal for narrative quality.** Verification gives precise feedback on
   length and logic; nothing gave feedback on whether the text could be
   followed, so every revision optimised what was measured.

## Decision

1. **Packs declare a `pacing`.** `narrative` (about 60% of the expected time
   is reading), `balanced` (45%, the default for sizing) or `puzzle` (30%).
   `budgetForMinutes` splits the target minutes by that share: interaction
   sizes the walkthrough, reading sizes the text. `lexvm check` reports the
   reading share of every pack and warns (`playtime.pacing`) when a declared
   pacing is missed by more than 10 points. The warning for a narrative pack
   that is too short suggests scene prose before more puzzles.
2. **The attempt rate is recalibrated** from 0.5 to 1, the cautious end of the
   playtest range. The reference demo's target moves from 5 to 7 minutes.
3. **Narrative packs get longer text budgets** (room 1000, object 600,
   dialogue line 600 characters); option texts and names keep their limits.
4. **Story before data.** `lexvm generate` and the prompt kit get a `story`
   stage between concept and puzzles: the truth with motives, a scene plan
   (arrival, turn, way out), a revelation map and the key scenes in prose.
   Later stages derive their texts from it. The guide gets a section "Story
   and scenes" with rules for arrivals, transitions, the player character's
   inner voice and sentence rhythm.
5. **Read what the player reads.** `lexvm transcript` renders the walkthrough
   as Markdown. A `review` stage gives the transcript and the story to the
   model as an editor with a rubric (can it be followed, transitions, what a
   clue means, turning points, characters, rhythm). `lexvm generate` runs one
   review round once a pack passes; the result is verified like any repair,
   and the last passing version is restored if it breaks.
6. The noir pack is rewritten under these rules with its mechanics unchanged
   (pacing `narrative`, playtime 65).

## Consequences

- Generated packs of the same length get fewer puzzles and more story when
  they choose `narrative`; `balanced` packs get somewhat more text than before
  (45% instead of an implicit 29% reading).
- Estimates of existing packs rise by roughly 10%, because interaction is
  priced higher.
- `playtime.pacing` can be met by padding. The guide forbids padding, and the
  review stage and the transcript exist to catch it; the warning is only
  issued for packs that declare a pacing.
- The calibration rests on two playtests of one pack. It should be revisited
  when playtests record session durations.
- A generation run makes two more model calls (story, review).

## Alternatives considered

- **Only loosen the style rules.** Longer sentences without a different budget
  would have been cut again by the length repair and by authors chasing the
  target; the budget is what made prose expensive.
- **Raise the words per command globally.** One number cannot fit a puzzle box
  and a mystery; the reading share makes the trade-off an explicit authoring
  decision per pack.
- **Keep the noir pack at 45 minutes.** At 60% reading this leaves about 18
  minutes of interaction, roughly two thirds of the current mechanics. The
  puzzles were the part of the pack that worked, so the target moved instead.
- **An automatic prose-quality metric** (sentence length, connectives) as a
  warning. Easy to game and a poor proxy for "can a reader follow it"; the
  transcript review asks that question directly.
