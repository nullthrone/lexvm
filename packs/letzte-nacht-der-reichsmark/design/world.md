# World: rooms, exits, objects, clues

Eleven rooms, 7 items, 21 clues. All ids match [cast.md](cast.md) and
[puzzles.md](puzzles.md). Room descriptions are German drafts. Each stays
under 600 characters, measured with `{id}` markup rendered. Every
interactable scenery object and NPC appears as `{id}` in its room text or in
its own `roomText`.

## Map

```
                    detektei (start)
                        │  down [auftrag_angenommen] / up
                        │
 nissenhuette ═══════ baumwall (hub) ─────────── zollkanal
   strassenbahn ⇄ stadt │      │   east ⇄ west      ║  ueberfahrt [tadeusz_rudert] ⇄ boot
                 south ⇄│      │⇄ west/east          ║
                  north │      │                    speicher_wasserseite
                 kaischuppen  kneipe                    │  up ⇄ out
                               │ hintertuer           speicher_treppe ── down [clue_jakob_aussage] ⇄ up ── kontor
                               │ [hintertuer_frei]      │  up ⇄ down (door bodentuer)
                               │ ⇄ in                 vierter_boden
                              hinterhof
```

**Geography (fictional where it matters).**

- The Baumwall lies under the Hochbahn viaduct.
- Kaischuppen 17 is on the city side, outside the free port, so it can be
  reached without a harbour pass.
- The Zollkanal is the customs border. The bridge is closed at night, so the
  only way to Speicher K in the Speicherstadt is by water.
- The »Letzter Groschen« is a cellar bar in St. Pauli.
- The Nissen hut estate lies behind the railway embankment, one tram ride
  away.

## Rooms and exits

| Room id | `name` | From | Exit id | Label (non-standard only) | To | Gate | `blocked` text |
|---|---|---|---|---|---|---|---|
| `detektei` | Detektei Voss | detektei | `down` | – | baumwall | `when: { flag: auftrag_angenommen }` | Anni Brodersen sitzt noch in deinem Besucherstuhl. Erst hörst du ihr zu. |
| `baumwall` | Am Baumwall | baumwall | `up` | – | detektei | – | – |
| | | baumwall | `south` | – | kaischuppen | – | – |
| | | baumwall | `east` | – | zollkanal | – | – |
| | | baumwall | `west` | – | kneipe | – | – |
| | | baumwall | `strassenbahn` | Straßenbahn zur Siedlung | nissenhuette | – | – |
| `nissenhuette` | Nissenhütte 14 | nissenhuette | `stadt` | Straßenbahn in die Stadt | baumwall | – | – |
| `kaischuppen` | Kaischuppen 17 | kaischuppen | `north` | – | baumwall | – | – |
| `kneipe` | Zum Letzten Groschen | kneipe | `east` | – | baumwall | – | – |
| | | kneipe | `hintertuer` | Durch die Hintertür | hinterhof | `when: { flag: hintertuer_frei }` | Der Wirt stellt sich vor die Tür. »Da hinten nur Kundschaft, die zahlt.« |
| `hinterhof` | Hinterhof | hinterhof | `in` | – | kneipe | – | – |
| `zollkanal` | Am Zollkanal | zollkanal | `west` | – | baumwall | – | – |
| | | zollkanal | `ueberfahrt` | Mit Tadeusz übersetzen | speicher_wasserseite | `visibleWhen: { flag: tadeusz_rudert }` | – |
| `speicher_wasserseite` | Speicher K, Wasserseite | speicher_wasserseite | `up` | – | speicher_treppe | – | – |
| | | speicher_wasserseite | `boot` | Zurück ins Boot | zollkanal | – | – |
| `speicher_treppe` | Treppenhaus Speicher K | speicher_treppe | `up` | – | vierter_boden | `door: bodentuer` | Die Bodentür ist zu. |
| | | speicher_treppe | `down` | – | kontor | `when: { has: clue_jakob_aussage }` | Unter der Kontortür liegt ein Lichtstreifen. Asmussen kann warten. Erst Jakob. |
| | | speicher_treppe | `out` | – | speicher_wasserseite | – | – |
| `vierter_boden` | Vierter Boden | vierter_boden | `down` | – | speicher_treppe | `door: bodentuer` | Die Bodentür ist zu. |
| `kontor` | Kontor Asmussen | kontor | `up` | – | speicher_treppe | – | – |

Every exit has a way back. The only one-way unlocks are flags that are never
cleared and a door that cannot be closed again.

## Room descriptions (German drafts)

### `detektei`: Detektei Voss (start)

> Dritter Stock eines halben Kontorhauses; die andere Hälfte liegt seit dreiundvierzig unten auf der Straße. Durch die Decke tropft der Regen in einen {regeneimer}, Takt für Takt. Auf dem {schreibtisch} liegen unbezahlte Rechnungen. Die Treppe führt hinunter zum Baumwall.

