# Cast and dialogue plans

The player character and the characters of *Die letzte Nacht der Reichsmark*.
Every id here matches [world.md](world.md) and [puzzles.md](puzzles.md).
German texts are drafts within the phone budgets: node `say` ≤ 300
characters, option text ≤ 80 characters. Voice rules are in
[style.md](style.md).

Conventions in the dialogue tables:

- **when** is the option's condition.
- **do** lists its effects.
- **→** gives the `goto` node.
- **end** means the option has no `goto`, so the dialogue ends.
- A node without available options ends the dialogue.
- No option uses `once`. Options that must disappear are gated with
  `not: { has: … }` on the clue they teach, so the clue is the only state.
- Option ids are unique across the whole pack, so command echoes and
  walkthrough diagnostics are unambiguous.

## Player character: Voss

- **Who you are:** private investigator, addressed in the second person
  (»du«). Before the war you settled claims for a Hamburg marine insurer
  until its building burned in July 1943. You read cargo lists in your sleep
  and know that NAAFI lot numbers are issued per shipment. You signed off
  Asmussen's cargo policies without asking questions, and Asmussen reminds
  you of it in the finale.
- **Ungendered.** Characters say »Voss«, »Sie« or »du«. No gendered noun or
  form ever refers to the player (see [style.md](style.md#the-player-character)).
- **Starting inventory:** `streichhoelzer`. The intro dialogue adds
  `spindschluessel` and `reichsmark`.

## Main characters

### Anni Brodersen (`anni`)

| Field | Content |
|---|---|
| Role | Jakob's wife and your client. Seamstress, bombed out in '43; lives in Nissenhütte 14 with Lotte (11). |
| Location | `detektei` at the start; the intro dialogue moves her to `nissenhuette`. |
| Knows | Jakob's habits; that he forgot his locker key on Thursday; the police accusation; his friend Tadeusz at the Zollkanal. |
| Hides | Kröger's 200 RM in the stamped envelope. She paid you with exactly that money and is afraid it makes Jakob look like a paid accomplice. |
| How to make her talk | Act I: just talk; the intro is a linear dialogue. Act II: confront her with Lene's statement (`clue_lene`): »Kröger war Freitagabend hier. Mit einem Kuvert.« The game never searches her things by force. |
| Voice | Short, proud, tired Hamburg sentences. Talks about ration cards so she does not have to talk about feelings. Says »Sie« and »Voss«. |

Sample lines:

1. »Jakob klaut nicht. Jakob zählt. Seit Russland zählt er jeden Löffel Suppe – und jede Hieve.«
2. »Zweihundert Reichsmark. Ab morgen ist es Papier, also nehmen Sie es heute.«
3. »Wenn es schon Schweigegeld ist, soll es wenigstens für Jakob reden.«

### Willi Kröger (`kroeger`)

| Field | Content |
|---|---|
| Role | Foreman of the stevedore gang. In the SA »nur wegen der Arbeit«; kept his job in the harbour thanks to Asmussen's Persilschein. |
| Location | `kneipe`, at the corner table, all game. |
| Knows | Everything about Thursday night. |
| Hides | Everything about Thursday night, behind four claims, which he states the first time you talk to him (`clue_kroeger_version`). |
| How to make him talk | The four-stage interrogation (P7). Each stage is refuted by exactly one piece of evidence; every other piece gets a rebuttal that teaches something. Progress is kept in the counter `kroeger_stufe`, so you can leave and come back with new evidence. |
| Voice | Gruff harbour Missingsch, short sentences: »Se«, »nix«, »is«, »'n«. At most one dialect marker per sentence. Drinks Köm and doesn't touch it. |

Sample lines:

1. »Was fehlt, is Schwund. Im Hafen schwindet immer was. Kisten, Kaffee – Leute.«
2. »Ohne den Wisch bin ich wieder der Kröger von dreiunddreißig.«
3. »Seitdem bring ich ihm jeden Abend Wasser. Jeden Abend.«

### Lene Harms (`lene`)

| Field | Content |
|---|---|
| Role | Black marketeer and former tram conductor. Trades in the backyard behind the »Letzter Groschen«. Lives three huts from the Brodersens. |
| Location | `hinterhof` |
| Knows | Kröger sold her five cartons of lot 4471 at 6 a.m. on Friday: »Der Rest gehört dem Kaffeemann aus der Speicherstadt.« On Friday evening she saw Kröger go into the Brodersens' hut with an envelope. |
| Hides | That she bought from him. |
| How to make her talk | Show her the cigarette pack from Jakob's locker (`show zigarettenpaeckchen lene`), or ask about lot 4471 in conversation while you carry it. Before that she denies everything: »Zigaretten? Ich rauch nicht mal.« |
| Voice | Quick, sardonic street Hamburg. Says »du« to everyone. Has the best one-liners about money. |

Sample lines:

1. »Feuersteine, Nähnadeln, gute Ratschläge. Die Ratschläge kosten extra.«
2. »Wart's ab: Am Montag sind die Schaufenster voll. Und keiner fragt, wo das Zeug bis Sonntag war.«
3. »Ich wohn drei Hütten weiter. Ich seh so was.«

### Tadeusz Wrona (`tadeusz`)

| Field | Content |
|---|---|
| Role | Barge watchman (*Schutenwächter*) at the Zollkanal. Harbour worker from Gdynia, brought to Hamburg as a forced labourer in 1940, a DP since 1945. Waiting for papers to Canada as a forestry worker and searching for his sister Halina. He and Jakob have shared a thermos of Muckefuck every night for a year. |
| Location | `zollkanal` |
| Knows | Jakob gave him the counting notebook at 01:30 and followed the barge »Elise 7«. The barge register says »A. & Co., Speicher K«. Kröger borrows his boat every evening. |
| Hides | The notebook. On Friday the police questioned »die Polen«; getting involved in a theft could cost him his emigration. He is ashamed, also of having looked away when Kröger took the boat. |
| How to make him talk | Prove that Jakob is not a thief (`clue_untergeschoben`). Later, after the confession, tell him Jakob is alive; he rows you over. |
| Voice | Precise, formal standard German with dry irony. No accent spelling, no broken grammar. Says »Sie« and »Voss«, never »Herr Voss«: the player stays ungendered, so his formality shows in grammar and sentence structure. |

Sample lines:

1. »Ich habe fünf Jahre gelernt, nichts zu sehen. Das verlernt man nicht an einem Donnerstag.«
2. »Für Ihre Polizei bin ich ein DP, ein Mensch am falschen Ort. Und wer am falschen Ort ist, hat immer etwas gestohlen.«
3. »Sie suchen einen Mann, ich suche eine Schwester. Wir haben beide nur Papier in der Hand.«

### Konrad Asmussen (`asmussen`)

| Field | Content |
|---|---|
| Role | Coffee importer, »Asmussen & Co.«, with his office (*Kontor*) on the ground floor of Speicher K. A party member since 1933, cleared thanks to three Persilscheine, and he writes them for others. Never touches anyone himself. |
| Location | `nowhere` at the start. The ambush rule moves him to `baumwall`. The end of that dialogue moves him to `kontor`. |
| Knows | Everything. |
| Hides | Everything. |
| How to make him talk | You don't; you prove. First a forced warning scene at the Baumwall after your first talk with Kröger. Then the evidence duel in his office (finale): three rungs, one valid proof each. |
| Voice | Smooth Hanseatic courtesy, ice-cold underneath. Never raises his voice. Says »Voss« without a title, which is condescending. |

Sample lines:

1. »Ich bin Kaufmann, Voss. Ich verkaufe Dinge, wenn sie etwas wert sind. Ab Montag ist wieder alles etwas wert.«
2. »Persilschein. Ein hässliches Wort. Ich nenne es: für einen Mitarbeiter gebürgt.«
3. »Ich wechsle seit Wochen in die andere Richtung, Voss.«

## Minor characters

### Jakob Brodersen (`jakob`)

The missing man. He appears in one scene on `vierter_boden`: feverish, his
leg splinted with two laths.

- **Role in the game:** his testimony (`clue_jakob_aussage`) opens the office
  stairs and wins the last rung of the finale.
- **Voice:** plain, counting.
- **Sample lines:**
  1. »Zweihundert. Ich hab zweihundert gezählt. Ich zähl immer.«
  2. »Kröger wollte 'n Arzt holen. Der Mantel hat gesagt: ›Kein Arzt. Ärzte reden.‹«
  3. »Grüßen Sie Anni. Sagen Sie ihr, ich hab richtig gezählt.«

### Wirt (`wirt`)

The landlord of the »Letzter Groschen«. He has no dialogue; command rules
answer `talk`, `give` and `show`.

- **Role in the game:** he guards the back door to the backyard (`hintertuer`)
  and is the only person in Hamburg who still wants Reichsmark: he owes the
  brewery and can pay in old money until Sunday.
- **Voice:** Missingsch, laconic.
- **Sample lines:**
  1. »Dünnbier oder Dünnbier?«
  2. »Da hinten nur Kundschaft, die zahlt. Heut nehm ich sogar noch Reichsmark.«
  3. »Ab Montag nur noch gegen D-Mark.«

### Lotte (`lotte`)

Anni's daughter, 11. She is scenery, not a character: she is asleep in the
hut. `talk lotte` → »Du lässt sie schlafen.« Children are never involved in
the plot.

## Dialogue plans

Eight dialogues. Command rules start three of them: `anni_auftrag`, the
ambush `asmussen_warnung`, and the redirect rules for `show`. The rest are
the NPCs' default `dialogue`.

| Dialogue | `with` | Started by | Object's default `dialogue`? |
|---|---|---|---|
| `anni_auftrag` | `anni` | rule `talk_anni_auftrag` (`talk anni` while `not: { flag: auftrag_angenommen }`) | no |
| `anni_huette` | `anni` | default `talk anni` | yes |
| `kroeger_verhoer` | `kroeger` | default `talk kroeger` | yes |
| `lene_gespraech` | `lene` | default `talk lene` | yes |
| `tadeusz_gespraech` | `tadeusz` | default `talk tadeusz`; rule `show_untergeschoben_tadeusz` | yes |
| `asmussen_warnung` | `asmussen` | enter rule `asmussen_hinterhalt` | no |
| `asmussen_finale` | `asmussen` | default `talk asmussen` | yes |
| `jakob_gespraech` | `jakob` | default `talk jakob` | yes |

### `anni_auftrag`: the intro (linear, cannot be left half-way)

```
an_start → an_jakob → an_polizei → an_schluessel → an_bezahlung → (end)
```

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `an_start` | »Mein Mann ist weg. Jakob Brodersen, Schauermann. Seit Donnerstagnacht.« Sie sagt es wie eine Adresse, die sie zu oft aufschreiben musste. | – | `an_frag_jakob` »Erzählen Sie mir von ihm.« → `an_jakob` |
| `an_jakob` | »Er ist in Krögers Kolonne, Kaischuppen 17. Jakob klaut nicht. Jakob zählt. Seit Russland zählt er jeden Löffel Suppe – und jede Hieve. Alles in ein Heft.« | – | `an_frag_polizei` »Und die Polizei?« → `an_polizei` |
| `an_polizei` | »Freitag früh haben sie seinen Spind aufgemacht, Nummer 23. Kröger hat aufgeschlossen. Zwei Stangen englische Zigaretten. Jetzt ist Jakob ein Dieb, der abgehauen ist.« | – | `an_frag_schluessel` »Wer hat einen Schlüssel zu dem Spind?« → `an_schluessel` |
| `an_schluessel` | Sie legt einen kleinen Schlüssel auf den Schreibtisch. »Jakob. Und der hängt seit Donnerstagmittag bei uns am Haken. Er hatte ihn vergessen.« | `learn: clue_schluessel`; `move: spindschluessel → inventory` | `an_annehmen` »Ich übernehme den Fall.« → `an_bezahlung` |
| `an_bezahlung` | Sie schiebt dir ein Bündel Scheine hin. »Zweihundert Reichsmark. Ab morgen ist es Papier, also nehmen Sie es heute. Den Rest brauch ich Sonntag an der Kartenstelle: vierzig für mich, vierzig für Lotte, vierzig für Jakob.« | `move: reichsmark → inventory`; `learn: clue_auftrag` (after the farewell line: the entry names Tadeusz); `set: auftrag_angenommen`; `move: anni → nissenhuette` | `an_abschied` »Ich finde ihn, Frau Brodersen.« do: `say` »Fragen Sie Tadeusz am Zollkanal. Jakobs Freund. Ich bin in der Siedlung, Hütte 14.« Dann ist sie fort. Auf dem Besucherstuhl bleibt ein nasser Fleck. → end |

Yields: `clue_auftrag`, `clue_schluessel`, `spindschluessel`, `reichsmark`,
`auftrag_angenommen`.

### `anni_huette`: the tin (P6)

```
ah_hub ─┬─ ah_kuvert* → ah_kuvert ── ah_warum → ah_warum ── ah_gehen → end
        ├─ ah_lotte → ah_lotte ── ah_zurueck → ah_hub
        └─ ah_tschuess → end
```

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `ah_hub` | Variant `has: clue_schweigegeld`: »Haben Sie ihn gefunden, Voss?« · Else: Anni flickt eine Hose, die keinem mehr passt. »Und? Haben Sie was?« | – | `ah_kuvert` »Kröger war Freitagabend hier. Mit einem Kuvert.« when `has: clue_lene`, `not: { has: clue_schweigegeld }` → `ah_kuvert` · `ah_lotte` »Wie geht es Lotte?« → `ah_lotte` · `ah_tschuess` »Ich melde mich.« → end |
| `ah_kuvert` | Lange sagt sie nichts. Dann holt sie die Blechdose vom Bord. Darin ein leeres Kuvert mit Stempel: ›A. & Co. · Speicher K‹. »Zweihundert Reichsmark. ›Von der Kolonne‹, hat er gesagt.« | `score: 1` | `ah_warum` »Und wo ist das Geld jetzt?« → `ah_warum` |
| `ah_warum` | Variant `has: reichsmark`: »In Ihrer Tasche, Voss. Ich hab Sie davon bezahlt. Wenn es schon Schweigegeld ist, soll es wenigstens für Jakob reden.« · Else: »Ich hab Sie davon bezahlt, Voss. Wo es jetzt ist, will ich nicht wissen. Wenn es schon Schweigegeld ist, soll es wenigstens für Jakob reden.« | `learn: clue_schweigegeld` (the entry says she paid Voss with it) | `ah_gehen` »Das wird es.« → end |
| `ah_lotte` | »Sie schläft. Wer schläft, hat keinen Hunger.« | – | `ah_zurueck` »Verstehe.« → `ah_hub` |

`ah_kuvert` (the node) is entered only through the gated option, so its
`score` is awarded once. Yields: `clue_schweigegeld`.

### `kroeger_verhoer`: the interrogation (P7)

```
k_hub ─┬─ k_verhoer1 [stufe=0] → k_s1 ── k_s1_kein_schwund ✓ → k_s2
       ├─ k_verhoer2 [stufe=1] → k_s2 ── k_s2_heft ✓ → k_s3
       ├─ k_verhoer3 [stufe=2] → k_s3 ── k_s3_untergeschoben ✓ → k_s4
       ├─ k_verhoer4 [stufe=3] → k_s4 ── k_s4_kuvert ✓ → k_gestaendnis
       │                                   → k_wo → k_boot → (k_g_zeuge | k_g_richter) → end
       ├─ k_weg [after confession] → k_weg → end
       └─ k_tschuess → end
 wrong evidence in k_sN: say rebuttal, goto k_sN (no state change); k_sN_raus → end
```

**`k_hub`**

`say` variants, first match wins:

- `has: clue_gestaendnis`: Kröger dreht sein leeres Glas. »Was wollen Se noch? Ich hab alles gesagt.«
- `has: clue_kroeger_version`: »Na, Voss. Noch 'ne Runde?« Kröger schiebt dir keinen Stuhl hin.
- Else, the first meeting: Kröger mustert dich über den Rand seines Köms. »Die Spürnase von der Brodersen. Hundertachtzig Kisten, sauber gezählt, der Rest is Schwund. Brodersen hat um Mitternacht Schluss gemacht. Im Spind lag die Ware. Und mit seiner Frau hab ich nix zu schaffen.«

`do`: `learn: clue_kroeger_version`. This is idempotent; on the first
meeting it also arms the ambush at the Baumwall.

| Option | Text | when | → |
|---|---|---|---|
| `k_verhoer1` | »Reden wir über Donnerstagnacht.« | `counter: { name: kroeger_stufe, eq: 0 }` | `k_s1` |
| `k_verhoer2` | »Weiter, Kröger. Brodersens Feierabend.« | `kroeger_stufe` eq 1 | `k_s2` |
| `k_verhoer3` | »Weiter. Der Spind.« | `kroeger_stufe` eq 2 | `k_s3` |
| `k_verhoer4` | »Weiter. Die Brodersens.« | `kroeger_stufe` eq 3 | `k_s4` |
| `k_weg` | »Wie komme ich zu Jakob?« | `has: clue_gestaendnis` | `k_weg` |
| `k_tschuess` | »Prost, Kröger.« | – | end |

**Stage nodes.** A rebuttal is an option `do: say …` followed by `goto` to
the same stage node, so Kröger repeats his claim. The claims are short on
purpose.

| Node | Kröger's claim (`say`) | Correct evidence (do; →) | Wrong evidence (rebuttal `say`; → same node) |
|---|---|---|---|
| `k_s1` | »Was fehlt, is Schwund. Im Hafen schwindet immer was. Kisten, Kaffee – Leute.« | `k_s1_kein_schwund` »Kein Schwund. Lene verkauft Ihr Los 4471.« when `has: clue_kein_schwund`; do `counter set 1`, `score: 1` → `k_s2` | `k_s1_zwanzig` »Zwanzig Kisten fehlen. Und Sie haben gezählt.« (`clue_zwanzig_kisten`) → Kröger grinst. »Und wo solln die hin sein? Ins Hafenbecken?« · `k_s1_lene` »Sie haben Lene Zigaretten verkauft.« (`clue_lene`) → »'n paar Stangen. Was hat das mit meiner Zählung zu tun?« · `k_s1_heft` »Jakobs Heft sagt: zwanzig Kisten in die ›Elise 7‹.« (`clue_zaehlheft`) → »Da steht K. Und geschrieben hat's 'n Dieb.« |
| `k_s2` | Kröger lehnt sich zurück. »Brodersen hat um Mitternacht Schluss gemacht. Danach weiß ich nix.« | `k_s2_heft` »Sein Zählheft sagt: letzte Hieve um 01:20.« when `has: clue_zaehlheft`; do `counter set 2`, `score: 1` → `k_s3` | `k_s2_tally` »Ihr Tallyzettel sagt hundertachtzig.« (`clue_tally`) → »Eben. Steht da was von Brodersen?« |
| `k_s3` | »Dieb bleibt Dieb. Ich hab den Spind selbst aufgeschlossen. Vor der Polizei.« | `k_s3_untergeschoben` »Sie haben ihm die Stangen untergeschoben.« when `has: clue_untergeschoben`; do `counter set 3`, `score: 1` → `k_s4` | `k_s3_nur` »Seit Donnerstag passte nur noch Ihr Schlüssel.« (`clue_nur_kroeger`) → »Und vorher hatte er seinen. Kann das Zeug schon Mittwoch reingelegt haben.« · `k_s3_frisch` »Die Ware kam erst Donnerstagnacht an Land.« (`clue_frisch_an_land`) → »Na und? Er war ja Donnerstagnacht an Bord.« |
| `k_s4` | Kröger wird laut. »Ich hab mit den Brodersens nix zu schaffen! Seine Frau kenn ich kaum.« | `k_s4_kuvert` »Sie haben Anni zweihundert Reichsmark gebracht.« when `has: clue_schweigegeld`; do `counter set 4` → `k_gestaendnis` | `k_s4_lene` »Lene hat Sie Freitag bei den Brodersens gesehen.« (`clue_lene`) → »Kondoliert hab ich. Als Vorarbeiter. Is das verboten?« · `k_s4_heft` »Im Heft steht ›K.‹ – K wie Kröger.« (`clue_zaehlheft`) → »K wie Kran. K wie Kai. Lesen Se mal 'n Hafenheft.« |

Every stage node also has a way out: `k_s1_raus`, `k_s2_raus`, `k_s3_raus`
and `k_s4_raus`, each »Ein andermal.« → end. The rebuttals of `k_s3` teach
why D4 needs both halves.

**Confession**

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `k_gestaendnis` | Kröger starrt in sein Glas. Lange. »Ich wollt ihn nicht schubsen. Er is auf der Lukentreppe ausgerutscht, das Bein war ab. Ich wollt 'n Arzt holen.« Er schluckt. »Seitdem bring ich ihm jeden Abend Wasser. Jeden Abend.« | `score: 2` | `k_g_wo` »Wo ist er, Kröger?« → `k_wo` |
| `k_wo` | »Speicher K. Vierter Boden.« Er legt einen Schlüssel auf den Tisch, dann ein gefaltetes Papier. »Das hat Asmussen mir geschrieben. Persilschein. Ohne den Wisch bin ich wieder der Kröger von dreiunddreißig.« | `learn: clue_gestaendnis` (the entry says where Jakob lies); `move: bodenschluessel → inventory`; `learn: clue_persilschein` | `k_g_weiter` »Und die Brücke? Nachts ist sie zu.« → `k_boot` |
| `k_boot` | »Ich nehm jeden Abend das Boot vom Wächter am Zollkanal. Der sieht weg. Der sieht immer weg.« Kröger hebt den Kopf. »Was wird jetzt aus mir?« | – | `k_g_zeuge` »Sagen Sie gegen Asmussen aus. Dann sag ich für Sie aus.« do: `set: kroeger_zeuge`, `say` Kröger nickt einmal, wie beim Verladen. → end · `k_g_richter` »Das entscheidet ein Richter.« do: `say` Kröger nickt. Er hat nichts anderes erwartet. → end |
| `k_weg` | »Übers Wasser. Fragen Se den Wächter am Zollkanal.« | – | none → end |

Yields: `clue_kroeger_version` (first talk); `clue_gestaendnis`,
`clue_persilschein`, `bodenschluessel` and optionally `kroeger_zeuge` (on
the confession). Once the counter is 4, the stage options are gone.
`kroeger_zeuge` is the only optional toggle in the game. It is decided once,
in Act III.

### `asmussen_warnung`: the ambush at the Baumwall (forced event)

The rule `asmussen_hinterhalt` starts it. It runs `on: { event: enter, room:
baumwall }` with `when: [ { has: clue_kroeger_version }, { not: { flag:
asmussen_getroffen } } ]` and does: `move asmussen → baumwall`, `set
asmussen_getroffen`, `dialogue: asmussen_warnung`. It is strictly linear, so
the scene adds no optional state.

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `a_w_start` | Unter dem Viadukt tritt ein Mann im Kamelhaarmantel aus dem Regen. Sein Hut ist der einzige trockene in Hamburg. »Voss? Asmussen, Kaffee-Import. Sie haben vor dem Krieg meine Ladungen versichert. Jetzt stellen Sie Fragen im Hafen.« | – | `a_w_wer` »Kennen Sie Jakob Brodersen?« → `a_w_geld` |
| `a_w_geld` | »Ich kenne keinen Brodersen. Und Speicher K ist seit dreiundvierzig eine Ruine, da lagert keiner was.« Er zählt Scheine ab. »Fünfhundert Reichsmark. Für Ihre Mühe. Gehen Sie nach Hause, Voss.« | – | `a_w_ablehnen` »Behalten Sie's. Ab morgen ist es Altpapier.« do: `move: asmussen → kontor`, `say` Er lächelt, als kenne er den Witz schon. »Wie Sie meinen.« Der Mantel verschwindet Richtung Speicherstadt., `learn: clue_asmussen` (last: the entry sums up the encounter) → end |

Nobody asked him about Speicher K. Its description in `clue_asmussen` points
that out.

### `lene_gespraech`: the backyard (P4b)

```
l_hub ─┬─ l_zigaretten [no clue_lene] → l_luege ── l_zurueck1 → l_hub
       ├─ l_los [pack held, no clue_lene] → l_redet ── l_und → l_kuvert ── l_zurueck2 → l_hub
       ├─ l_montag → l_montag ── l_zurueck3 → l_hub
       └─ l_tschuess → end
```

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `l_hub` | Variant `has: clue_lene`: »Du schon wieder. Ich hab dir alles gesagt. Und ein bisschen mehr.« · Else: »Feuersteine, Nähnadeln, gute Ratschläge. Die Ratschläge kosten extra.« | – | `l_zigaretten` »Haben Sie auch Zigaretten?« when `not: { has: clue_lene }` → `l_luege` · `l_los` »Und was ist hiermit? Los 4471.« when `has: zigarettenpaeckchen`, `not: { has: clue_lene }` → `l_redet` · `l_montag` »Was wird aus Ihnen ab Montag?« → `l_montag` · `l_tschuess` »Schönen Abend noch.« → end |
| `l_luege` | »Zigaretten? Ich rauch nicht mal.« Unter den Hosenknöpfen in ihrem Bauchladen blitzt eine Banderole. | – | `l_zurueck1` »Natürlich nicht.« → `l_hub` |
| `l_redet` | Lene sieht das Päckchen an, dann dich. »Freitag, sechs Uhr früh. Kröger. Fünf Stangen, dieselbe Nummer. ›Der Rest gehört dem Kaffeemann aus der Speicherstadt‹, hat er gesagt.« | `learn: clue_lene`; `score: 1` | `l_und` »Und weiter?« → `l_kuvert` |
| `l_kuvert` | »Am Abend is er bei den Brodersens rein. Mit 'nem Kuvert. Ich wohn drei Hütten weiter, ich seh so was.« | – | `l_zurueck2` »Danke, Lene.« → `l_hub` |
| `l_montag` | »Wart's ab: Am Montag sind die Schaufenster voll. Und keiner fragt, wo das Zeug bis Sonntag war.« | – | `l_zurueck3` »Wahrscheinlich nicht.« → `l_hub` |

The tap-first route reaches the same state without the dialogue. The rules
`show_paeckchen_lene` and `show_los_lene`, both with `when: not: { has:
clue_lene }`, `say` the two lines of `l_redet` and `l_kuvert`, then `learn:
clue_lene` and `score: 1`. Yields: `clue_lene`.

### `tadeusz_gespraech`: the watchman (P5, Act III crossing)

```
t_hub ─┬─ t_jakob [no clue_zaehlheft] → t_jakob ── t_zurueck1 → t_hub
       ├─ t_kein_dieb [clue_untergeschoben, no clue_zaehlheft] → t_heft ── t_wohin → t_elise ── t_angst → t_dp ── t_danke → end
       ├─ t_ueberfahrt [clue_gestaendnis, not tadeusz_rudert] → t_rudern → end
       ├─ t_halina → t_halina ── t_zurueck2 → t_hub
       └─ t_tschuess → end
```

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `t_hub` | Variant `has: clue_zaehlheft`: »Voss.« Tadeusz nickt. Die Thermoskanne steht offen. · Else: »Guten Abend.« Tadeusz schraubt die Thermoskanne zu, als wäre das Gespräch damit beendet. | – | `t_jakob` »Sie sind Jakobs Freund.« when `not: { has: clue_zaehlheft }` → `t_jakob` · `t_kein_dieb` »Jakob ist kein Dieb. Ich kann es beweisen.« when `has: clue_untergeschoben`, `not: { has: clue_zaehlheft }` → `t_heft` · `t_ueberfahrt` »Jakob lebt. Speicher K, vierter Boden.« when `has: clue_gestaendnis`, `not: { flag: tadeusz_rudert }`; do `set: tadeusz_rudert` → `t_rudern` · `t_halina` »Worauf warten Sie, Tadeusz?« → `t_halina` · `t_tschuess` »Gute Nacht, Tadeusz.« → end |
| `t_jakob` | »Wir trinken jede Nacht Muckefuck zusammen. Seit einem Jahr.« Er sieht aufs Wasser. »Wenn Jakob ein Dieb ist, bin ich der Freund eines Diebes. Wenn nicht … dann ist das etwas anderes.« | – | `t_zurueck1` »Verstehe.« → `t_hub` |
| `t_heft` | Er hört zu, ohne zu nicken. Dann holt er ein Heft aus der Wachbude. »Von Jakob. Um halb zwei. ›Wenn ich bis morgen nicht zurück bin, gib es Anni.‹ Ich habe es nicht gegeben.« | `score: 1` | `t_wohin` »Wohin ist er gegangen?« → `t_elise` |
| `t_elise` | »Hinter der Schute ›Elise 7‹ her, am Kanal entlang. Im Register steht, wem sie gehört: A. & Co., Speicher K.« | `learn: clue_zaehlheft` (the entry quotes the register) | `t_angst` »Warum haben Sie geschwiegen?« → `t_dp` |
| `t_dp` | »Am Freitag hat die Polizei ›die Polen‹ befragt. Für Ihre Polizei bin ich ein DP, ein Mensch am falschen Ort. Und wer am falschen Ort ist, hat immer etwas gestohlen.« | – | `t_danke` »Danke, Tadeusz.« → end |
| `t_rudern` | Tadeusz steht auf. »Kröger nimmt jeden Abend mein Boot. Ich habe weggesehen. Ich habe fünf Jahre gelernt, nichts zu sehen.« Er macht das Boot los. »Die Brücke ist zu. Das Wasser nicht.« | – | none → end |
| `t_halina` | »Auf Papiere. Kanada, als Holzfäller. Und auf einen Namen auf einer Suchliste: Halina Wrona, meine Schwester.« Er lächelt kaum. »Sie suchen einen Mann, ich suche eine Schwester. Wir haben beide nur Papier in der Hand.« | – | `t_zurueck2` »Ich hoffe, Sie finden sie.« → `t_hub` |

The tap-first redirect `show_untergeschoben_tadeusz` is `show
clue_untergeschoben tadeusz` with `when: not: { has: clue_zaehlheft }`. It
does: `say` Tadeusz liest lange in deinem Notizbuch., then `dialogue:
tadeusz_gespraech`. The hub then offers `t_kein_dieb`. Yields:
`clue_zaehlheft` and `tadeusz_rudert`.

### `jakob_gespraech`: the rescue (P8)

| Node | `say` (draft) | Node `do` | Options |
|---|---|---|---|
| `j_start` | Variant `has: clue_jakob_aussage`: »Bringen Sie's zu Ende, Voss. Ich zähl solange die Tropfen vom Dach.« · Else: Der Mann am Pfeiler hebt die Hand gegen das Licht. »Zweihundert«, sagt er. »Ich hab zweihundert gezählt. Ich zähl immer.« | – | `j_was` »Was ist passiert, Jakob?« when `not: { has: clue_jakob_aussage }` → `j_was` · `j_tschuess` »Ich hole Sie hier raus.« when `has: clue_jakob_aussage` → end |
| `j_was` | »Kröger hat mich oben an der Luke erwischt. Ich bin die Treppe runter. Dann kam einer im Kamelhaarmantel. Kröger wollte 'n Arzt holen. Der Mantel hat gesagt: ›Kein Arzt. Ärzte reden.‹« | `learn: clue_jakob_aussage`; `score: 1` | `j_durchhalten` »Halten Sie durch. Heute Nacht noch.« → `j_ende` |
| `j_ende` | »Grüßen Sie Anni. Sagen Sie ihr, ich hab richtig gezählt.« | – | none → end |

On the first talk, `j_was` is the only available option, so the testimony is
guaranteed. Yields: `clue_jakob_aussage`.

### `asmussen_finale`: the reckoning (finale)

This is a **stateless ladder** inside one conversation, with no counter. If
you leave, Asmussen starts his defence from the top again, which suits him.
Points are awarded only in the final choice, so restarting never pays twice.
Every rung offers 2–3 pieces of evidence the player holds; exactly one is
valid.

```
f_start ── f_anklage → f_s1 ── f_s1_persil ✓ → f_s2 ── f_s2_hand ✓ → f_s3 ── f_s3_arzt ✓ → f_angebot
        └─ f_gehen → end        (wrong: rebuttal, → same rung; f_gehen1..3 → end)
f_angebot ── f_ablehnen → f_wahl ── f_englaender → end: ende_erster_morgen
                                 └─ f_kripo      → end: ende_hamburger_regen
```

| Node | Asmussen (`say`) | Valid evidence | Wrong evidence → rebuttal (`say`, → same rung) |
|---|---|---|---|
| `f_start` | Asmussen sieht nicht auf. »Voss. Sie tropfen auf meinen Teppich.« | `f_anklage` »Ich war oben, Asmussen. Vierter Boden.« → `f_s1` · `f_gehen` »Ein andermal.« → end | – |
| `f_s1` | »Kröger? Ein Vorarbeiter unter Hunderten. Ich kenne den Mann kaum.« | `f_s1_persil` »›Seit 1934 bekannt.‹ Ihr Persilschein für Kröger.« when `has: clue_persilschein` → `f_s2` | `f_s1_kuvert` »Ihr Kuvert lag bei Anni Brodersen.« (`clue_schweigegeld`) → »Kuverts mit meinem Stempel liegen im Hafen zu Hunderten herum.« · `f_s1_jakob` »Jakob hat Sie gesehen.« (`clue_jakob_aussage`) → »Ein Mann im Fieber sieht einen Mantel.« |
| `f_s2` | »Gut, ich habe für ihn gebürgt. Aber wenn oben Ware liegt, hat Kröger sie versteckt. Hinter meinem Rücken.« | `f_s2_hand` »›Montag sechs Uhr geht die Ware raus.‹ Ihre Tinte. Ihr ›g‹.« when `has: clue_dieselbe_hand` → `f_s3` | `f_s2_zettel` »Oben lag Ihre Anweisung an Kröger.« (`clue_anweisung`) → Asmussen lächelt. »Ohne Unterschrift? Die kann jeder geschrieben haben.« · `f_s2_elise` »Ihre Schute hat die Kisten gebracht.« (`clue_zaehlheft`) → »Meine Schute fährt für jeden, der zahlt.« |
| `f_s3` | Asmussen stellt die Tasse ab. »Ich habe Ware zurückgehalten, wie jeder Kaufmann diese Woche. Und ohne mich läge Brodersen im Fleet. Ich habe ihm das Leben gerettet.« | `f_s3_arzt` »Kröger wollte einen Arzt holen. Sie haben Nein gesagt.« when `has: clue_jakob_aussage` → `f_angebot` | `f_s3_kisten` »Zwanzig Kisten NAAFI-Ware hält man nicht zurück.« (`clue_zwanzig_kisten`) → »Die Engländer bekommen ihre Kisten. Mit Zinsen, wenn Sie wollen.« · `f_s3_spind` »Sie haben Jakob zum Dieb gemacht.« (`clue_untergeschoben`) → »Kröger hat ihm die Stangen untergeschoben, nicht ich. Lesen Sie Ihre eigenen Notizen.« |
| `f_angebot` | »Zwei Sack Rohkaffee, Voss. Ab Montag mehr wert als Ihr ganzes Büro.« Er lehnt sich zurück. »Sie haben vor dem Krieg meine Ladungen versichert. Damals haben Sie auch nicht gefragt, woher die Ware kam.« | `f_ablehnen` »Geld kann man umtauschen. Schuld nicht.« → `f_wahl` | – |
| `f_wahl` | Draußen wird der Regen grau. Asmussen greift nach dem Telefon und lässt die Hand dann liegen. »Und jetzt? Wem wollen Sie mich verkaufen?« | `f_englaender` »Den Engländern. Es ist ihre Ware.« do `score: 4`, `end: ende_erster_morgen` · `f_kripo` »Der Kripo. Es ist unsere Stadt.« do `score: 4`, `end: ende_hamburger_regen` | – |

Each rung has an exit: `f_gehen1`, `f_gehen2` and `f_gehen3`, each »Ein
andermal.« → end. There is no corrupt ending: refusing the bribe is the only
answer, as LucasArts would have it.

## Reactions outside dialogues (command rules)

Tap-first players show and give things directly. Specific rules come first,
then one catch-all per NPC (guide, section 7). All of these are text only,
unless noted.

| Command | Reaction |
|---|---|
| `give reichsmark wirt` (when `not: { flag: hintertuer_frei }`) | **State change:** P4a, see [puzzles.md](puzzles.md#p4-st-pauli-hintertür-und-bauchladen). |
| `give reichsmark kroeger` | »Reichsmark? Ab morgen tapezier ich damit.« |
| `give reichsmark lene` | »Seit Freitag nehm ich nur noch Ware. Oder Amis.« |
| `give reichsmark tadeusz` | »Ich habe genug Geld gesehen, das nichts wert ist.« |
| `give reichsmark anni` | Sie schiebt es zurück. »Das gehört jetzt Ihnen. So wertlos, wie es ist.« |
| `give reichsmark jakob` | Jakob zählt die Scheine, zweimal. »Zweihundert. Stimmt.« Er gibt sie dir zurück. |
| `give reichsmark asmussen` | »Ich wechsle seit Wochen in die andere Richtung, Voss.« |
| `show reichsmark wirt` | »Zeigen nützt nix. Hergeben.« |
| `show zigarettenpaeckchen tadeusz` | »Das haben mir die Polizisten am Freitag auch gezeigt. Mit der Frage, wo ich den Rest versteckt habe.« |
| `show clue_untergeschoben anni` | Anni atmet aus, als hätte sie zwei Tage die Luft angehalten. Ihr Blick geht zur Blechdose. |
| `show clue_lene anni` (when `not: { has: clue_schweigegeld }`) | **Redirect:** `say` Anni sieht weg. Dann sieht sie dich an., then `dialogue: anni_huette`. |
| `show clue_untergeschoben tadeusz` (when `not: { has: clue_zaehlheft }`) | **Redirect:** see `tadeusz_gespraech` above. |
| `show zigarettenpaeckchen lene`, `show clue_los4471 lene` (when `not: { has: clue_lene }`) | **State change:** P4b. |
| `show … kroeger` (catch-all) | Kröger schiebt dein Notizbuch weg. »Wenn Se was wollen, reden Se mit mir.« |
| `show … lene` (catch-all) | »Zeigen kostet nix. Kaufen schon.« |
| `show … tadeusz` (catch-all) | Tadeusz sieht hin und wieder weg. »Ich habe gelernt, nichts zu sehen.« |
| `show … anni` (catch-all) | »Ich versteh nichts von Kisten, Voss. Ich versteh was von Jakob.« |
| `show … jakob` (catch-all) | »Reden Sie mit mir, Voss. Nicht mit Ihrem Notizbuch.« |
| `show … asmussen` (catch-all) | »Papier, Voss. Ich handle mit Kaffee.« |
| `show … wirt` (catch-all) | »Zeigen nützt nix.« |
| `give … <npc>` (catch-all per NPC) | »Behalten Se's.« (Kröger, Wirt) · »Ich nehm nix, was ich nicht verkaufen kann.« (Lene) · »Behalten Sie es.« (others) |
| `talk wirt` | Before `hintertuer_frei`: »Dünnbier oder Dünnbier?« Der Wirt nickt zur Hintertür. »Da hinten nur Kundschaft, die zahlt. Heut nehm ich sogar noch Reichsmark. Die Brauerei will bis Sonntag ihr Geld.« · After: »Hinten is offen. Ab Montag nur noch gegen D-Mark.« |
| `talk lotte` | Du lässt sie schlafen. |
