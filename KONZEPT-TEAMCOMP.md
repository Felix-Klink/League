# Team Comp Builder — Konzept

> Erweiterung des Pool-Gap Finders. Für einen 5-Stack werden je **offenem Slot** Champs vorgeschlagen, die die Comp ergänzen, gegen die bekannten Gegner stark sind, im Meta/Pro gut dastehen und zum Spieler-Pool passen.

## Eingabe (alles manuell)

- **Euer Team:** 5 Slots (Top/Jungle/Mid/Bot/Support). Pro Slot: bereits gepickter Champ (optional), die **Mains des Spielers**, und ein Toggle **„nur Pool"**.
- **Bekannte Gegner:** Champs + optionale Lane (Gegner sind im Champ Select per API generell unsichtbar → immer manuell).
- **Rang** (Default Emerald+, bis Challenger) — bestimmt die Datenbasis.

> Live-Champ-Select via LCU ist bewusst **nicht** Teil dieser Stufe (siehe unten).

## Datenquellen (alle live verifiziert)

| Signal | Quelle | Datei |
|--------|--------|-------|
| Counter vs Gegner | Lolalytics `ep=counter` | [lib/lolalytics.ts](lib/lolalytics.ts) `fetchChampLane` |
| **Duo-Synergie** (Champ + Teammate) | Lolalytics `ep=build-team` (Synergy Delta `d1`/`d2`, Pickrate, Games) | `fetchSynergy` |
| **Pro-Cores + Pro-Picks + Pro-Meta** | **Oracle's Elixir** (echte Pro-Spiele), vorberechnet → gebündeltes JSON | `scripts/build-pro-data.mjs` → [lib/data/proData.json](lib/data/proData.json), Loader [lib/proData.ts](lib/proData.ts) |
| **Team-Strategie** (Archetyp) | kuratierte Archetyp-Listen + Trait-Fallbacks | [lib/archetypes.ts](lib/archetypes.ts) |
| Meta-Stärke je Champ/Lane | Lolalytics `ep=list` (`wr`, `avgWrDelta`, `pr`, `br`, `tier`, `games`) | `fetchTierList` |
| High-Elo-Proxy | Tier `master_plus`/`grandmaster`/`challenger` | — |
| Pro Pick/Presence | Leaguepedia Cargo (`ScoreboardPlayers`+`ScoreboardGames`, letzte 90 Tage, je Rolle) | [lib/proStats.ts](lib/proStats.ts) |
| Schaden/Range/Frontline | Data Dragon `tags`/`info`/`attackrange` | [lib/champTraits.ts](lib/champTraits.ts) |
| Engage / Hard-CC | **kuratierte Listen** (DDragon liefert das nicht) | [lib/champTraits.ts](lib/champTraits.ts) `ENGAGE_IDS`/`HARDCC_IDS` |

## Algorithmus ([lib/teamcomp.ts](lib/teamcomp.ts))