`anni` `roomText` (variant `at: detektei`): `{anni} wartet in deinem Besucherstuhl.`

### `baumwall`: Am Baumwall (hub)

> Unter dem Viadukt der Hochbahn stehen Pfützen voller Ziegelstaub. An der Litfaßsäule klebt die {bekanntmachung} zum neuen Geld, darüber ragen Kräne wie Galgen in den Regen.
>
> Nach Süden geht es zum Kaischuppen 17, nach Osten zum Zollkanal, nach Westen in die Kneipen von St. Pauli. An der Haltestelle wartet die Straßenbahn zur Siedlung. Die Treppe hinauf führt in deine Detektei.

### `nissenhuette`: Nissenhütte 14

> Ein halbes Wellblechfass im Schlamm, eins von hundert hinter dem Bahndamm. Der Regen trommelt aufs Dach. Ein {kanonenofen}, zwei Feldbetten, eine Wolldecke als Wand; dahinter schläft {lotte}. Auf dem Bord neben der Tür steht eine {blechdose}. Draußen hält die Straßenbahn in die Stadt.

`anni` `roomText` (default variant): `{anni} sitzt am Ofen und flickt eine Hose, die keinem mehr passt.`

### `kaischuppen`: Kaischuppen 17

> Der Schuppen ist lang wie eine Straße und leer bis auf den Geruch: nasse Jute, Teer, Tabak. Am Tor hängt ein {aushang}. An der Wand steht die {spindreihe}; einer ist mit Kreide markiert: {spind_jakob}.
>
> Daneben die verschlossene {glaskabine} des Schuppenmeisters. Durch einen Spalt über ihrer Tür siehst du ein {klemmbrett} an einem Nagel. Nach Norden geht es zum Baumwall.

Variant `has: clue_tally`: the last paragraph becomes »Daneben die
verschlossene {glaskabine} des Schuppenmeisters. Das {klemmbrett} hängt
schief am Nagel, so wie du es zurückgeschoben hast. Nach Norden geht es zum
Baumwall.«

### `kneipe`: Zum Letzten Groschen

> Eine Kellerkneipe in St. Pauli, die Decke so niedrig, dass der Rauch nicht weiß, wohin. Hinter dem Tresen zapft der {wirt} Dünnbier. Auf der {kreidetafel} steht etwas über Reichsmark. Eine Hintertür führt auf den Hof. Nach Osten geht es zurück zum Baumwall.

`kroeger` `roomText`: `Am Ecktisch sitzt {kroeger} vor einem Köm, den er nicht anrührt. Seine Kolonne sitzt zwei Tische weiter und sieht nicht her.`

### `hinterhof`: Hinterhof

> Zwischen zwei Brandmauern spannt sich eine Plane. Darunter wird geflüstert und getauscht: Feuersteine, Nylons, Kaffee in Tüten. Ein Pfiff, und der Hof wäre leer. Unter der Plane steht {lene} mit ihrem {bauchladen}. Die Tür führt hinein in die Kneipe.

### `zollkanal`: Am Zollkanal

> Schwarzes Wasser zwischen Kaimauern. {schuten|Schuten} liegen Bordwand an Bordwand und sammeln Regen. Drüben stehen die Giebel der Speicherstadt ohne Dächer, mittendrin {speicher_k}. Die Brücke hinüber sperrt ein {zollgitter}. In der {wachbude} brennt Petroleum. Nach Westen geht es zum Baumwall.

`roomText` of the room's objects:

- `tadeusz`, variant `flag: tadeusz_rudert`: `{tadeusz} sitzt unten im Boot und wartet.`
- `tadeusz`, default: `Vor der Wachbude sitzt {tadeusz} mit einer Thermoskanne.`
- `bootshaken`: `An der Wachbude lehnt ein {bootshaken}.`

### `speicher_wasserseite`: Speicher K, Wasserseite

> Eine glitschige Wassertreppe, grün bis zur Hochwassermarke. An einem Ring liegt die leere {schute_elise}; sie riecht nach Rohkaffee. Über dir vier Stockwerke Backstein, schwarz vom Feuer. Eine Ladeluke steht offen, dahinter geht eine Treppe hinauf. Tadeusz wartet im Boot.

### `speicher_treppe`: Treppenhaus Speicher K

There are two variants. The `flag: laterne_an` variant comes first:

> Im Laternenlicht: verkohlte Stufen, die noch halten. Es riecht nach kaltem Rauch und, absurd, nach Kaffee. Oben verschließt eine {bodentuer} den vierten Boden. Unten liegt ein Lichtstreifen unter der {kontortuer}. Hinaus geht es zur Wasserseite.

Default variant:

> Fast dunkel. Verkohlte Stufen, die noch halten; es riecht nach kaltem Rauch und, absurd, nach Kaffee. Oben ahnst du eine {bodentuer}. Unten liegt ein Lichtstreifen unter der {kontortuer}. Hinaus geht es zur Wasserseite.

`sturmlaterne` `roomText`: `Auf dem Absatz steht eine {sturmlaterne}, im Lichtstreifen gerade zu sehen.`

### `vierter_boden`: Vierter Boden

> Kisten bis an die verbrannten Balken, sorgfältig gestapelt: der einzige trockene Ort in Hamburg. {kisten|NAAFI-Kisten}, {kaffeesaecke|Säcke mit Rohkaffee}. Am Pfeiler liegt {jakob}, das Bein mit zwei Latten geschient. Neben ihm steht eine {wasserkanne}; darunter klemmt ein {zettel}. Die Treppe führt hinunter.

### `kontor`: Kontor Asmussen

> Mahagoni, ein {kachelofen}, der wirklich brennt, und der Geruch von echtem Bohnenkaffee. Auf dem Schreibtisch liegt ein {fuellhalter} neben einer {kaffeetasse}. Hier unten ist es, als hätte es den Krieg nie gegeben. Die Treppe führt hinauf.

`asmussen` `roomText` variants:

- `at: kontor`: `Hinter dem Schreibtisch sitzt {asmussen} und sieht nicht überrascht aus.`
- Default (only during the ambush): `Unter dem Viadukt steht {asmussen} im Kamelhaarmantel.`

## Objects by room

Kinds are `item` (portable), `scenery`, `npc`, `container` and `door`.
Clues are listed separately below. Descriptions are drafts of at most 400
characters. **Purpose** says why the object exists.

### `detektei`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `anni` | Anni | npc | `location: detektei`, `dialogue: anni_huette`, synonyms `[Anni Brodersen, Frau Brodersen, Frau]` | Anni Brodersen, Mitte dreißig. Der Mantel ist umgefärbt, die Hände sind rau vom Nähen. Sie sieht dich an, als hätte sie schon zu viele Leute gefragt. | Client; intro dialogue (rule `talk_anni_auftrag`). Moved to `nissenhuette` by the intro. |
| `schreibtisch` | Schreibtisch | scenery | | Unbezahlte Rechnungen. Ab Sonntag schrumpfen sie auf ein Zehntel. Das ist das einzig Gute an dieser Woche. | Flavour: currency reform. |
| `regeneimer` | Eimer | scenery | synonyms `[Regeneimer, Emaille-Eimer]` | Ein Emaille-Eimer, halb voll. Der Regen tropft im Takt einer Uhr, die niemand aufzieht. | Flavour. |

### `baumwall`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `bekanntmachung` | Bekanntmachung | scenery | `verbs: [lesen]`, synonyms `[Plakat, Aushang zum Geld]` | Ein Plakat der Militärregierung, schon halb vom Regen gelöst. Darauf, groß: NEUES GELD. | `lesen`: »Am Sonntag, dem 20. Juni 1948, erhält jeder Einwohner bei seiner Kartenstelle vierzig Deutsche Mark gegen vierzig Reichsmark. Ab Montag gilt das neue Geld.« Teaches the Kopfgeld background for the ending. |
| `asmussen` | Asmussen | npc | `location: nowhere`, `dialogue: asmussen_finale`, synonyms `[Konrad Asmussen, Kaufmann, Mantel]` | Konrad Asmussen, Kaffee-Import. Kamelhaarmantel, Siegelring, ein Gesicht, das noch nie gefroren hat. | Antagonist. Appears here only during the forced ambush, then lives in `kontor`. |

### `nissenhuette`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `kanonenofen` | Kanonenofen | scenery | synonyms `[Ofen]` | Ein Kanonenofen, im Juni angeheizt, weil die Wäsche sonst nie trocknet. | Flavour. |
| `lotte` | Lotte | scenery | synonyms `[Mädchen, Tochter]` | Lotte, elf, schläft unter zwei Mänteln. Ihre Schuhe stehen ordentlich nebeneinander, eine Nummer zu klein. | Flavour; `talk lotte` → »Du lässt sie schlafen.« |
| `blechdose` | Blechdose | scenery | `verbs: [open]`, synonyms `[Dose, Bord]` | Variant `has: clue_schweigegeld`: Darin ein leeres Kuvert mit Stempel: ›A. & Co. · Speicher K‹. · Default: Eine Blechdose auf dem Bord, ›Kaffee-Ersatz‹ steht darauf. Anni rückt ihren Stuhl so, dass sie zwischen dir und dem Bord sitzt. | Signposts P6. `open`/`take` are refused by Anni. |

