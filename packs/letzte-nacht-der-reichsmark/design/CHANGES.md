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

## Playtest round 1

Inputs: two blind playtests (a tap-only phone player, 180 commands, 9 hints;
an adventure veteran, 226 commands, 1 hint), a German story editor's
playtest (190 commands, all endings) and the engine/UI fixes that landed
just before (parser verbs »zünde … an«, »vergleiche«, »verbinde«,
»fahr«/»steig«, bare exit ids and labels, »notizbuch«, localised meta
texts, and »Kombinieren mit …« for `use` on clues). Each entry is
issue → decision.

### Blocker: combining notebook entries was never taught

- **Not taught in the game** → taught three times, in Voss's voice, without
  instructions to the player:
  1. Intro (`an_schluessel`, the second entry): »Du schreibst mit, wie
     früher bei der Versicherung. Ein einzelner Eintrag im Notizbuch beweist
     nichts. Erst wenn du zwei kombinierst, die zusammenpassen, wird ein
     Schluss daraus.« It uses the UI's word (»Kombinieren mit …«) and the
     parser's (»kombiniere«).
  2. Spind 23 (`open_spind`, the first valid pair): »Ein zweiter Schlüssel,
     beim Vorarbeiter. Und Jakobs eigener hing zu Hause am Haken. Zwei
     Einträge in deinem Notizbuch, die zusammengehören.« The walkthrough now
     makes D3 first, and `h_nur_kroeger` comes before `h_frisch`.
  3. Notebook descriptions: each half of a deduction ends with the question
     its partner answers, without naming it (»Wer kam dann noch an den
     Spind?«, »Wann kam dieses an Land?«, »Und wer verdient daran?«).
     Taking the pack after reading the Aushang adds »Welches Schiff, steht
     auf der Löschliste.«
- **Hints said »Benutze … mit …«** (deviation 2 of the first section) → the
  action sheet now says »Kombinieren mit …«, so third steps read
  »Im Notizbuch: Kombiniere »A« mit »B«.« The part after the colon can be
  typed as it stands; second steps use »Vergleiche …«, which the parser
  now maps to `use`.
- **Combining the wrong kind of thing** → `use … clue_kroeger_version`
  answers »Krögers Behauptungen widerlegst du nicht im Notizbuch, sondern ihm
  ins Gesicht.« `use … clue_asmussen` points to what is missing in each act.
  `use … aushang` points to the notebook entry.

### Kröger's interrogation loops without a pointer

- **Wrong evidence before the deduction** → after the rebuttal, a line in
  Voss's voice (an `if` on the missing proof; no state):
  - stage 1 with both halves noted: »Die Antwort steht schon in deinem
    Notizbuch, verteilt auf zwei Einträge. Erst kombiniert nagelt sie ihn
    fest.« With one half missing it points to the missing source (who
    profits, what he counted). With nothing in hand: »Du hast nichts in der
    Hand, was dagegen hält. Noch nicht.«
  - `k_s1_heft`: »Ein Heft gegen sein Wort. Gegen den Schwund brauchst du
    einen Schluss aus deinem Notizbuch, keinen einzelnen Eintrag.«
  - stage 2 points to Jakob's Heft, stage 4 to Anni (»Was in dem Kuvert
    war, weiß nur eine.«). Stage 3 needs none: it is reached only with the
    Heft, which Tadeusz gives only for »Untergeschoben«.
- **Showing half a proof to Tadeusz got the generic brush-off** →
  `show clue_frisch_an_land/clue_nur_kroeger tadeusz`: »Ein halber Beweis,
  Voss. Für Ihre Polizei ist ein halber Beweis ein ganzer Dieb.« With
  »Untergeschoben« noted, it opens his dialogue like the full proof.

### Natural verbs and phrasings

