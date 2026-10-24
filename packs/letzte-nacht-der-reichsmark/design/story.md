# Story

The narrative backbone of *Die letzte Nacht der Reichsmark*, written after
the first playtest review found the pack's story hard to follow: the
mechanics were sound, but the truth, the motives and the transitions lived
in these design documents and reached the player only as fragments. This
document is binding for every player-facing text, like
[style.md](style.md). Ids are the pack's ids.

## 1. The truth

In causal order; the full version with dates is
[concept.md, section 2](concept.md#2-the-truth-solution).

1. Thursday night, 17 June 1948: Kröger's gang unloads 200 crates of NAAFI
   cigarettes, lot 4471, from the »Elspeth Gray«. On Asmussen's order Kröger
   lowers 20 crates into Asmussen's barge »Elise 7« and, standing in for the
   tally clerk, writes 180 on the tally sheet. Asmussen hoards for Monday,
   when goods will sell for D-Mark.
2. Jakob counts 200, as he counts everything since his captivity. At half past
   one he leaves his notebook with Tadeusz (»Wenn ich bis morgen nicht zurück
   bin, gib es Anni«) and follows the barge to Speicher K.
3. Kröger catches him at the hatch on the fourth floor; Jakob falls down the
   hatch stairs and breaks his leg. Kröger wants a doctor. Asmussen arrives and
   forbids it: »Kein Arzt. Ärzte reden.« Jakob is to stay upstairs until the
   goods are gone on Monday. Nobody believes a thief.
4. Friday dawn: Kröger plants two cartons in Jakob's locker 23 with the
   foreman's spare key (Jakob's own key has hung at home since Thursday noon)
   and opens the locker for the police at seven. At six he has sold five
   cartons to Lene: »Der Rest gehört dem Kaffeemann aus der Speicherstadt.«
5. Friday evening, out of guilt, Kröger brings Anni 200 Reichsmark in an
   envelope stamped »A. & Co. · Speicher K«, »von der Kolonne«. Every
   evening since he has borrowed Tadeusz's boat to take water to Jakob;
   Tadeusz looks away, because a displaced person who sees too much is the
   first suspect.
6. Saturday: Anni hires Voss with exactly that money. If it is hush money,
   it should at least speak for Jakob.