### `kaischuppen`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `aushang` | Aushang | scenery | `verbs: [lesen]`, synonyms `[Löschliste, Liste, Zettel am Tor]` | Ein Aushang am Tor, mit Reißzwecken gegen den Wind gehalten. Eine Löschliste. | `lesen`: »LÖSCHLISTE · Kaischuppen 17 · Do. 17.6.48, Nachtschicht. D. ›Elspeth Gray‹, NAAFI-Ware, Los 4471: 200 Kisten Zigaretten. Abtransport NAAFI-Depot Fr. 5 Uhr unter Bewachung.« → `learn: clue_loeschliste` |
| `spindreihe` | Spinde | scenery | synonyms `[Spindreihe, Blechspinde]` | Zwanzig Blechspinde, grau gestrichen. Auf einem steht mit Kreide eine 23, darunter, kleiner: DIEB. | Signposts P1. |
| `spind_jakob` | Spind 23 | container | `openable: true`, `open: false`, `locked: true`, `unlockedBy: spindschluessel`, `verbs: [pull]`, synonyms `[Spind, Jakobs Spind, 23]` | Variant `isOpen: spind_jakob`: Leer bis auf einen Kleiderhaken. Innen an der Tür, schabloniert: ›Zweitschlüssel beim Vorarbeiter‹. · Default: Jakobs Spind. Ein Bartschloss, frisch verkratzt. | P1. One-way: `close` is refused by a rule. |
| `zigarettenpaeckchen` | Zigarettenpäckchen | item | `location: spind_jakob`, `portable: true`, synonyms `[Päckchen, Zigaretten, Banderole]` | Ein Päckchen englische Zigaretten, hinter die Rückwand gerutscht. Die Polizei hat es übersehen. Auf der Banderole: ›NAAFI – LOT 4471‹. | P1 → `clue_los4471`; P4b evidence for Lene. |
| `glaskabine` | Glaskabine | scenery | `verbs: [open]`, synonyms `[Kabine, Schuppenbüro, Glas]` | Das Büro des Schuppenmeisters, ein Glaskasten mit Vorhängeschloss. Über der Tür ein Spalt, breit wie eine Hand. | P2 obstacle. |
| `klemmbrett` | Klemmbrett | scenery | synonyms `[Tallyzettel, Tally, Brett]` | ›Tally – Elspeth Gray‹. Es hängt an einem Nagel hinter dem Spalt über der Tür. Zu weit für deinen Arm. Du bräuchtest etwas Langes mit einem Haken. | P2 target; signposts the boat hook. |

### `kneipe`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `kroeger` | Kröger | npc | `dialogue: kroeger_verhoer`, synonyms `[Willi Kröger, Vorarbeiter, Willi]` | Willi Kröger, Vorarbeiter. Breite Schultern, ein Gesicht wie ein Kai bei Ebbe. Er hat seit einer Stunde denselben Köm vor sich. | P7. |
| `wirt` | Wirt | npc | no `dialogue` (talk rules), synonyms `[Kneipenwirt]` | Ein Wirt mit Schürze und Bleistift hinter dem Ohr. Er sieht immer zur Hintertür, wenn jemand Geld erwähnt. | P4a gate. |
| `kreidetafel` | Kreidetafel | scenery | `verbs: [lesen]`, synonyms `[Tafel]` | Eine Schiefertafel über dem Tresen, voll Preise, die keiner mehr zahlt. | `lesen`: »›Reichsmark nur noch bis Sonntag!‹ Darunter, kleiner: ›Ab Montag nur gegen DM. Anschreiben zwecklos.‹« Signposts P4a. |

### `hinterhof`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `lene` | Lene | npc | `dialogue: lene_gespraech`, synonyms `[Lene Harms, Händlerin]` | Lene Harms, früher Schaffnerin bei der Straßenbahn. Die Mütze trägt sie noch. Sie hat ein Gesicht, das Preise im Kopf ausrechnet. | P4b. |
| `bauchladen` | Bauchladen | scenery | synonyms `[Laden, Knöpfe]` | Feuersteine, Nähnadeln, Hosenknöpfe. Unter den Knöpfen schaut eine Banderole hervor: ›NAAFI – LOT 44…‹. | Signposts P4b. `take bauchladen` → »Lene legt die Hand darauf. ›Gucken kostet nix. Anfassen schon.‹« |