- **»bezahle wirt«, »kaufe bier«** → new pack verb `bezahlen` (Bezahlen;
  bezahle, zahl, kauf, bestich, spendier …), offered on the Wirt and on the
  new scenery `tresen` (Dünnbier, Bier, Köm, Glas). `bezahlen wirt`,
  `tresen`, `hoftuer` and `reichsmark` (in the Kneipe) do what
  `give reichsmark wirt` does; the walkthrough and `h_hintertuer` now use
  »Bezahl den Wirt.« In the backyard, buying anything gets Lene's »Zeig mir
  lieber, was du in der Tasche hast.«
- **»angle … mit dem Bootshaken«, »hol das Klemmbrett«** → `use` gets the
  synonyms angle/angeln/fische/halte, and `take klemmbrett` while holding
  the hook fishes for it (`take_klemmbrett_haken`).
- **»zünde die Laterne an«** (no matches named) → `use sturmlaterne`
  lights it (`laterne_anzuenden_kurz`); the matches cannot be dropped.
- **»zähle geld«, »horche an der Kontortür«, »hilf/trage Jakob«** →
  typed-only pack verbs `zaehlen`, `horchen`, `helfen` with a few answers
  (the Reichsmark, the crates, both doors, Jakob) and neutral defaults.
- **»lies zählheft«, »lies rechnungen«, »lies krögers version«** → the pack
  verb `lesen` is removed. Without a `read` verb the parser maps
  »lies/lese/lesen« to `look`, so every clue and object can be read.
  Documents show their text when examined; `look aushang` and `look zettel`
  teach their clues (rules `look_aushang`, `look_zettel`; the walkthrough
  says `look`). One verb fewer in the action sheet.
- **»setz (mit Tadeusz) über«, »fahr mit Tadeusz«, »steig ins Boot«,
  »nimm/fahr mit der Straßenbahn«, »geh auf den Hof«** → exit synonyms
  »setz über«, »setze über«, »Haltestelle«; the rest works through the
  engine's new go verbs and exit matching.
- **»untersuche hintertür«, »öffne hintertür«** → scenery `hoftuer`
  (Hintertür); opening it after paying walks into the yard (`goto`).
- **»öffne kontortür« said »Geh hinunter.«** → it now walks into the Kontor
  (»Sie ist nur angelehnt. Drei Stufen tiefer brennt Licht …«).
- **Disambiguation »Klemmbrett oder Tallyzettel: 180 Kisten?«** → the
  scenery no longer shares words with the clues: `aushang` loses
  »Löschliste/Liste«, `klemmbrett` loses »Tallyzettel/Tally«. The two
  clues are renamed »Löschliste (200 Kisten)« and »Tallyzettel (180
  Kisten)« (no colon in a name, 24 characters at most).
- **Plausible pairs rejected** → accepted where they carry the same
  facts: Jakob's count + Tallyzettel → D1 (»Jakob hat zweihundert Hieven
  gezählt, Kröger hundertachtzig Kisten …«); the pack + Löschliste → D2;
  the note on the floor + Persilschein → D6 (copies the note too). New
  near misses: »Frisch an Land« + »Der vergessene Schlüssel«, Asmussen's
  card + Lene's statement, Asmussen's card + Jakob's statement.
- **Not fixable in the pack (engine/UI follow-ups):** »hole X mit Y«,
  »bezahle den Wirt mit Reichsmark« and »angle mit dem Bootshaken nach …«
  (an instrument phrase after a one-object verb); »nimm alles«; echo lines
  of pack verbs use the label (»Bezahlen Wirt«, »Zählen Reichsmark«) and
  of give/show the colon form; `use` is still offered on every piece of
  scenery; answers to »Was meinst du …?«; »untersuche jakob« matching the
  clue »Jakobs Zählheft« when Jakob is absent.

### Fewer one-answer dialogue taps (tap player: 69 of 180 commands)

- **Anni's intro, 5 taps** → 3. She tells the police part unasked (one
  question fewer), and the promise is part of accepting the case
  (»Ich übernehme den Fall. Ich finde ihn.«); her farewell ends the scene.