1. **Comp-Bedarf** aus gelockten Allies: AD/AP-Verhältnis, Engage vorhanden?, Frontline-Anzahl, Hard-CC-Anzahl, Range/Melee. → fließt in **Scorecard**.
2. **Counter vorberechnen:** pro Gegner dessen `ep=counter`-Daten holen; aus der Matchup-Liste ergibt sich für jeden Kandidaten der Vorteil `LaneWR(Gegner) − vsWr`. Direkter Lane-Gegner wird höher gewichtet. (Inversion → nur ~1 Request pro Gegner statt pro Kandidat.)
3. **Kandidatenpool je offenem Slot** = in der Lane spielbare Champs (`games ≥ MIN_POOL_GAMES` aus der Tierlist) + immer die eigenen Mains. Bei „nur Pool" auf die Mains beschränkt.
4. **Score je Kandidat** (Gewichte in `CONFIG`):
   ```
   score =  W_COUNTER  * counterScore   // schlägt die Gegner (direkte Lane stärker)
          + W_COMP     * compFit        // füllt AP/AD-Lücke, Engage, Frontline, CC
          + W_SYNERGY  * synergyScore    // DUO: paarweise Synergie (Lolalytics Δ)
          + W_PROCORE  * proCoreScore    // PRO-CORE: echtes Pro-Comp-Duo (Lift) — größter Hebel
          + W_TEAM     * teamScore       // TEAM: treibt die Comp-Strategie voran (Archetyp)
          + W_META     * metaScore       // WR-Delta (Lolalytics) + Pro-Pick-Häufigkeit
          + W_PLAYER   * playerFit        // im Pool des Spielers?
   ```
   - **Mains zählen mit:** Der Team-Kontext (Anchors) für Synergie/Pro-Core/Comp/Strategie ist `gelockt ODER die Mains eines noch offenen Slots` (gewichtet 1/n). So wirken die wahrscheinlichen Picks der Mitspieler schon vor dem Lock.
   - **Pro-Modus** (Toggle): hebt Synergie/Pro-Core/Team/Meta-Gewichte an und zieht das Tier auf High-Elo — Vorschläge möglichst nah an echten Pro-Drafts.
   - **Strategie-Konfidenz:** eine auto-erkannte Strategie zählt nur so stark, wie das Team schon bekannt ist (verhindert, dass eine wackelige Früh-Erkennung echte Pro-Cores verdrängt).
   - `compFit`: + für fehlende Bedarfe, − für überstapelten Schadenstyp. **Schadenslücken (AD/AP) füllen nur echte Schadensträger** — der Beitrag wird mit `damageWeight` gewichtet (Tank ~0.25, Enchanter/Catcher-Support ~0.35, Carry ~1.0). Tank-/Enchanter-Supports zählen daher nicht als AP/AD-Quelle, sondern punkten über Engage/Frontline/CC.
   - `synergyScore` (**Duo**): echte paarweise Synergie aus Lolalytics (`ep=build-team`). Pro gelocktem Ally wird das Synergy Delta `d1` mit dem Kandidaten gemittelt (nur Paare mit `n >= MIN_SYNERGY_GAMES`, sonst Off-Role-Rauschen). 0.5 = neutral, >0.5 = überdurchschnittliche Synergie. Chip „Synergie mit \<Ally\>".
   - `teamScore` (**ganzes Team / Strategie**): Statt nur Duos zu summieren, bekommt die Comp eine **Strategie**. Aus den gelockten Allies wird ein **Archetyp-Profil** berechnet (Teamfight/Wombo, Poke, Dive, Pick, Protect, Splitpush — Theorie nach Mobalytics/Dignitas). Die Ziel-Strategie wird **automatisch erkannt** (dominanter Archetyp) oder vom Nutzer **gewählt**. `teamScore` = Beitrag des Kandidaten zu dieser Strategie (Archetyp-Vektor). Chip „passt zu \<Strategie\>". So entsteht eine kohärente Gesamt-Comp, nicht nur eine Sammlung guter Einzel-Duos.
   - `metaScore`: 65 % Winrate-Delta + 35 % Pro-Picks (normalisiert). Fällt Leaguepedia aus, zählt nur der Winrate-Teil.
5. **Ausgabe:** Top-N je Slot mit **Begründungs-Chips** („countert Zed", „füllt AP-Lücke", „Engage", „stark im Meta", „Pro-Pick", „dein Main") + Flags „Main" / „zum Lernen". Jeder Vorschlag hat ein aufklappbares **„Wie berechnet?"** mit der Aufschlüsselung `Roh-Wert × Gewicht = Beitrag` je Kriterium und der Summe — plus eine Kriterien-Legende über den Ergebnissen.

### Synergie auf zwei Ebenen + Heuristik
„Zusammenpassen" wird auf **drei** Wegen modelliert:
1. **Duo-Synergie** (statistisch): echte paarweise Synergy Deltas aus Lolalytics (`ep=build-team`) — patch-aktuell, bei kleinen Samples rauschig (deshalb `n`-Filter).
2. **Team-Strategie** (strukturell, ganzes Team): Archetyp-Profil + Ziel-Strategie, damit die **Gesamt-Comp** kohärent ist — nicht nur einzelne starke Duos.
3. **Kompositions-Heuristiken** (Schadensbalance, Engage, Frontline, CC, Range) — robuste Grundbedarfe.

Die Archetyp-Listen in [lib/archetypes.ts](lib/archetypes.ts) (`SETS`) sind kuratiert und pflegbar; nicht gelistete Champs bekommen ein Trait-basiertes Fallback-Profil.

## Kalibrierung

Alle Gewichte/Schwellen in `CONFIG` oben in [lib/teamcomp.ts](lib/teamcomp.ts):
`W_COUNTER`, `W_COMP`, `W_META`, `W_PLAYER`, `MIN_POOL_GAMES`, `MIN_MATCHUP_GAMES`, `COUNTER_*`, `TOP_N`.
Engage/CC-Zuordnung in `ENGAGE_IDS`/`HARDCC_IDS` ([lib/champTraits.ts](lib/champTraits.ts)) — bei Bedarf Champ-ID ergänzen/entfernen.

## Zukunft: LCU-Live-Anbindung (nicht gebaut)

Champ Select live ginge nur über die lokale **LCU-API**:
- Lockfile `C:\Riot Games\League of Legends\lockfile` lesen (Port + Passwort).
- `GET https://127.0.0.1:<port>/lol-champ-select/v1/session` (Basic-Auth, self-signed Cert).
- Da die App lokal läuft, könnte eine Next-API-Route (`app/api/lcu/route.ts`) das serverseitig tun und eure Team-Picks/Bans automatisch füllen.
- Grenzen: nur Windows-Client-PC, **nur eigenes Team** (Gegner bleiben im Champ Select verborgen).