### `zollkanal`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `tadeusz` | Tadeusz | npc | `dialogue: tadeusz_gespraech`, synonyms `[Tadeusz Wrona, Wächter, Schutenwächter]` | Tadeusz Wrona, Schutenwächter. Ein Mantel, der einmal einem größeren Mann gehört hat, und Augen, die alles sehen und nichts zeigen. | P5; Act III crossing. |
| `wachbude` | Wachbude | scenery | `verbs: [lesen]`, synonyms `[Bude, Register]` | Eine Bretterbude mit Petroleumlampe. Auf dem Tisch liegt das Schutenregister. | `lesen`, variant `has: clue_zaehlheft`: »Eine Zeile ist unterstrichen: ›Elise 7 – A. & Co., Speicher K‹.« · Default: »Tadeusz legt die Hand auf das Register. ›Das ist nicht für Fremde.‹« |
| `schuten` | Schuten | scenery | synonyms `[Schute, Boote, Kähne]` | Leere Schuten, Bordwand an Bordwand. Fast an jeder lehnt ein Bootshaken. An der Wachbude lehnt einer, der niemandem zu gehören scheint. | Signposts P2. |
| `bootshaken` | Bootshaken | item | `portable: true`, synonyms `[Haken, Stange]` | Eine Stange, so lang wie zwei Leute, vorn ein eiserner Haken. | P2 tool; consumed (moved to `nowhere`) when used. |
| `zollgitter` | Zollgitter | scenery | synonyms `[Gitter, Brücke, Zollbrücke]` | Ein Gitter quer über die Brücke, mit Kette. Nachts ist der Freihafen dicht. Hinüber nur mit Hafenausweis. Oder übers Wasser. | Explains why the crossing needs Tadeusz. `open`/`use` → »Die Kette ist dicker als dein Handgelenk.« |
| `speicher_k` | Speicher K | scenery | synonyms `[Speicher, Ruine]` | Halb verbrannt, die oberen Fenster schwarz. Aber die Luken im vierten Boden sind frisch mit Brettern vernagelt. Wer vernagelt einen leeren Speicher? | Signposts Act III. |

### `speicher_wasserseite`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `schute_elise` | Schute »Elise 7« | scenery | synonyms `[Schute, Elise, Elise 7]` | Die Schute ›Elise 7‹, leer. Am Bug: ›A. & Co.‹. Im Laderaum Kaffeestaub und ein abgerissenes Stück NAAFI-Banderole. | Confirms Tadeusz's account; flavour. |

### `speicher_treppe`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `sturmlaterne` | Sturmlaterne | item | `portable: true`, synonyms `[Laterne, Lampe]` | Variant `flag: laterne_an`: Sie brennt ruhig und riecht nach Petroleum. · Default: Eine Sturmlaterne, halb voll Petroleum. Kröger stellt sie wohl jeden Abend hierher. | P8 light. |
| `bodentuer` | Bodentür | door | `location: speicher_treppe`, `alsoIn: [vierter_boden]`, `openable: true`, `open: false`, `locked: true`, `unlockedBy: bodenschluessel`, synonyms `[Tür, Brandschutztür]` | Variants: `isOpen`: Sie steht offen. · `isLocked`: Eine Brandschutztür mit neuem Schloss, das einzig Neue im ganzen Haus. · Else: Aufgeschlossen. | P8 door. One-way: `close` is refused. |
| `kontortuer` | Kontortür | scenery | `verbs: [open]`, synonyms `[Kontor, Lichtstreifen]` | Unter der Tür ein Lichtstreifen. Dahinter klirrt eine Tasse. | Signposts the finale. `open`, variant `has: clue_jakob_aussage`: »Sie ist nur angelehnt. Geh hinunter.« · Default: »Asmussen kann warten. Erst Jakob.« |

### `vierter_boden`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `jakob` | Jakob | npc | `dialogue: jakob_gespraech`, synonyms `[Jakob Brodersen, Mann]` | Jakob Brodersen, Schauermann. Unrasiert und fiebrig, das rechte Bein mit zwei Latten geschient. Er zählt leise vor sich hin. | P8 testimony. |
| `kisten` | NAAFI-Kisten | scenery | synonyms `[Kisten, Kiste, Los]` | Zwanzig NAAFI-Kisten, sauber gestapelt. Auf jeder: ›LOT 4471‹. Eine ist aufgebrochen, es fehlen Stangen. | Visual confirmation of D1/D5. |
| `kaffeesaecke` | Kaffeesäcke | scenery | synonyms `[Säcke, Rohkaffee, Kaffee]` | Rohkaffee, Sack auf Sack. Ab Montag ein Vermögen. | Flavour: the hoard. |
| `wasserkanne` | Wasserkanne | scenery | synonyms `[Kanne]` | Eine Emaillekanne, halb voll. Jemand füllt sie jeden Abend. | Points to Kröger; `zettel` lies under it. |
| `zettel` | Zettel | scenery | `verbs: [lesen]`, synonyms `[Anweisung, Papier, Notiz]` | Ein Zettel, unter die Wasserkanne geklemmt, damit er nicht wegweht. Grüne Tinte. | `lesen` or `take` → `learn: clue_anweisung` (P8). |

### `kontor`

