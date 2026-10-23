# Changes against the design

Deviations of the implemented pack from the binding design files
(concept.md, cast.md, world.md, puzzles.md, style.md), each with its reason.
Additions that only print text are listed separately; they change no state.

## pack.yaml, rooms.yaml, objects.yaml, rules.yaml

### Deviations

1. **License `CC-BY-4.0`** instead of the recommended `CC0-1.0`. The
   concept left the final call to the product owner; the pack metadata of
   the implementation brief sets `CC-BY-4.0`.
2. **Hint wording »Benutze … mit …« instead of »Kombiniere … mit …«** in
   the third step of `h_frisch`, `h_nur_kroeger`, `h_untergeschoben`,
   `h_zwanzig`, `h_kein_schwund` and `h_hand`. Tap players combine clues
   with the action-sheet verb `use`, whose label is »Benutzen«; there is
   no »Kombinieren« button. The parser still accepts »kombiniere«.
3. **Reichsmark gags that can never fire are left out:** `give reichsmark
   lene`, `give reichsmark jakob` and `give reichsmark asmussen` (cast.md,
   "Reactions outside dialogues"). The Reichsmark always goes to the Wirt
   before the back door opens, and Lene, Jakob and Asmussen can only be met
   after that, so `lexvm check` reports these rules as never firing. The
   gag keeps its payoff with Kröger, Tadeusz, Anni and the Wirt.
4. **Room text, Kaischuppen 17:** »An der Wand *stehen* die {spindreihe}«
   instead of »steht die {spindreihe}«. The object's name is the plural
   »Spinde«, so the draft rendered as »steht die Spinde«.
5. **Room text, Vierter Boden:** ends with »Durch die offene {bodentuer}
   führt die Treppe hinunter.« The door is also present in this room
   (`alsoIn`), and every present scenery object must be named in the room
   text.
6. **Room text, Treppenhaus Speicher K:** a third variant (`isOpen:
   bodentuer`, first) says the door stands open; the lit variant's »Oben
   verschließt eine {bodentuer} den vierten Boden« would be wrong after
   the door is opened.
7. **Documents follow style.md, not the drafts' typography:** document text
   inside narration and clue descriptions uses ›…‹ (the drafts used »…«),
   and the Bekanntmachung uses digits (»40 Deutsche Mark gegen 40
   Reichsmark«). The Löschliste is printed as a line-broken document.
8. **Wirt line** »Stecken Se das weg. Hier vorne wird nur Bier verkauft.«
   instead of »Steck das weg …«: style.md gives the Wirt the address »Se«.
9. **Spind 23 description** gets one more variant: while the cigarette
   pack is still inside, it mentions something behind the back wall; once
   the pack is taken, the empty variant applies. The engine appends the
   container contents itself.

### Text-only additions

- »Schon notiert: …« replies for every deduction that was already made
  (`d1_schon` … `d6_schon`), instead of the generic use default.
- Four more near misses that teach the two-half logic of D4, D5 and D6:
  `nm_frisch_zweitschluessel`, `nm_nur_kroeger_los`, `nm_lene_tally`,
  `nm_anweisung_gestaendnis`.
- `show clue_gestaendnis tadeusz` (before the crossing) opens
  `tadeusz_gespraech`, like the existing `show clue_untergeschoben
  tadeusz` redirect. It is a shortcut for tap players into a dialogue that
  `talk tadeusz` reaches anyway; it sets nothing itself.
- Reactions: `show clue_zaehlheft anni`, Lene after her statement
  (`show_lene_wieder`), the Blechdose after the envelope scene, the
  Klemmbrett after the tally, `take fuellhalter`, `use lotte`,
  `use streichhoelzer zettel`.
- State-dependent text variants: the match count after lighting the
  lantern, the Kneipe's back door after paying, Kröger after the
  confession (description and roomText), Jakob after his testimony,
  Asmussen in his office, the Zettel after copying it.

## dialogues.yaml

All dialogue, node and option ids and every `choose` step of the
walkthrough match cast.md and puzzles.md. No dialogue sets or reads state
beyond the design. The changes are text only:

- **New optional scene with Anni after the confession:** option `ah_lebt`
  »Jakob lebt, Frau Brodersen.« (`has: clue_gestaendnis`) leads to node
  `ah_lebt`, which ends the dialogue. Two texts, depending on
  `clue_jakob_aussage`, so Voss can pass on Jakob's message. It sets and
  moves nothing.
- **More text variants:** `k_hub` once `kroeger_stufe` is at least 1;
  `t_hub` for `tadeusz_rudert` and for `clue_jakob_aussage` (Tadeusz is
  then in the boat, not on the quay).
