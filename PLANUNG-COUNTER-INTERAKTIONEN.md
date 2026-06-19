# Planung: Globale Counter- & Draft-Interaktionen

> Über Lane-Counter hinaus: **mechanische, draft-weite Interaktionen** modellieren (z.B. Sylas vs Malphite-Ult, Poppy vs Dash-Champs). Stand: Planung. Synergie-Rollen-Fix ist bereits umgesetzt (s. Abschnitt 4).

## 1. Problem / Ziel
Aktuell kennt der Builder nur **Lane-Counter** (Lolalytics, direkte Lane). Es fehlen **rollenübergreifende Mechanik-Interaktionen**, die Pros immer mitdenken:
- Gegner **Sylas** → eigene Champs mit „klau-würdigem" Teamfight-Ult (Malphite, Kennen, Amumu, Ornn …) abwerten.
- **Poppy** (Gegner) → eigene **Dash-Champs** abwerten (W stoppt Dashes).
- **Cassiopeia / Grounding** → Dash-Champs abwerten.
- Viel gegnerisches **Hard-CC** → eigene **immobile Carrys** abwerten, mobile/sichere aufwerten.
- Gegner **Master Yi / Tryndamere** (Auto-Attacker) → eigene **Hard-CC/Disengage** aufwerten.
- Gegner **Hard-Engage/Dive** → eigene **Disengage** (Janna, Poppy, Tahm) aufwerten.

Solche Interaktionen stehen **nicht** in Lane-Matchup-Daten → brauchen eine kuratierte **Mechanik-Wissensbasis** (wie Engage/CC/Archetypen).

## 2. Datenmodell: Mechanik-Tags je Champ
Neue Datei `lib/data/mechanics.ts` — kuratierte Sets (Data-Dragon-`id`), pflegbar:
- `DASH_RELIANT` — Mobilität über Dashes/Blinks (Zed, Yasuo, LeeSin, Camille, Akali, Irelia, Riven, Leblanc, Kaisa, Tristana …).
- `BIG_ULT` — game-changender (klau-/konter-würdiger) Teamfight-Ult (Malphite, Amumu, Kennen, Ornn, Orianna, MissFortune, Galio, JarvanIV, Diana, Neeko, Wukong, Seraphine, Sett, Rell, Yasuo …).
- `ANTI_DASH` — bestraft Dashes (Poppy, Cassiopeia, Jarvan, Anivia, Trundle, Azir, Taliyah …).
- `IMMOBILE` — kein Escape, anfällig für Dive/CC (Xerath, VelKoz, Karthus, Ziggs, Seraphine, Jinx, KogMaw, Aphelios, Brand …).
- `HARD_DISENGAGE` — kontert Engage (Janna, Poppy, TahmKench, Gragas, Anivia …).
- `AUTO_RELIANT` — kitebar mit CC (MasterYi, Tryndamere, Kayle, Vayne, KogMaw, Aphelios …).
- (vorhanden, wiederverwenden: `engage`, `hardCC`, `hypercarry`, `ranged`, `frontline`.)

## 3. Regel-Engine (Interaktionen)
Datei `lib/interactions.ts` — Liste deklarativer Regeln. Jede Regel:
```
{ when: { side: "enemy"|"ally", tag/champ },
  effect: { targetTag, delta },   // + Bonus / − Malus auf Kandidaten mit targetTag
  reason: "…" }
```
Beispiel-Regeln:
| Bedingung | Effekt auf eigenen Kandidaten | Begründung |
|-----------|-------------------------------|------------|
| Gegner hat **Sylas** | `BIG_ULT` → − | „Ult-Klau-Gefahr (Sylas)" |
| Gegner hat **Poppy** | `DASH_RELIANT` → − | „Dash wird von Poppy gestoppt" |
| Gegner hat **Cassiopeia** | `DASH_RELIANT` → − (leicht) | „Grounding kontert Dashes" |
| Gegner ≥ 3× **Hard-CC** | `IMMOBILE` → − ; mobil → + | „viel CC vs immobil" |
| Gegner hat **MasterYi/Tryndamere** | `hardCC` → + | „Hard-CC kontert Auto-Carry" |
| Gegner ≥ 2× **Engage/Dive** | `HARD_DISENGAGE` → + | „Disengage gegen Dive" |
| Gegner viele **Dashes** | `ANTI_DASH` (Poppy) → + | „Poppy bestraft Dash-Comp" |

Aggregation: pro Kandidat alle zutreffenden Regel-Deltas summieren → `interactionScore` (−1..+1, geclamped), mit den stärksten 1–2 Gründen als Chips.

## 4. ✅ Bereits umgesetzt: Synergie-Rollen-Relevanz
Die Duo-Synergie (Lolalytics) wird jetzt mit einer **Rollen-Paar-Gewichtung** multipliziert ([lib/teamcomp.ts](lib/teamcomp.ts) `ROLE_SYNERGY`):
- Bot+Support 1.0 · Jungle+Mid 0.7 · … · **Mid/Top ↔ ADC 0.15–0.2** (kaum direkte Synergie).
- Behebt Quatsch wie „Fizz-Mid + Senna 0.92". Pro-Cores (echte Pro-Paare, z.B. K'Sante+Yunara) bleiben **unberührt**, da empirisch belegt.

## 5. Scoring-Integration (geplant)
- Neues Kriterium **„Draft-Interaktion"** (`W_INTERACTION`, ~0.8) ODER Erweiterung des Counter-Terms.
- `score += W_INTERACTION * interactionScore` (kann negativ sein → echtes Abwerten unpassender Picks).
- Reason-Chips (rot bei Malus, grün bei Bonus): „Ult-Klau vs Sylas", „Dash vs Poppy", „Disengage vs Dive".
- In „Wie berechnet?" als eigene Zeile.

## 6. Sourcing & Validierung
- Mechanik-Tags: kuratiert aus Spielwissen + Pro-Knowledge (keine saubere API). Start-Seed liefere ich, danach verfeinerbar.
- **Validierung** gegen echte Daten: wo möglich mit Lolalytics-Matchup-WR und Oracle's-Elixir-Co-Occurrence gegenchecken (z.B. ob „Poppy im Spiel → Dash-Champs schlechtere WR" sich in den Daten zeigt), um die Deltas zu kalibrieren statt nur zu raten.

## 7. Umsetzungs-Reihenfolge
1. `mechanics.ts` Seed-Sets (DASH/BIG_ULT/ANTI_DASH/IMMOBILE/DISENGAGE/AUTO).
2. `interactions.ts` Regel-Liste + Auswertung (enemy/ally-aware).
3. Engine: `interactionScore` + Reasons + Gewicht.
4. UI: Kriterium + Chips.
5. Kalibrierung der Deltas an Lolalytics/OE-Daten.

## 8. Offene Fragen
- **Stärke:** Sollen Mechanik-Counter nur *abwerten* (Filter) oder auch aktiv *Konter vorschlagen* (z.B. Gegner-Dash-Comp → Poppy pushen)? (Vorschlag: beides.)
- **Eigene vs gegnerische Champs:** manche Tags wirken beidseitig (eigener Sylas = Bonus auf gegnerische Big-Ults nutzen — relevant nur fürs Banning, nicht fürs Picken). Fokus erstmal auf **Gegner → unsere Picks**.
- **Umfang Seed:** wie viele Champs/Regeln im ersten Wurf? (Vorschlag: ~20 wichtigste Interaktionen, dann erweitern.)