| id | `name` | Kind | Keys | Description (draft) | Purpose |
|---|---|---|---|---|---|
| `fuellhalter` | Füllhalter | scenery | synonyms `[Füller, Tinte, Feder]` | Ein Füllhalter mit grüner Tinte. Du hast diese Tinte heute schon gesehen. | Signposts D6. |
| `kaffeetasse` | Kaffeetasse | scenery | synonyms `[Tasse, Kaffee, Bohnenkaffee]` | Echter Bohnenkaffee. Der Geruch allein ist eine Frechheit. | Flavour. `take` → »Asmussen hebt eine Augenbraue. Das reicht.« |
| `kachelofen` | Kachelofen | scenery | synonyms `[Ofen]` | Ein Kachelofen, der im Juni brennt. Weil er es kann. | Flavour. |

### Items given or held from the start

| id | `name` | Start location | Got from | Lost to | Description (draft) |
|---|---|---|---|---|---|
| `streichhoelzer` | Streichhölzer | `inventory` | start | never | Eine Schachtel Streichhölzer, noch elf drin. Du zählst sie, ohne es zu wollen. |
| `spindschluessel` | Spindschlüssel | `nowhere` | `an_schluessel` (intro) | `nowhere` when locker 23 opens (»Der Schlüssel bleibt stecken.«) | Ein kleiner Bartschlüssel mit einer Blechmarke: 23. |
| `reichsmark` | Reichsmark | `nowhere` | `an_bezahlung` (intro) | `nowhere` when given to the `wirt` | Zweihundert Reichsmark in einem Gummiband. Heute noch Geld. Fragt sich nur, für wen. |
| `zigarettenpaeckchen` | Zigarettenpäckchen | `spind_jakob` | `take` (P1) | never | see above |
| `bootshaken` | Bootshaken | `zollkanal` | `take` (P2) | `nowhere` when used on the clipboard | see above |
| `sturmlaterne` | Sturmlaterne | `speicher_treppe` | `take`, or lighting it | never | see above |
| `bodenschluessel` | Bodenschlüssel | `nowhere` | `k_wo` (confession) | never | Ein neuer Schlüssel an einer Schnur. Er riecht nach Krögers Hosentasche. |

All items are protected from `drop` by the catch-all rule `drop_im_regen`.
An item is consumed only after its last use.

## Clues

All clues have `clue: true` and `location: nowhere`, and are acquired with
`learn`. Names have at most 24 characters. Descriptions state the fact,
German draft. **Declare them in this order**, which is the notebook order.
It reads like a case file, with every deduction placed right after its
inputs.

