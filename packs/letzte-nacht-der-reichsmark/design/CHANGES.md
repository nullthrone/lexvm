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
