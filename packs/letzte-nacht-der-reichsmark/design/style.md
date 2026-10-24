# Style guide: German prose for *Die letzte Nacht der Reichsmark*

This guide is binding for every player-facing text in this pack: room and
object descriptions, rule messages, dialogue, hints and endings. It adds to
the general rules in the [authoring guide](../../../docs/authoring/guide.md)
(sections 9 and 10). The guide itself is in English; all examples are
German, as they appear in the game.

## Narrative voice

- **Second person, »du«, present tense:** »Du stehst unter dem Viadukt.«
  Never »ich«, never past tense in narration. Characters may use the past in
  their own speech.
- **Varied rhythm, not telegram style.** Sentences range from three words to
  thirty. A long sentence carries an observation together with its
  consequence; a short one sets the accent after it. Thoughts that belong
  together are joined by their logic (»weil«, »aber«, »also«, »während«,
  »obwohl«). Never three fragments in a row. (The first version of this pack
  prescribed 6–14 words per sentence; the result had a median of six words
  and read like a telegram. See CHANGES.md, »Narrative revision«.)
- **Scenes, not data fields.** Every place has an arrival (where you are, who
  is here, what is at stake), every conversation a turning point that is
  written out with a reaction, every chapter a transition that says why Voss
  goes on and where. The scene plan is in [story.md](story.md).
- **Voss thinks.** After a clue that changes the case, one or two sentences
  in Voss's head say what it means: what is now certain, what is still open,
  what follows. Voss reasons like a claims adjuster: lists, times, who had
  access. Never a summary of what the player has just read.
- **Noir, dry and precise.** The narrator notices a lot and judges little.
  Understatement beats adjectives: »Der Schuppen ist lang wie eine Straße und
  leer bis auf den Geruch.« not »Der riesige, unheimliche, verlassene
  Schuppen …«
- **Images, sensory and concrete,** one leading image per paragraph. The
  pack's palette:
  - Rain on corrugated iron.
  - Coal smoke, diesel, tar, wet jute.
  - Raw coffee, Muckefuck, Köm, petroleum.
  - Brick dust in puddles.
  - The crane as gallows, the stove in June.
  Never more than two adjectives on one noun.
- **Dry humour, aimed upward.** Jokes are about money, the powerful and the
  absurdity of the week: »Ab Sonntag schrumpfen sie auf ein Zehntel. Das
  ist das einzig Gute an dieser Woche.« Never about hunger, the dead, the
  war's victims, or people's poverty.
- **The refrain** belongs to Voss and appears once, in the climax: »Geld kann
  man umtauschen. Schuld nicht.« Don't use it anywhere else.

## The player character

Voss is **ungendered**. Hold this everywhere:

- Address: »Voss«, »Sie«, »du«. Never »Herr Voss«, »Frau Voss«, »Detektiv«,
  »Detektivin«, »Ermittler«, »der Schnüffler«.
- Nouns that refer to the player must be epicene: »die Spürnase«,
  »die Person«. Better still, use no noun: »Du bist nass.«
- No gendered pronouns in third-person references to the player. Characters
  talk *to* Voss, not *about* Voss. Asmussen's »Wie Sie meinen« is right;
  »Er/Sie ist gefährlich« is forbidden.
- Check rule messages for hidden gender. »Du bist Ermittler, kein
  Einbrecher« → »Glas einschlagen? Dann steht morgen dein Name in der
  Zeitung.«

## Quotation marks and typography

- **Speech:** »…« (guillemets pointing inwards). **Quotes inside speech,
  document text inside narration, and names in speech:** ›…‹.
  - »Im Register steht: A. & Co., Speicher K.«
  - Auf der Banderole: ›NAAFI – LOT 4471‹.
- **Ship and barge names in narration** take guillemets: die »Elspeth Gray«,
  die »Elise 7«. Inside speech they take ›…‹.
- Narration and speech in one dialogue line are fine:
  - Kröger grinst. »Und wo solln die hin sein?«
  - »Zweihundert«, sagt er. »Ich zähl immer.«
- Use the dash – (en dash with spaces) and the ellipsis … as one character.
  No `--`, no `...`.
- Real umlauts and ß in all player-facing text. Ids stay ASCII.
- **Numbers:**
  - In speech and narration, write them out (»zweihundert«, »halb zwei«).
  - In documents, use digits (»200 Kisten«, »01:20«, »17.6.48«).
  - Years in speech are spoken (»seit dreiundvierzig«); in documents, digits
    (»seit 1934«).
