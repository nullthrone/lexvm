# Die letzte Nacht der Reichsmark: concept

Final design for the first German content pack. It is binding for the
implementation: ids used here, in [cast.md](cast.md), [world.md](world.md)
and [puzzles.md](puzzles.md) are the ids of the pack. German prose rules are
in [style.md](style.md).

| Field | Value |
|---|---|
| Pack id | `letzte-nacht-der-reichsmark` |
| `title` | Die letzte Nacht der Reichsmark |
| `subtitle` | Ein Hamburger Kriminalfall, Juni 1948 |
| `language` | `de` |
| `policy` | `forgiving` |
| `playtime` | 45 (raised from 40 after playtests; estimate 47) |
| `maxScore` | 25 |
| `license` | Recommended `CC0-1.0`, like the demo pack, so the pack can also serve as a reference example for the prompt kit. Final call: product owner. |
| `start.room` | `detektei` |

## 1. Logline, tone, intro

**`description` (library text, two sentences):**

> Hamburg, 19. Juni 1948: Morgen wird die Reichsmark zu Altpapier, und der Schauermann Jakob Brodersen ist verschwunden – angeblich mit gestohlenen Zigaretten. Ein Noir-Krimi aus Indizien und Verhören über Schwarzmarkt, Persilscheine und Schuld.

**Tone.** Rain-soaked noir that stays humane. It is dry, precise and
melancholy, with a little gallows humour. Nobody dies and there is no
violence on screen. Everyone is compromised a little; one man is compromised
in a way that no new money can buy back. The world's clock is the currency
reform: overnight the old money dies, while hoarded goods wait for the new
money. The game has no real-time clock.

The jokes are about money and about the powerful, never about hunger, the
war or its victims. The running gag is the bundle of Reichsmark in your
pocket that nobody wants any more, except one man who has debts.

**`start.intro`:**

> Hamburg, Sonnabend, 19. Juni 1948. Es regnet seit Tagen. Seit gestern Abend weiß es die ganze Stadt aus dem Radio: Am Sonntag gibt es neues Geld. Vierzig Mark pro Kopf. Was du in Reichsmark besitzt, ist ab morgen kaum noch das Papier wert.
>
> Auf deinem Besucherstuhl sitzt eine Frau in einem umgefärbten Wehrmachtsmantel und hält ihre Handtasche fest, als könnte jemand sie ihr wegnehmen.

## 2. The truth (solution)

All people, firms and ships are fictional.

1. **Thursday 17 June, night shift, Kaischuppen 17.** Foreman Willi Kröger's
   gang unloads the British freighter »Elspeth Gray«: 200 crates of NAAFI
   cigarettes, lot 4471 (NAAFI supplied the British forces).
2. **The diversion.** Coffee importer Konrad Asmussen has given Kröger an
   order. Kröger has 20 crates lowered into Asmussen's barge »Elise 7«. He is
   standing in for the "sick" tally clerk, so he writes **180** on the tally
   sheet. Asmussen is hoarding: on Monday, goods will sell for D-Mark.
3. **Jakob notices.** Jakob Brodersen has counted every sling since he was a
   prisoner of war, and he counts **200**. At 01:30 he gives his counting
   notebook to his friend Tadeusz Wrona, the barge watchman: »Wenn ich bis
   morgen nicht zurück bin, gib es Anni.« Then he follows the barge along the
   Zollkanal to Asmussen's half-burnt Speicher K.
4. **The fall.** Kröger catches him at the hatch on the fourth floor. Jakob
   falls down the hatch stairs and breaks his leg.
5. **Asmussen's decision.** Asmussen has come to check the delivery. Kröger
   wants to fetch a doctor. Asmussen forbids it: »Kein Arzt. Ärzte reden.«
   Jakob is kept on the fourth floor (*Vierter Boden*) »bis Montag«. By then
   the goods are gone, and nobody believes a thief.
6. **The frame-up.** At 5 a.m. the 180 crates leave for the NAAFI depot under
   guard, and the depot finds 20 missing against the manifest. At dawn Kröger
   uses the foreman's spare key to put two cartons from the diverted crates
   into Jakob's locker 23. Jakob's own key has been hanging at home since
   Thursday noon. At 7 a.m. Kröger opens the locker for the police:
   »Brodersen hat geklaut und ist abgehauen.«
7. **The skimming.** At 6 a.m. on Friday Kröger sells five cartons of lot 4471
   to the black marketeer Lene Harms: »Der Rest gehört dem Kaffeemann aus der
   Speicherstadt.«
