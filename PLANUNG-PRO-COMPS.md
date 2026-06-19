# Planung: Pro-Comps in die Gewichtung holen

> Reine Recherche/Planung (Stand 2026-06-18). Implementierung später. Ziel: Der Team-Comp-Builder soll Vorschläge stärker in Richtung **echter Pro-Comp-Muster** lenken — mit denselben Kriterien, die Pro-Comps auszeichnen.

## 1. Datenlage & Aktualität

| Quelle | Inhalt | Aktualität |
|--------|--------|-----------|
| Leaguepedia (Pro) | Picks/Rollen aus echten Pro-Spielen | neuestes Spiel **2026-06-18 (heute)**, Fenster 90 Tage, ~42.800 Picks |
| Lolalytics SoloQ | Counter/Meta/**Synergie** (`build-team`) | rollierende 30 Tage, Patch **16.12** |

✅ **Update:** Echte 5er-Comps liegen jetzt vor — Quelle **Oracle's Elixir 2026** (lokale CSV, `League_data/`), **11.820 Pro-Comps**, 08.01.–18.06.2026, 100 % Champion-Match. Damit ist die Team-Ebenen-Auswertung echt (kein Proxy mehr).

## 2. Pro-Comp-Stile — ECHTE Team-Ebene (dominanter Archetyp je Comp)

| Stil | Anteil (Team-Ebene) | (vorher pick-gewichtet) |
|------|------|------|
| **Teamfight / Wombo** | **55 %** | 24 % |
| Poke / Siege | 17 % | 20 % |
| Dive | 14 % | 20 % |
| Pick | 8 % | 15 % |
| Protect the Carry | 4 % | 12 % |
| Splitpush | 1 % | 9 % |

→ Auf **Team-Ebene** dominiert **Teamfight massiv** — Pro-Meta dreht sich klar um Teamfights/Objectives; Splitpush ist fast verschwunden.

⚠️ **Methodik-Hinweis:** „Dominanter Archetyp" = häufigster Archetyp unter den 5 Champs. Der Teamfight-Set ist die breiteste Liste, was den Anteil etwas überzeichnet. Für die finale Gewichtung sollte pro Archetyp **set-größen-normalisiert** werden. Tendenz (Teamfight ≫ Poke/Dive ≫ Rest) ist aber robust.

## 3. Draft-Prinzipien aus dem Netz

Quellen: [LoL Wiki – Team drafting](https://wiki.leagueoflegends.com/en-us/Team_drafting), [DraftGap](https://draftgap.com/), [LoLDraftAI](https://loldraftai.com/), [ProComps.gg](https://procomps.gg/).

Pro-Drafts werden an diesen Achsen bewertet:
1. **Frontline & Protection** — genug Tank/Peel für die Carrys?
2. **Engage- vs. Poke-Profil** — klare Initiierung (Malphite-Yasuo) ODER Poke+Disengage (Jayce-Xerath); nicht beides halbgar.
3. **Schadensprofil** — AD/AP-Mix, damit Gegner nicht einseitig itemt.
4. **Scaling & Win-Condition** — wer skaliert härter, was ist der Plan (Teamfight/Pick/Siege/Split)?
5. **Synergien & Lane-Matchups** — Combos, die zusammen mehr sind als die Summe.

→ Das deckt sich exakt mit unseren bestehenden Kriterien (Comp-Fit, Duo-Synergie, Team-Strategie, Counter, Meta).

## 4b. ECHTE häufigste Cores (Oracle's Elixir 2026, Paar-Co-Occurrence)

Top-Paare, die real am häufigsten zusammen gepickt wurden:

| Paar | zusammen | Lesart |
|------|----------|--------|
| Ashe + Seraphine | 728× | Engage-ADC + AoE/Utility-Enchanter (Bot-Lane-Core) |
| Lulu + Yunara | 634× | Enchanter-Peel + Hypercarry → **Protect the Carry** |
| Corki + Nami | 506× | Poke/Scaling-ADC + Enchanter |
| Lucian + Milio | 425× | Aggro-ADC + Enchanter (Range/Peel) |
| Ezreal + Karma / Bard + Ezreal | 307× / 269× | Safe-Scaling-ADC + Utility-Sup |
| Ezreal + Xin Zhao / Ryze + Xin Zhao | 246× / 231× | Carry + Dive-Jungle |
| K'Sante + Yunara | 226× | Frontline-Top + Hypercarry (Front-to-back) |
| Ahri + Vi | 224× | Mid-Roam + Jungle → **Pick/Dive** |

→ Bestätigt die Logik: **Bot-Lane-Duos (ADC+Enchanter/Engage)**, **Jungle+Carry**, **Frontline+Hypercarry**. ⚠️ Roh-Co-Occurrence ist von vielgespielten Champs (Ezreal) dominiert; für „echte" Synergie-Stärke besser **Lift** (Co-Occurrence vs. erwartet) rechnen — TODO.

## 4. Rekonstruierte Pro-Cores + das „Warum" (Lolalytics Synergy-Δ, ergänzend)

Anker-Champ → stärkste Partner aus dem Pro-Pool (Lolalytics Synergy Delta, n≥2000):

- **Nautilus (Sup)** → Seraphine +4.5, Zyra/Vel'Koz/Swain, Samira.
  *Warum:* Punkt-Engage/Hook + **AoE-Follow-up & Ult-Setups** → Teamfight/Wombo-Core.
- **Xin Zhao (Jgl)** → Seraphine, Kayle, Pantheon, Lux, Gangplank.
  *Warum:* früher **Dive** + Ziele, die nach dem Dive Schaden/Skalierung liefern (Pantheon = Doppel-Dive, Kayle = beschützte Scaling-Carry).
- **Ashe (Bot)** → Kayle, Soraka, Seraphine, Taliyah, Diana.
  *Warum:* Ashe-Pfeil = **Engage/Pick-Setup** (Taliyah/Diana folgen) **+** Enchanter-Peel (Soraka) = Protect-the-Carry.
- **Sion (Top)** → Kindred, Kayn, Vel'Koz, Pyke, Fizz, Qiyana.
  *Warum:* großflächiger **Engage**, auf den **Assassinen/Pick** aufspringen → Pick/Teamfight-Core.
- **Ryze (Mid)** → Singed, Senna (wenige starke Paare).
  *Warum:* flexibler **Scaling/Global**-Pick, weniger an feste Combos gebunden.

**Wiederkehrende Logik:** Engage-Quelle (Naut/Xin/Sion/Ashe-R) + Follow-up (AoE-Mage / Assassin / Ult-Combo) + eine geschützte Skalierungs-Carry. Genau das ist „Teamfight/Dive/Pick".

## 5. Umsetzung — ✅ IMPLEMENTIERT

Alle Bausteine sind gebaut & getestet (Quelle: echte per-Game-Comps aus Oracle's Elixir, nicht mehr der Proxy):

1. ✅ **Pro-Pick-Boost** — Meta-Score nutzt jetzt die echte Pro-Pick-Häufigkeit je Champ/Lane aus den gebündelten Pro-Daten ([lib/proData.ts](lib/proData.ts) `proPickScore`), nicht mehr das fragile Live-Leaguepedia.
2. ✅ **Core-Completion** als **eigenes Kriterium** `W_PROCORE` (größter Hebel): Ist ein Core-Champ (auch als **Main** eines Slots) im Team, werden dessen echte Pro-Partner via **Co-Occurrence-Lift** ([lib/proData.ts](lib/proData.ts) `coreLift`) stark hochgezogen → Chip „Pro-Core mit \<Ally\>". Verifiziert: Ashe gelockt → **Seraphine #1**.
3. ✅ **Strategie-Prior aus Pro-Meta** — bei „Auto" wird das eigene Archetyp-Profil mit der echten Pro-Verteilung geblendet; zusätzlich **Strategie-Konfidenz** (zählt nur so stark, wie das Team bekannt ist).
4. ⏳ **Draft-Soft-Checks** — Scorecard prüft bereits Engage/Frontline/Hard-CC/AD-AP-Balance; „Scaling-Carry/Win-Condition"-Check noch offen (optionaler Ausbau).
5. ✅ **Pro-Modus-Toggle** — hebt Synergie/Pro-Core/Team/Meta-Gewichte an und zieht das Tier auf High-Elo.

**Zusatz:** ✅ **Mains zählen mit** — Synergie/Pro-Core/Strategie berücksichtigen auch die **Mains noch offener Slots** (gewichtet), nicht nur gelockte Champs. Verifiziert: Nautilus als Support-*Main* hebt MF/Senna im Bot-Slot.

## 6. Beantwortete Design-Fragen
- **Pro-Nähe vs. SoloQ:** gelöst über den **Pro-Modus-Toggle** (aus = SoloQ-tauglicher Mix, an = nah an Pro-Drafts).
- **Core-Quelle:** **echte per-Game-Cores** (Oracle's Elixir, Lift) — Proxy ersetzt.
- **Gewichtung Pro vs. Pool:** Pool-Fit bleibt eigenes Kriterium (`W_PLAYER`) + „nur Pool"-Toggle je Slot; Pro-Signale (Core/Meta) sind separat justierbar in `CONFIG`.

### Daten aktualisieren
Neue CSV in `League_data/` → `node scripts/build-pro-data.mjs` neu laufen lassen (baut [lib/data/proData.json](lib/data/proData.json) neu).