- **Money:** in prose, »Reichsmark« and »Deutsche Mark« (colloquially
  »D-Mark«, »Mark«). »RM« and »DM« appear only in documents and on the
  chalkboard. The new money is never called anything a 1948 Hamburger
  would not say.

## How the characters speak

Each character keeps one address form for Voss and one dialect weight.

| Character | Address | Register | Markers (use sparingly) |
|---|---|---|---|
| Anni | »Sie«, »Voss« | short, proud, Hanseatic; practical words instead of feelings | »Lebensmittelkarte«, »Kartenstelle«; no dialect spelling |
| Kröger | »Se«, »Voss« | gruff harbour Missingsch, short | »Se«, »nix«, »is«, »'n«, »solln«; **at most one marker per sentence** |
| Wirt | »Se« | laconic Missingsch | »Dünnbier oder Dünnbier?«, »Geh'n Se ruhig durch.« |
| Lene | »du« | quick, sardonic street Hamburg | »Wart's ab«, »is«, »'nem«; one-liners about money |
| Tadeusz | »Sie«, »Voss« | precise, formal standard German, dry irony | **no accent spelling, no broken grammar, no »Polish« clichés**; complete sentences, subjunctive where a careful speaker uses it |
| Asmussen | »Sie«, »Voss« (without a title, condescending) | smooth Hanseatic upper class, never loud | full sentences, merchant's vocabulary (»gebürgt«, »zurückgehalten«), euphemisms |
| Jakob | »Sie«, »Voss« | plain, feverish, counting | numbers, short fragments |

**Hamburg Platt and Missingsch.** Use a touch, not a costume. Allowed:
»Moin«, »Schiet«, »nix«, »is«, »'n«, »Se«, »Klönschnack«, »Deern« (said
about someone else, never to Voss), »Köm«, »Muckefuck«, »Dünnbier«. Forbidden:
whole sentences in Platt, phonetic spelling that needs decoding, and dialect
as a joke at someone's expense.

## Period vocabulary

**Understandable first.** Players outside northern Germany must follow every
sentence without a glossary. Narration uses plain words for harbour work; a
period term appears only where it carries the setting, and is explained the
first time it occurs, in the sentence itself (»ein Köm, ein Kümmelschnaps«,
»Muckefuck, Ersatzkaffee«, »Persilschein, so nennt man diese
Gefälligkeitsbescheinigungen …«). The plain-language revision replaced:

| Harbour term (old) | In the pack now |
|---|---|
| Schauermann, Schauerleute | Hafenarbeiter |
| Hieve | Kiste (am Kran), Last am Haken |
| Löschliste, löschen | Ladeliste, entladen |
| Tallyzettel, Tallymann, Tally | Zählzettel, Kontrollzähler, Zählung |
| Kaischuppen 17 | Schuppen 17 (»ein Lagerschuppen am Kai«) |
| Schute, Schutenwächter, Schutenregister | Lastkahn, Wachmann bei den Lastkähnen, Register |
| Boden (warehouse floor), Bodentür, Bodenschlüssel | Stock, Brandschutztür, Krögers Schlüssel |
| Kontor, Kontortür, Kontorhaus | Büro, Bürotür, Bürohaus |
| Lukentreppe, Wassertreppe | Treppe an der Ladeluke, Treppe ins Wasser |
| Ducht, Riemen, Fleet | Sitzbank, Ruder, Kanal |

The old words stay as parser synonyms, so typed commands still work.

**Use** (all attested for Hamburg 1948, explained where needed):

- **Harbour:** Kolonne, Vorarbeiter, Bootshaken, Freihafen, Zollkanal,
  Speicher, Ladeluke.
- **Everyday life:** Lebensmittelkarte, Kartenstelle, Kopfgeld, Nissenhütte,
  Straßenbahn, Hochbahn, Viadukt, Litfaßsäule.