- **Closers removed** (the answer ends the conversation): »Das wird es.«
  (`ah_gehen`), »Danke, Tadeusz.« (`t_danke`), »Verstehe.« after Lotte and
  after Tadeusz's condition, »Danke, Lene.« and »Und weiter?« (Lene's two
  lines are one beat now), »Wahrscheinlich nicht.« after Lene's Monday
  line, and »Und die Brücke?« (Kröger tells the way across with the key).
  »Ich hoffe, Sie finden sie.« stays as a beat but ends the conversation.
- **Kept on purpose:** »Natürlich nicht.« (Lene's lie), the ambush's two
  questions, Jakob's »Halten Sie durch.«, the refrain »Geld kann man
  umtauschen. Schuld nicht.« and every evidence choice.
- **The finale ladder forgets progress when you leave** → the Kontor (exit
  and `open kontortuer`) now opens only with Jakob's statement and D6. Its
  blocked texts point first to the note, then to the notebook. The ladder
  is never entered half-armed, and the state count fell (7,311 → 6,869).

### Editor's line edits

| Issue | Decision |
|---|---|
| Kröger's confession »Ich wollt ihn nicht schubsen … das Bein war ab« | »Ich hab ihn nicht geschubst, ehrlich. Er is auf der Lukentreppe ausgerutscht, das Bein war hin.« The notebook records his claim: »Gestoßen hat er ihn nicht, sagt Kröger.« |
| »das Bartschloss … bleibt stecken« | »… gibt das Bartschloss nach. Du lässt den Schlüssel stecken.« |
| »Ich habe es nicht gegeben.« | »Ich habe es ihr nicht gegeben.« |
| »Behalten Sie es.« for plural items | »Behalten Sie das.« / »Behalten Se das.« in every catch-all. |
| »in deinem Besucherstuhl« | »auf deinem Besucherstuhl« (intro, exit, roomText, hint); the chair is scenery now. |
| Unsourced »Tallymann war angeblich krank« | »Kröger hat selbst gezählt, in Vertretung des Tallymanns. Ausgerechnet er.« |
| Kommissar Petersen never introduced | Anni: »Kröger hat aufgeschlossen, Kommissar Petersen hat zugesehen.«; the notebook says so; the Kripo ending refers back to it. |
| »der einzige trockene Ort in Hamburg« under a burnt roof | »Kisten bis unter die verkohlten Balken, sorgfältig gestapelt und mit Teerpappe abgedeckt … Das Trockenste, was du heute gesehen hast.« |
| »Geh hinunter.« | See »öffne kontortür« above. |
| 10:1 debts before 27 June | »Es heißt, nach Sonntag schrumpfen sie auf ein Zehntel. Das wäre das einzig Gute an dieser Woche.« (a rumour). |
| »Asmussen bittet um ein Telefon« | »Asmussen will telefonieren; sein Anwalt bringt drei neue Persilscheine.« |
| Lene's »du« | Kept and marked: style.md gives Lene »du«; her first line adds »Schätzchen«, her description »Sie duzt jeden, der nichts kauft.« |
| »Kondoliert hab ich« | »Beigestanden hab ich.« |
| Asmussen »Lesen Sie Ihre eigenen Notizen.« | »Fragen Sie, wer den zweiten Schlüssel hat.« |
| Tally + Zählheft rejected; »Zweihundert gelöscht« | Pair accepted (D1); »Laut Löschliste sollten zweihundert Kisten an Land, Kröger hat hundertachtzig gezählt.« |
| »benutze lotte« offered | Lotte is a character (`npc: true`): look and talk only; talk, show and give answer »Du lässt sie schlafen.« |
| Nouns in room texts that cannot be examined | New scenery: Besucherstuhl, Viadukt (Hochbahn, Pfützen, Kräne), Feldbetten (Wolldecke), Tresen (Dünnbier, Köm), Hintertür, Kolonne (with its own roomText), Plane, Thermoskanne, Asmussen's Schreibtisch. Synonyms: Handtasche (Anni), Decke (Eimer), Kreide, Rückwand, Speicherblock. »Treppe« and »Hose« stay unexaminable. |
| Straight apostrophes | ’ everywhere in game text. |
| »Emaille-Eimer« / »Emaillekanne« | »Emailleeimer«, »Emaillekanne«. |
| »Wer glaubt schon einem Dieb.« | »… Dieb?« |
| »Zu weit für deinen Arm.« | »Dein Arm reicht nicht bis an den Nagel.« |
| »ein Gesicht, das Preise im Kopf ausrechnet« | »Hinter ihrer Stirn laufen ständig Preise mit.« |
| Wirt names the sum without counting | »Der Wirt wiegt das Bündel in der Hand, statt zu zählen. »Zweihundert, schätz ich. …«« |
| »Jakob hat dasselbe gezählt wie du«, »Beweisen musst du es zuerst Kröger«, »war vorher noch auf See« | »Jakob kam auf dieselbe Rechnung wie du, zwanzig zu wenig.«; »Aber zuerst musst du Kröger damit festnageln.«; »war am Donnerstagmittag noch auf See.« |
| »Seit Donnerstagmittag passte nur noch Ihr Schlüssel.«; Asmussen jumps to Kröger | »Seit Donnerstagmittag kam nur Ihr Schlüssel an den Spind.«; »Ich war oben« now gets »Oben? Da lagert nichts. Und wenn doch, fragen Sie Kröger.« before »Ein Vorarbeiter unter Hunderten …«. |
| The new lock is »das einzig Neue« twice | Opening: »Der Schlüssel passt, natürlich. Das Schloss ist geölt, die Tür schwingt lautlos nach innen auf.« |
| Hint tense and repetition | »… und Lene hat genau dieses Los bei Kröger gekauft.«; »Fahr mit der Straßenbahn zur Siedlung und frag Anni nach Krögers Kuvert.« |
| »Block K«; Kaischuppen at night | Speicher K is »Speicherblock K« on examination (synonyms »Speicherblock«, »Block K«); the Baumwall says the shed lies »noch diesseits des Zollzauns«. |
| Ending chronology; Tadeusz's thread | Jakob is carried out before Kröger's later fate; every variant adds »Tadeusz rudert, dann sagt er aus. Weggesehen hat er lange genug.« Kröger »redet drei Stunden lang«. Variants stay ≤ 800 characters. |
| Notebook »7 Uhr« and »NAAFI« before any source | »Freitag früh: zwei Stangen englische Zigaretten …« |
| Hint 3 »Tippe Anni an …« (GUI words) | »Sprich mit Anni und hör ihr bis zum Ende zu.« |
| Boat hook vanishes after »an der Schuppenwand lehnen« | It falls into the locked cabin (»Er gehörte Tadeusz ja sowieso nicht.«); the cabin shows it, `take` explains it stays. |
| Lene's »Ratschläge kosten extra« never pays off (veteran) | Her statement ends »Der Ratschlag war umsonst. Wegen Jakob.« |
| Accepting a bribe (veteran) | Not added: under the forgiving policy every ending is a win, and a bribed ending would have to be one. |
| Parser messages in „…“, »(1–1)«, English meta texts, echo grammar | Engine catalog; handled or listed by the engine fixes, not in the pack. |

### Deviations from the design files (this round)

1. No pack verb `lesen` (puzzles.md "Pack verbs"); documents are read with
   `look`. New pack verbs `bezahlen`, `zaehlen`, `horchen`, `helfen`.
2. Walkthrough 74 steps (puzzles.md and concept.md updated): `look`
   instead of `lesen`, `bezahlen wirt` instead of `give reichsmark wirt`,
   D3 before D2, five one-answer `choose` steps fewer.
3. The Kontor needs `clue_dieselbe_hand` as well (world.md gives only
   Jakob's statement).
4. Clue names »Löschliste (200 Kisten)« and »Tallyzettel (180 Kisten)«
   (world.md: »Löschliste: 200 Kisten«, »Tallyzettel: 180 Kisten«).
5. Second triggers for four clues (puzzles.md, rule for implementers 1):
   they need only clues the primary source needs too, so they add
   transitions, not states (explorer: 6,869 states, down from 7,311).
6. Lotte is `npc: true` (world.md: scenery).
7. Option ids removed: `an_frag_polizei`, `an_abschied`, `ah_gehen`,
   `ah_zurueck`, `l_und`, `l_zurueck2`, `l_zurueck3`, `t_zurueck1`,
   `t_danke`, `k_g_weiter`; node `k_boot` merged into `k_wo`, `l_kuvert`
   into `l_redet`, `an_polizei` into `an_jakob` (cast.md).

### Diagnostics after this round

`lexvm check`: 0 errors, 0 warnings, 1 info (play time). Walkthrough 74
steps, ending `ende_erster_morgen`, 25/25. Exploration complete, 6,869
states, winnable, shortest win 69 steps, 0 dead ends, 0 losing endings;
nothing unreached. Play time ≈ 47 min expected (47.4; target 40, +18%,
inside the 30–50 window and the 25% tolerance), speedrun 24 min. The +2.6
minutes against the integration pass come from the new scenery and
answers players asked for; the merged dialogue steps save about half a
minute. Text: every hard limit holds; above style.md's soft targets are
only `h_verhoer` step 2 (122 characters) and the names from world.md
listed above.

## Narrative revision

Input: a review of the playtested pack. The mechanics and the puzzles were
sound, but the story was hard to follow: telegram-style sentences, scenes
without arrivals or transitions, characters reduced to the facts a puzzle
needs. The truth, the motives and the backstory lived in these design files
and reached the player only in fragments. A second note asked for fewer
harbour terms that readers outside northern Germany do not know.

### Diagnosis

Measured on the pack before this revision: median sentence length six words,
78% of all sentences eight words or shorter; about 6,000 player-visible words
against about 20,000 words of design documents. Three rules had pushed the
text there: style.md's »6–14 words, one observation per sentence«, the
authoring guide's advice to grow a game through mechanics rather than text,
and the play time model, which priced a command at 18 seconds of tapping but
only 8 of reading and therefore made every added sentence a cost. The
integration pass and playtest round 1 both cut text to meet the 45-minute
target. The engine and prompt changes that address the cause are recorded in
[ADR 0012](../../../docs/adr/0012-narrative-pacing.md).

### Decisions

1. **Pacing `narrative`, `playtime: 65`.** The mechanics stay exactly as they
   were (same ids, conditions, effects, walkthrough, score and state space:
   6,869 states). Keeping 45 minutes with a 60% reading share would have
   meant cutting about a third of the puzzles. With the recalibrated model
   the estimate is about 68 minutes, 59% of it reading (before: 51 minutes
   with the new model, 46% reading).
2. **New [story.md](story.md):** the truth with every motive, the
   through-line, a scene plan with arrival, turn and way out per scene, and a
   revelation map that names, for every fact the ending relies on, where the
   player learns it.
3. **style.md:** varied rhythm instead of 6–14 words; Voss thinks (one or two
   sentences after a clue that changes the case); scenes instead of data
   fields; narrative text budgets; the plain-language glossary.
4. **Texts rewritten scene by scene** (rooms, dialogues, solving responses,
   deductions, intro, endings). Notable additions, all text only:
   - the intro sets up Voss's past as Asmussen's insurer, which the finale
     pays off;
   - Anni's scene ends with Voss ordering the three leads;
   - Kröger's first talk ends with Voss noting that he had his four claims
     ready, which teaches the interrogation as a checklist;
   - Asmussen's warning ends with Voss's conclusion (he denied Speicher K
     before anyone asked);
   - every deduction says what it changes; D4 turns the case from »where is
     Jakob« to »who wants him gone«;
   - Tadeusz's scene points to the tally sheet (or confirms it) and links
     Speicher K to Asmussen's card;
   - the confession is a scene: the fall, the doctor Kröger wanted, the
     water every evening; the Persilschein is explained in one sentence;
   - the crossing is told on arrival at the water side, not before the
     player boards;
   - the finale gives each proof a reaction; the endings name what happens
     to every character.
   New conditional lines use `if` effects that only print text.
5. **Plain language.** Harbour terms replaced or explained on first use; the
   table is in style.md. Display names changed: Ladeliste (200 Kisten),
   Zählzettel (180 Kisten), Schuppen 17, Vierter Stock, Brandschutztür,
   Krögers Schlüssel, Bürotür, Asmussens Büro, Lastkähne, Lastkahn »Elise 7«.
   The old words stay as synonyms. Hints use the new names.
6. **Version 1.1.0.**

### Verification

`lexvm check`: 0 errors, 0 warnings; walkthrough 74 steps, 25/25;
exploration complete, 6,869 states, 0 dead ends. A comparison of the
compiled pack before and after, with every text field, name, synonym and
hint step removed, is identical: the revision changes no mechanics. Both
tap-walkthrough end-to-end tests pass. `lexvm transcript` prints the text a
player reads along the walkthrough (about 5,800 words, before about 3,000).

## Notebook entries ahead of the story

A player opened the notebook during Anni's opening conversation and read
»Freund: Tadeusz am Zollkanal« two nodes before Anni names him. The cause
was in the design from the start: world.md wrote each clue's text as a
summary of its whole source, cast.md placed the `learn` in an early node of
that source, and the merge of `an_polizei` into `an_jakob` moved it earlier
still. No stage owned the timing of a clue against its text, and the
transcript, which the review reads, showed no notebook entries.

The rule now in the authoring guide: a clue says only what the player has
read when its `learn` runs; the exception is an entry that is the text of a
document. Reading the transcript, which now shows every entry where it is
learned, found five more entries ahead of the story:

| Clue | Ahead of the story | Change |
|---|---|---|
| `clue_auftrag` | Tadeusz and the Zollkanal (`an_bezahlung`) | `learn` moved from `an_jakob` to the end of `an_bezahlung` |
| `clue_asmussen` | his denial, the Ruine, the 500 Reichsmark (`a_w_geld`) | `learn` moved from `a_w_start` to option `a_w_ablehnen` |
| `clue_zaehlheft` | the register and its owner (`t_elise`) | `learn` moved from `t_heft` to `t_elise`; the point stays in `t_heft` |
| `clue_schweigegeld` | that Anni paid Voss with it (`ah_warum`) | `learn` moved from `ah_kuvert` to `ah_warum`; the point stays in `ah_kuvert` |
| `clue_gestaendnis` | where Jakob lies (`k_wo`) | `learn` moved from `k_gestaendnis` to `k_wo`; the points stay in `k_gestaendnis` |
| `clue_schluessel` | »Nissenhütte«, before anyone says where the Brodersens live | text: »bei den Brodersens zu Hause« |

Each `learn` moved within a forced sequence: the nodes in between offer one
option and a dialogue accepts only `choose`, so no state outside the
conversation changes. Left as they are: `clue_persilschein`,
`clue_anweisung`, `clue_loeschliste` and the card fields of `clue_asmussen`
(the entry is the document), and the lock in `clue_zweitschluessel`
(Voss's own observation of what the player has just seen). Version 1.1.1.

### Verification

`lexvm check`: 0 errors, 0 warnings; walkthrough 74 steps, 25/25;
exploration complete, 6,869 states (unchanged), 0 dead ends.