| # | id | `name` | Source | Description (draft) |
|---|---|---|---|---|
| 1 | `clue_auftrag` | Der Fall Brodersen | `anni_auftrag` node `an_polizei` | Jakob Brodersen, Schauermann in Krögers Kolonne, Kaischuppen 17. Verschwunden seit Donnerstagnacht. Zählt alles in ein Heft. Freitag, 7 Uhr: zwei Stangen NAAFI-Zigaretten in seinem verschlossenen Spind 23; Kröger schloss für die Polizei auf. Freund: Tadeusz am Zollkanal. |
| 2 | `clue_schluessel` | Der vergessene Schlüssel | `anni_auftrag` node `an_schluessel` | Jakobs Spindschlüssel hing seit Donnerstagmittag zu Hause in der Nissenhütte am Haken. Jakob hatte ihn vergessen. |
| 3 | `clue_kroeger_version` | Krögers Version | `kroeger_verhoer` node `k_hub` (first talk) | Kröger behauptet:<br>1. 180 Kisten, sauber gezählt, der Rest ist Schwund.<br>2. Brodersen hat um Mitternacht Schluss gemacht.<br>3. Im Spind lag die Ware: Dieb bleibt Dieb.<br>4. Mit den Brodersens hat er nichts zu schaffen. |
| 4 | `clue_asmussen` | Asmussens Karte | `asmussen_warnung` node `a_w_start` | Konrad Asmussen, Kaffee-Import, Speicher K, Kehrwieder. Kennt angeblich keinen Brodersen. Speicher K sei seit 1943 eine Ruine. Bot dir 500 Reichsmark fürs Nachhausegehen. Nach Speicher K hatte ihn niemand gefragt. |
| 5 | `clue_loeschliste` | Löschliste: 200 Kisten | `lesen aushang` | Kaischuppen 17, Donnerstag, 17. Juni, Nachtschicht: Dampfer »Elspeth Gray«, NAAFI-Ware Los 4471, 200 Kisten Zigaretten. Abtransport ins NAAFI-Depot Freitag, 5 Uhr, unter Bewachung. |
| 6 | `clue_zweitschluessel` | Zweitschlüssel | `open spind_jakob` (P1) | Innen an der Tür von Spind 23, schabloniert: »Zweitschlüssel beim Vorarbeiter«. Ein Bartschloss: Auf- und zuschließen geht nur mit Schlüssel. |
| 7 | `clue_los4471` | Los 4471 | `take zigarettenpaeckchen` (P1) | Ein Päckchen aus Jakobs Spind, NAAFI-Banderole »LOT 4471«. Losnummern vergibt die NAAFI pro Lieferung: ein Los, ein Schiff. |
| 8 | `clue_frisch_an_land` | Frisch an Land | **D2** | Los 4471 kam erst Donnerstagnacht mit der »Elspeth Gray« an Land. Die Ware in Jakobs Spind kann frühestens Donnerstagnacht hineingelegt worden sein. |
| 9 | `clue_nur_kroeger` | Nur Krögers Schlüssel | **D3** | Jakobs Schlüssel hing seit Donnerstagmittag zu Hause. Den Zweitschlüssel hat der Vorarbeiter. Seitdem konnte nur Kröger Spind 23 auf- und wieder zuschließen. |
| 10 | `clue_untergeschoben` | Untergeschoben | **D4** | Die Ware kam Donnerstagnacht an Land, als nur noch Kröger an Spind 23 konnte. Jakob kann sie nicht hineingelegt haben. Jemand hat sie ihm untergeschoben: Kröger. |
| 11 | `clue_tally` | Tallyzettel: 180 Kisten | `use bootshaken klemmbrett` (P2) | Tallyzettel »Elspeth Gray«, Donnerstag, Nachtschicht: 180 Kisten in den Schuppen gezählt. Unterschrift: »W. Kröger, i. V. Tallymann«. Der Tallymann war angeblich krank. |
| 12 | `clue_zwanzig_kisten` | Zwanzig Kisten fehlen | **D1** | 200 Kisten laut Löschliste, 180 auf Krögers Tallyzettel. Zwanzig Kisten sind zwischen Schiff und Schuppen verschwunden. Gezählt hat Kröger. |
| 13 | `clue_lene` | Lenes Aussage | Lene (P4b): `show zigarettenpaeckchen lene`, `show clue_los4471 lene`, or option `l_los` | Freitag, 6 Uhr früh, hat Kröger Lene fünf Stangen Los 4471 verkauft: »Der Rest gehört dem Kaffeemann aus der Speicherstadt.« Am Freitagabend ging er mit einem Kuvert in die Hütte der Brodersens. |
| 14 | `clue_kein_schwund` | Kein Schwund | **D5** | Zwanzig Kisten Los 4471 fehlen, und Kröger verkauft Los 4471 auf dem Schwarzmarkt. Das ist kein Schwund. Das ist Krögers Ware – und die des Kaffeemanns. |
| 15 | `clue_zaehlheft` | Jakobs Zählheft | `tadeusz_gespraech` node `t_heft` (P5) | Jakobs Heft, von Tadeusz: »200 Hieven, letzte 01:20. Tally 180?! K. lässt 20 Ki. in Elise 7. Geh hinterher.« Tadeusz sah Jakob um 01:30 der Schute folgen. Laut Register gehört die »Elise 7« A. & Co., Speicher K. |
| 16 | `clue_schweigegeld` | Zweihundert Reichsmark | `anni_huette` node `ah_kuvert` (P6) | Kröger brachte Anni am Freitagabend 200 Reichsmark, »von der Kolonne«. Auf dem Kuvert der Stempel »A. & Co. · Speicher K«. Mit diesem Geld hat Anni dich bezahlt. |
| 17 | `clue_gestaendnis` | Krögers Geständnis | `kroeger_verhoer` node `k_gestaendnis` (P7) | Kröger hat Jakob Donnerstagnacht in Speicher K erwischt. Jakob stürzte die Lukentreppe hinunter, das Bein gebrochen. Kröger wollte einen Arzt holen. Seitdem bringt er ihm jeden Abend Wasser. Jakob liegt auf dem vierten Boden. |
| 18 | `clue_persilschein` | Krögers Persilschein | `kroeger_verhoer` node `k_wo` (P7) | »Ich kenne Herrn Kröger seit 1934 als fleißigen, unpolitischen Arbeiter.« Datiert 28. Mai 1948, gezeichnet Konrad Asmussen. Grüne Tinte, steile Schrift, jedes »g« mit einer Schleife nach rechts. |
| 19 | `clue_anweisung` | Die Anweisung | `lesen zettel` or `take zettel` (P8) | »W. – Der Mann bleibt oben. Wasser ja, Licht nein. Montag sechs Uhr geht die Ware raus, dann lass ihn laufen. Wer glaubt schon einem Dieb.« Keine Unterschrift. Grüne Tinte, steile Schrift, jedes »g« mit einer Schleife nach rechts. |
| 20 | `clue_jakob_aussage` | Jakobs Aussage | `jakob_gespraech` node `j_was` (P8) | Kröger erwischte Jakob an der Luke, Jakob stürzte. Dann kam einer im Kamelhaarmantel. Kröger wollte einen Arzt holen. Der Mantel sagte: »Kein Arzt. Ärzte reden.« |
| 21 | `clue_dieselbe_hand` | Dieselbe Hand | **D6** | Die Anweisung und Krögers Persilschein: dieselbe grüne Tinte, dieselbe steile Schrift, dasselbe »g«. Asmussen hat die Anweisung geschrieben. |