- **Reactions to the right evidence:** `k_s1_kein_schwund`, `k_s2_heft`,
  `k_s3_untergeschoben`, `f_s1_persil` (cast.md sample line 2) and
  `f_s2_hand` print a short reaction before the next claim. Asmussen's
  »stellt die Tasse ab« moved from `f_s3` into the `f_s2_hand` reaction.
- **Lines that are shown again** after a back option or a rebuttal
  (`ah_hub`, `l_hub`, `t_hub`, `f_s2`, `f_s3`) are worded so that they
  read correctly the second time.
- **Wording:** `a_w_start` says »Er reicht dir eine Karte.« (explains the
  clue name »Asmussens Karte«); `f_s1_persil` quotes the Persilschein;
  `k_s3_nur` says »Seit Donnerstagmittag«; `k_s4_heft` »ein Hafenheft«
  (one dialect marker per sentence); Asmussen says »da lagert niemand
  etwas«; `t_jakob` and `k_weg` have one more sentence each.

## Integration and editing pass

### Deviations

1. **Play time.** The first full build was estimated at about 47 minutes
   (`lexvm check`, playtime.estimate), above the 30–45 minutes allowed for
   `playtime: 40`. The largest single cost was the hub: the 60-word
   Baumwall description was printed on each of its eight visits. The
   changes below bring the estimate to about 45 minutes (44.8) without
   cutting a puzzle, a clue or a dialogue beat.
2. **Short texts on return visits** (text variants only):
   - `baumwall`: after any of `kaischuppen`, `zollkanal`, `kneipe`,
     `nissenhuette` was visited, a two-sentence text that still names the
     Bekanntmachung and the three directions. This uses `visited`
     conditions, which puzzles.md ("Rules for implementers", 2) rules
     out. The rule is there to protect the state space; a condition in a
     text variant is not part of the explorer's state key (relevance
     analysis ignores text variants). With all return texts in place the
     explorer still found 7,321 states, as before; the 7,311 states of the
     final pack come from deviation 4.
   - `kneipe`: short texts once the Wirt is paid or Kröger has stated his
     version; `kroeger` gets a short roomText after the first talk.
   - `kaischuppen`: short texts once the Aushang is read or the locker is
     open, and after the tally.
   - `zollkanal`: a short text once the boat hook is gone.
   - `speicher_treppe`: the lit and the open-door variants are one
     sentence shorter (the smell is told in the dark first visit).
   Every variant still names every object of the room with `{id}`.
3. **Walkthrough: 79 steps instead of 80.** `take sturmlaterne` is left
   out. The rule `laterne_anzuenden` already moves the lantern into the
   inventory (puzzles.md), the hint `h_laterne` only says to use the
   matches, and the explorer's shortest win does the same. Everything else
   is the walkthrough of puzzles.md, in its order.
4. **`ah_lebt` has no closing option** (the dialogue writer's
   `ah_unterwegs` »Bin schon unterwegs.« is removed). The scene now ends on
   Anni turning to the wall. The first text is one sentence shorter.
5. **`show` catch-alls for Kröger, Jakob and Asmussen.** The cast.md lines
   (»Kröger schiebt dein Notizbuch weg …«, »Nicht mit Ihrem Notizbuch.«,
   »Papier, Voss …«) are wrong when an item is shown, and the catch-alls
   also answer items. New lines: Kröger »sieht nicht hin. ›Wenn Se was
   wollen, reden Se mit mir.‹«; Jakob »blinzelt ins Licht. ›Reden Sie mit
   mir, Voss. Ich seh nicht mehr gut.‹«; Asmussen »sieht nicht einmal
   hin. ›Ich kaufe nichts, Voss.‹«
6. **Hint `h_verhoer`**, steps 1 and 2, shortened towards the 120-character
   target of style.md.

### Text-only fixes and additions

- `show zigarettenpaeckchen kroeger` (new rule `show_paeckchen_kroeger`):
  the pack he planted is a likely thing to show him. Two variants, before
  and after the confession.
- `tadeusz` default roomText »Auf einem Poller sitzt {tadeusz} …« instead
  of »Vor der Wachbude …«, which followed »An der Wachbude lehnt ein
  {bootshaken}.« directly.
- `schuten`: once the hook is taken, the description no longer says that
  one leans against the Wachbude.
- `lesen wachbude` after the crossing: Tadeusz is in the boat, so the
  register lies open instead of being pushed across.

### Diagnostics

`lexvm check`: 0 errors, 0 warnings. The one info is the play-time
estimate. Text lengths stay within the hard limits. The lower targets of
style.md are exceeded only by names taken from world.md (six clue names of
21–24 characters, »Speicher K, Wasserseite« and »Treppenhaus Speicher
K«), the boat-hook message (256 characters over two paragraphs), option
`f_s2_hand` (61) and the second step of `h_verhoer` (122).