8. **The hush money.** On Friday evening, out of guilt, Kröger brings Anni 200
   Reichsmark of Asmussen's money, »von der Kolonne«. The envelope is
   stamped »A. & Co. · Speicher K«. Every evening since, he has borrowed
   Tadeusz's boat to take water to Jakob. Tadeusz looks the other way.
9. **Anni's answer.** On Saturday Anni hires Voss and pays with exactly those
   200 Reichsmark. If it is hush money, it should at least speak for Jakob.
   She keeps 120 Reichsmark of her own for Sunday: 40 each for herself,
   Lotte and Jakob, to collect the new *Kopfgeld*.
10. **Game night (Saturday).** Jakob is alive and feverish on the fourth floor.
    The goods leave on Monday at 6 a.m.
11. **Guilt.**
    - **Asmussen** is the instigator. He is guilty of diverting occupation
      goods, hoarding, holding Jakob prisoner and refusing him a doctor.
    - **Kröger** carried it out. He caused the fall, planted the evidence and
      skimmed the goods. He is also the one who wanted the doctor.
    - **Tadeusz** kept silent out of fear.
    - **Lene** bought the goods.
    - **Anni** took the money.
    - **Voss** once insured Asmussen's cargo without asking questions.

The moral turn: the brute wanted a doctor; the gentleman said no. And the
Persilschein, the document the country used to wash itself clean, becomes
the handwriting sample that convicts its author.

## 3. Act structure