- **Black market:** Stangen, Amis, Kippen, Feuersteine, Bauchladen.
- **Authority:** Militärregierung, die Engländer (colloquial: die Tommys,
  only in Kröger's mouth), Kripo, Schupo, Kommissar.
- **Denazification:** Persilschein, Entnazifizierung, Mitläufer, entlastet.
- **Displaced persons:** DP, Suchliste.

**Never use (anachronisms):**

- *Okay, Job (use Arbeit), Stress, Team, Deal, Meeting, cool, checken, Handy,
  Teenager, Location, Mafia, Bullen, Schwarzgeld.*
- *Bundesrepublik, Westdeutschland* (the state was founded in 1949).
- *Wirtschaftswunder, Stunde Null, Trümmerfrauen, Nachkriegszeit*: later
  terms looking back.
- *Euro.*
- *Holocaust, Shoah*: the terms are later. The pack does not depict these
  events anyway; see below.
- Modern profanity. Allowed are »verdammt«, »Schiet«, »Mistkerl«.

**Facts to keep straight.** The concept lists the verified facts. In
particular:

- The *Kopfgeld* is 40 DM in exchange for 40 RM, collected on Sunday,
  20 June at the ration-card office.
- Old debts shrink to a tenth.
- The shop windows are full on Monday, 21 June.
- The Speicherstadt burned in July 1943.

Do not add law numbers, real firms, real officials or real street addresses
beyond Baumwall, Zollkanal and Kehrwieder.

## Sensitive topics

The pack touches the Nazi past, forced labour, war captivity, hunger and
poverty. The rules are:

1. **No atrocity as a puzzle, a decoration or a twist.** Camps,
   persecution and deportation are never puzzle material and never scenery.
   The first proposal's line about an »Aryanised« firm is cut. Asmussen
   needles Voss with Voss's own past as his insurer instead.
2. **The victims speak for themselves, briefly and with dignity.** Tadeusz's
   forced labour is mentioned only by Tadeusz, in one sentence, in his own
   words (»Ich habe fünf Jahre gelernt, nichts zu sehen.«). Nobody else
   explains it or uses it.
3. **Prejudice is shown, never shared.** The scapegoating of DPs appears as
   reported speech (»die Polizei hat ›die Polen‹ befragt«) and is refuted by
   the story. No character uses a slur, not even the villains. Kröger says
   »der Wächter«, not »der Pole«.
4. **Denazification is seen critically.** It is not a joke and not an
   excuse. Kröger's SA past is stated, not excused (»nur wegen der
   Arbeit« is his excuse, not the narrator's). Asmussen is »entlastet«, and
   the story shows what that word is worth.
5. **Violence happens off screen and is told plainly.** Jakob's fall is told
   by Jakob and Kröger in one or two sentences. No blood, no injury detail
   beyond »das Bein war ab«, »mit zwei Latten geschient«.
6. **Children stay out of the plot.** Lotte is asleep; she is never asked,
   searched, endangered or used as leverage.
7. **Poverty is not a joke.** Hunger lines are said by the people who live
   it, without a punchline (»Wer schläft, hat keinen Hunger.«).
8. **War captivity is background only.** Jakob counts »seit Russland«; that
   is all.
9. **No real persons.** All characters are fictional. Military police,
   Kripo and Kommissar Petersen are generic.

When a line could be read as making light of any of the above, cut it.

## Length limits for phones

The pack declares `pacing: narrative` (about 60% of the play time is
reading), so the narrative text budgets of the spec apply. They are upper
limits for scenes, not targets for every text.

| Text | Hard limit | Guidance in this pack |
|---|---|---|
| Room description, first visit | 1000 | the arrival of the scene, 2–3 paragraphs |
| Room description, return visit | 1000 | one or two full sentences that still name every object |
| Object description | 600 | what is odd or useful about it; documents in full |
| Dialogue node `say` | 600 | turning points as a scene: line, reaction, line |
| Option text | 80 | ≤ 60 |
| Rule message (`say`) | – | a reaction 1–3 sentences; a solving response may be a short scene |
| Clue description | 600 | the fact, its source, the open question |
| Names | 24 | ≤ 20; no article |
| Hint step | – | one sentence, ≤ 120 |
| Ending variant | – | ≤ 1600, three to five paragraphs |

More rules for small screens:

- Name every interactable object in its room text as `{id}`, or with an
  inflected form: `{schuten|Schuten}`, `{kaffeesaecke|Säcke mit Rohkaffee}`.
  Add inflected forms to `synonyms`.
- Options are the player's words, in »…«. Narration belongs in `say`.
- Option texts start with the content word, so they can be scanned on a
  narrow button: »Sein Zählheft sagt: …«, not »Ich möchte Ihnen sagen, dass …«.
- Paragraphs are separated by a blank line. A single newline is used only
  inside documents and the list in `clue_kroeger_version`.
- No Markdown, no HTML, no emoji in game text.