In `clue_kroeger_version`, `<br>` stands for a single newline (a line
break) in the pack text.

Every clue has exactly one source, and the dialogue sources are reachable
again (`learn` is idempotent). No clue can be lost. No clue is optional:
every clue feeds a deduction, a gated option or the finale, except
`clue_asmussen` and `clue_kroeger_version`. Those two are learned in forced
or unavoidable scenes; the version is also the ambush trigger.

## Deductions

Each deduction is a rule `on: { verb: use, object: <a>, with: <b> }` with
`when: { not: { has: <result> } }`. Its effects are `say` (the conclusion as
Voss's thought), `learn: <result>` and `score`. The engine retries the
reverse order.

| # | Rule id | Inputs | Result | Score | Voss's thought (`say`, draft) |
|---|---|---|---|---|---|
| D1 | `d1_zwanzig_kisten` | `clue_tally` + `clue_loeschliste` | `clue_zwanzig_kisten` | 1 | Zweihundert gelöscht, hundertachtzig gezählt. Zwanzig Kisten haben sich zwischen Schiff und Schuppen in Luft aufgelöst. Und gezählt hat Kröger. |
| D2 | `d2_frisch_an_land` | `clue_los4471` + `clue_loeschliste` | `clue_frisch_an_land` | 1 | Los 4471: die »Elspeth Gray«, Donnerstagnacht. Was in Jakobs Spind lag, war vorher noch auf See. |
| D3 | `d3_nur_kroeger` | `clue_schluessel` + `clue_zweitschluessel` | `clue_nur_kroeger` | 1 | Jakobs Schlüssel hing zu Hause, der zweite beim Vorarbeiter. Seit Donnerstagmittag hatte nur einer Zugang zu Spind 23. |
| D4 | `d4_untergeschoben` | `clue_frisch_an_land` + `clue_nur_kroeger` | `clue_untergeschoben` | 2 | Die Ware kam an Land, als Jakob nicht mehr an seinen Spind konnte. Kröger schon. Jakob ist kein Dieb. Man hat ihn dazu gemacht. |
| D5 | `d5_kein_schwund` | `clue_zwanzig_kisten` + `clue_lene` | `clue_kein_schwund` | 1 | Zwanzig Kisten fehlen, und Kröger verkauft genau dieses Los. Das ist kein Schwund. Das ist ein Geschäft. |
| D6 | `d6_dieselbe_hand` | `clue_anweisung` + `clue_persilschein` | `clue_dieselbe_hand` | 2 | Grüne Tinte, steile Schrift, das »g« mit der Schleife. Der Mann, der Kröger reingewaschen hat, hat auch Jakobs Gefängnis bestellt. |

**Near misses** are text-only rules, placed after the deductions. They
answer plausible wrong pairs and point to the missing piece.

| Pair | Reply (draft) |
|---|---|
| `clue_tally` + `clue_los4471` | Auf dem Tallyzettel steht keine Losnummer. Aber irgendwo anders vielleicht. |
| `clue_auftrag` + `clue_zweitschluessel` | Ein Zweitschlüssel beim Vorarbeiter. Und wo war Jakobs eigener Schlüssel? |
| `clue_nur_kroeger` + `clue_auftrag` | Seit Donnerstagmittag konnte nur Kröger an den Spind. Aber vorher Jakob. Wann kam die Ware an Land? |
| `clue_frisch_an_land` + `clue_auftrag` | Die Ware kam Donnerstagnacht. Jakob war Donnerstagnacht an Bord. Hatte er seinen Schlüssel dabei? |
| `clue_zwanzig_kisten` + `clue_zaehlheft` | Jakob hat dasselbe gezählt wie du. Aber dem Heft eines Verschwundenen glaubt keiner. Wer verdient an den zwanzig Kisten? |
| `clue_schweigegeld` + `clue_asmussen` | Asmussens Stempel auf Krögers Kuvert. Das Geld kam von oben. Beweisen musst du es zuerst Kröger. |
| `clue_anweisung` + `clue_asmussen` | Asmussens Karte ist gedruckt. Du brauchst etwas, das er mit der Hand geschrieben hat. |

Any other failed `use … with …` falls through to the pack's `use` default:
»Das bringt dich nicht weiter.«