| Act | Place | Content | Bottleneck |
|---|---|---|---|
| I – Der Auftrag | `detektei` | Tutorial dialogue with Anni: the case, the locker key, the Reichsmark fee. About 3 minutes. | Taking the case (`auftrag_angenommen`) opens the city. |
| II – Drei Spuren | `baumwall` hub, `kaischuppen`, `zollkanal`, `kneipe`, `hinterhof`, `nissenhuette` | The locker opens the case. Three strands run in parallel: **A** the paper trail (boat hook, tally sheet), **B** the frame-up (notebook deductions, Tadeusz), **C** St. Pauli (the Reichsmark, Lene, Anni's tin). Talking to Kröger for the first time records his four claims and triggers Asmussen's warning at the Baumwall. | Kröger's confession (`clue_gestaendnis`): every claim is refuted by one strand. |
| III – Über das Wasser | `zollkanal` → `speicher_wasserseite`, `speicher_treppe`, `vierter_boden` | Tadeusz rows you across the customs border. You light the lantern, open the attic door, find Jakob and Asmussen's written order, and make the handwriting deduction. | Jakob's testimony (`clue_jakob_aussage`) and the handwriting deduction (`clue_dieselbe_hand`) open the office stairs. |
| IV – Die Abrechnung | `kontor` | Evidence duel with Asmussen in three rungs, his bribe, your refusal, the final choice. | Ending. |

Typical session: Act I about 3 minutes, Act II about 25 minutes, Act III
about 7 minutes, Act IV about 5 minutes.

## 4. Endings

Both endings are `win: true`. Each has two text variants on the flag
`kroeger_zeuge`, which is set in the confession if you offer Kröger a deal
(»Sagen Sie gegen Asmussen aus …«).

| Ending id | Title | Chosen with | Content |
|---|---|---|---|
| `ende_erster_morgen` | Der erste Morgen | `f_englaender` »Den Engländern. Es ist ihre Ware.« | British military police seize lot 4471. Asmussen goes before a British court, where none of his Persilscheine count. |
| `ende_hamburger_regen` | Hamburger Regen | `f_kripo` »Der Kripo. Es ist unsere Stadt.« | The bittersweet ending. Kommissar Petersen, who watched Kröger open Jakob's locker on Friday, has to take the case. Asmussen's lawyer is already on the way, with three new Persilscheine. |

**Kröger variant.**

- `kroeger_zeuge` set: Kröger testifies and gets two years.
- Not set: Kröger is gone by morning, and every month an envelope with no
  sender arrives at hut 14.

**Shared closing paragraph** (repeated in every variant):

> Sonntagmorgen. Anni und Lotte stehen in der Schlange vor der Kartenstelle. Anni legt drei Lebensmittelkarten auf den Tisch und hundertzwanzig Reichsmark: vierzig für jeden Kopf. Am Montag sind die Schaufenster voll, als hätte jemand sie über Nacht gefüllt. Hat ja auch jemand.

Full ending drafts are in [puzzles.md](puzzles.md#endings).

## 5. Play time

- **Estimated play time:** 35–50 minutes (`playtime: 40`; `lexvm check`
  estimates about 47, a speedrun about 24). The game is heavy on reading and
  dialogue.
- **Critical path:** 74 canonical commands (see the walkthrough in
  [puzzles.md](puzzles.md#walkthrough)). Typical sessions take 2–2.5 times
  as many taps, for looking around, wrong attempts and re-reading the
  notebook.
- **Score:** 25 points. Each solved puzzle is worth 1. Each major deduction
  (D4, D6) and the confession are worth 2. The ending is worth 4.

## 6. What makes it memorable

- **The one night money dies.** Every Reichsmark in the story turns to paper
  by morning: Anni's fee, Kröger's hush money, Asmussen's 500-mark bribe.
  The bundle in your pocket is worthless to everyone except a landlord with
  debts. And it *is* the hush money, used by Anni to buy the truth.
- **The crime behind a real piece of history.** The player uncovers the hidden
  reason for something that really happened: the shop windows that were
  suddenly full on Monday, 21 June 1948.
- **Fair-play logic you can feel.** The frame-up proof is two half-arguments.
  Kröger rebuts each half on its own (»Vorher hatte er doch einen
  Schlüssel«), so every wrong answer teaches why you need both.
- **Interrogation as a checklist.** Kröger's four claims go into the notebook
  on your first meeting. Each strand of the investigation refutes one of
  them.
- **A moral, not mechanical, twist.** The drunk foreman wanted a doctor; the
  courteous merchant refused one. The Persilschein convicts the man who
  wrote it.
- **People, not types.** Tadeusz, a former forced labourer waiting for papers
  to Canada and searching for his sister, is the story's quiet conscience
  and the one who rows you across. Anni counts out forty marks for a husband
  nobody else believes will come home.
- **The ending is a queue in the rain, not a gunfight.** The last line pays
  off the opening: the full shop windows.

## 7. Historical frame

**Used.** All of these are verified period facts, phrased without law
numbers.

- The currency reform was announced by radio on Friday 18 June 1948.
- On Sunday 20 June everyone collected 40 DM *Kopfgeld* for 40 RM at the
  ration-card office.
- Old debts shrank to a tenth, and many people paid what they owed in
  Reichsmark before the deadline.
- On Monday 21 June the shop windows were suddenly full (*Schaufenstereffekt*).
- Rationing was still in force, and cigarettes worked as a currency.
- NAAFI goods for the British forces; the free port and its customs border on
  the Zollkanal; the Speicherstadt half burnt in July 1943.
- Nissen huts, Hochbahn viaduct at the Baumwall, trams.
- Displaced persons waiting for emigration (Canadian labour schemes for
  forestry workers).
- Persilscheine and denazification; British military government and courts.

**Kept vague.** Law numbers, court jurisdiction, exact tides, real firms,
ships, sheds and police officers. Shed 17, Speicher K and every person are
fictional.

**Left out.** Persecution, camps and atrocities are not puzzle material
and not decoration. They appear only as a person's own past, in that
person's own words (Tadeusz). The "Aryanised firm" line from the first
proposal is cut. Asmussen instead needles Voss with Voss's own past as his
insurer. See [style.md](style.md#sensitive-topics).

## 8. Design provenance

This design was chosen from three independent proposals (an internal design
review).

- **Base:** the fair-play mystery proposal, for its plot, its frame-up logic,
  the interrogation with rebuttals, the moral inversion and the
  currency-reform theme.
- **From the character-noir proposal:**
  - Tadeusz's depth: his sister Halina, his papers for Canada, and his own
    small guilt, since he looks away while Kröger borrows his boat.
  - The refrain »Geld kann man umtauschen. Schuld nicht.«, now Voss's
    refusal line in the climax.
  - The stateless evidence ladder for the finale.
  - The sensitivity rules.
- **From the puzzle-craft proposal:**
  - The worthless-Reichsmark running gag with one payoff (the landlord's
    brewery debt).
  - The catch-all `drop` refusal.
  - Text-only wrong attempts.
  - No optional `learn`s.
- **Own changes:**
  - The fee is the hush money.
  - Clues are merged from 24 to 21.
  - Items are cut to 7.
  - Kröger's claims are recorded as a notebook checklist.
  - Lockstep flags are replaced by clue conditions.