**Why each one acts.** Asmussen: money, and the certainty that men like him
are always washed clean (he wrote Kröger's Persilschein). Kröger: fear of
losing that Persilschein, then guilt. Tadeusz: fear, learned over five years
of forced labour, and loyalty that fights it. Lene: business, and three huts'
distance from the Brodersens. Anni: pride, and three ration cards for Sunday.
Voss: a bill for the rent, a past as Asmussen's insurer who never asked where
cargo came from, and a client who pays in money that dies tonight.

## 2. Through-line

- **Goal:** find Jakob, and prove he is no thief, before the money changes and
  the goods disappear on Monday.
- **Voss at the start:** a missing-person case for an accused thief, paid in
  Reichsmark. Voss expects to find a man who ran.
- **Voss at the end:** Jakob was made a thief so he could be kept; the brute
  wanted a doctor and the gentleman said no; and Voss's own old signature on
  Asmussen's cargo policies is part of the same habit of not asking.
- **The open question that pulls the player on:** first »Wo ist Jakob?«, then
  »Wer hat ihm das angehängt?«, then »Wer gibt Kröger die Befehle?«.

## 3. Scene plan

Act II's strands can be played in any order; the order below is the
walkthrough's.

| # | Scene | Arrival | Turn | Way out |
|---|---|---|---|---|
| 1 | **Detektei** (`detektei`, `anni_auftrag`) | Rain in a half-bombed office; a woman holds her handbag as if it could be taken. Voss's own past (insurer until 1943) is set up. | Anni tells the accusation and the key; her fee is 200 Reichsmark that die tomorrow. Voss lays out the three leads. | The locker, the friend at the Zollkanal, the foreman. Down to the Baumwall. |
| 2 | **Baumwall** (`baumwall`) | The city's crossroads under the viaduct; the poster about the new money. | The deadline becomes concrete: Sunday the money, Monday the shop windows. | Three directions and the tram. |
| 3 | **Kaischuppen 17** (`kaischuppen`, P1, D2, D3, D4) | »DIEB« chalked on locker 23. The lading list on the gate. | The locker's own door says a second key exists; the pack the police missed carries a lot number; the notebook turns two facts into a proof: the goods came ashore when only Kröger could reach the locker. | Jakob is innocent, so someone made him a thief. Who saw him last? Tadeusz. |
| 4 | **Kneipe, first talk** (`kroeger_verhoer`) | A basement bar; a foreman who does not drink his Köm; a gang that does not look. | Kröger states his four claims unasked: a man who prepared his story. | He becomes the suspect. On the way out, Asmussen. |
| 5 | **Asmussen's warning** (`asmussen_warnung`) | A camel-hair coat in the rain, the only dry hat in Hamburg. He knows Voss from before the war. | He denies Brodersen and Speicher K before anyone asked about Speicher K, and offers 500 Reichsmark to go home. | Voss now knows who is afraid. |
| 6 | **Zollkanal** (`tadeusz_gespraech`) | Black water, the customs gate, a watchman with a thermos for two. | Proof of innocence opens him: Jakob's counting notebook, the barge, the register. And why he kept silent. | The tally sheet: fishing it out with the boat hook. |
| 7 | **Tallyzettel** (P2, D1) | The glass cabin, the clipboard out of reach. | 180 in Kröger's hand against 200 on the list. Twenty crates are missing, and the counter was Kröger. | Who profits? St. Pauli. |
| 8 | **Hinterhof** (P4, `lene_gespraech`, D5) | Paying with dead money; the back door opens on a market under a tarpaulin. | Lene recognises the lot; Kröger sold it to her and visited the Brodersens with an envelope. | Anni has not told everything. |
| 9 | **Nissenhütte** (P6, `anni_huette`) | A tin half-barrel in the mud, a child asleep, a stove in June. | The envelope with Asmussen's stamp: the fee was hush money, and Anni used it to buy the truth. | Back to Kröger with everything. |
| 10 | **Das Verhör** (P7, confession) | Kröger expects Voss now. | Four claims fall one by one; the confession is a scene: the fall, the doctor he wanted, the water he brings every night. He gives the key and Asmussen's Persilschein. | Across the water. |
| 11 | **Die Überfahrt** (`t_rudern`, `speicher_wasserseite`) | Tadeusz admits his own guilt and rows across the customs border. | The empty »Elise 7« smelling of coffee. | Up the stairs. |
| 12 | **Treppenhaus, Vierter Boden** (P8, `jakob_gespraech`, D6) | Darkness, a lantern, a door with the only new lock in the building. | Jakob alive; the man in the camel-hair coat forbade the doctor; the note in green ink matches the Persilschein. | Down to the light under the office door. |
| 13 | **Die Abrechnung** (`asmussen_finale`) | Mahogany and real coffee; as if the war had never happened. | Three lies, three proofs; the bribe and the jab at Voss's past; the refusal. | The choice: the British or the Kripo. |
| 14 | **Ending** | Dawn. | Who pays what. | The queue at the ration-card office; the full shop windows on Monday. |

## 4. Revelation map

| Fact | Scene | Source |
|---|---|---|
| Jakob is accused, locker 23, Kröger opened it for the police | 1 | Anni (`an_jakob`), `clue_auftrag` |
| Jakob's key hung at home since Thursday noon | 1 | Anni (`an_schluessel`) |
| Voss insured Asmussen's cargo before the war | 1, 5, 13 | intro, Asmussen (`a_w_start`, `f_angebot`) |
| A second key is with the foreman | 3 | locker door (`open_spind`) |
| Lot 4471 = »Elspeth Gray«, Thursday night | 3 | lading list, deduction D2 |
| Only Kröger could reach the locker when the goods arrived | 3 | deduction D3, D4 |
| Kröger's four claims | 4 | Kröger (`k_hub`) |
| Asmussen fears questions about Speicher K | 5 | Asmussen (`a_w_geld`), Voss's thought |
| Jakob followed the »Elise 7« at 01:30; it belongs to A. & Co., Speicher K | 6 | notebook and register (`t_heft`, `t_elise`) |
| Why Tadeusz kept silent | 6, 11 | Tadeusz (`t_dp`, `t_rudern`) |
| Kröger counted 180 himself | 7 | tally sheet |
| Kröger sold lot 4471 for the »Kaffeemann«; visited Anni with an envelope | 8 | Lene |
| The fee is Asmussen's hush money | 9 | Anni (`ah_kuvert`, `ah_warum`) |
| The fall, the doctor Kröger wanted, the water every evening | 10 | confession |
| Asmussen wrote Kröger's Persilschein | 10 | `k_wo` |
| Asmussen forbade the doctor | 12 | Jakob (`j_was`) |
| Asmussen wrote the order to keep Jakob upstairs | 12 | note + D6 |
| What happens to everyone | 14 | endings |

## 5. Key scenes

The prose is in the pack files, where it is read: the intro and endings in
`pack.yaml`, the arrivals in `rooms.yaml`, the turning points in
`dialogues.yaml` and the solving responses and deductions in `rules.yaml`.

## 6. Voice

Voss reasons like the claims adjuster Voss used to be: times, access, who
signed. The narrator stays dry and lets details carry the feeling. Sample:

> Du gehst die Zeiten noch einmal durch, wie früher bei einem Schaden, der zu
> glatt aussah. Donnerstagmittag hängt Jakobs Schlüssel zu Hause am Haken.
> Donnerstagnacht kommt die Ware an Land. Freitag früh liegt sie in seinem
> Spind. Dazwischen gibt es nur einen Schlüssel, und den hat der Vorarbeiter.

> Kröger sieht lange in sein Glas, als stünde darin, was er sagen soll. Dann
> schiebt er es weg, und du merkst, dass er die ganze Zeit nur darauf gewartet
> hat, dass jemand fragt.
