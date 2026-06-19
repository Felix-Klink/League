# LoL Pool-Gap Finder + Team Comp Builder

Zwei Tools in einer Web-App (Tabs oben):

1. **Pool-Gap Finder** (`/`): findet zu deinen 2–3 Mains den besten **neuen Champ zum Lernen**, der die gemeinsame Counter-Lücke schließt.
2. **Team Comp Builder** (`/team`): schlägt für einen 5-Stack je offenem Slot Champs vor, die die Comp ergänzen, gegen die Gegner stark sind und im Meta/Pro gut dastehen — mit Spieler-Pool-Berücksichtigung.

→ Konzepte: [KONZEPT.md](KONZEPT.md) · [KONZEPT-TEAMCOMP.md](KONZEPT-TEAMCOMP.md) · Daten-/API-Doku: [DATA.md](DATA.md)

## Starten

```bash
npm install
npm run dev      # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

## So funktioniert's

1. 2–3 Main-Champs eingeben, Rang (Default Emerald+) und optional bevorzugte Lane wählen.
2. App ermittelt pro relevanter Lane die **gemeinsamen Counter** (Gegner, gegen die mehrere deiner Mains relativ zu ihrer eigenen Lane-Winrate verlieren).
3. Sie empfiehlt Champs, die genau diese Counter schlagen — sortiert nach Abdeckung + Fit-Score.

## Aufbau

```
app/
  page.tsx                 Eingabe + Dashboard (Client)
  api/champions/route.ts   Champ-Liste (Data Dragon)
  api/analyze/route.ts     Analyse-Endpoint
lib/
  ddragon.ts               Champ-Liste, Icons, Patch, Slug-Mapping
  lolalytics.ts            Adapter für Matchup-Daten (gekapselt) + Caching
  analysis.ts              Counter- & Empfehlungs-Algorithmus + CONFIG-Schwellen
  cache.ts / types.ts
components/
  ChampPicker.tsx  Results.tsx
```

## Kalibrierung

Die Schwellenwerte stehen gesammelt in `CONFIG` (oben in [lib/analysis.ts](lib/analysis.ts)):

- `COUNTER_MARGIN` (2.0) – ab wie viel % unter der eigenen Lane-Winrate ein Matchup als Counter zählt. **Relativ**, weil Matchup-Winrates nach oben verschoben sind (Champ-Baseline ~52 %).
- `MIN_MATCHUP_GAMES` (200) – Mindest-Games je Matchup (Verlässlichkeit).
- `MIN_ROLE_GAMES` (1000) / `MIN_LANE_SHARE` (5 %) – wann eine Lane für einen Champ „relevant" ist.
- `MIN_CANDIDATE_WR` (49) – Mindest-Winrate eines Empfehlungs-Champs.

## Hinweis

Nutzt die **inoffiziellen** Lolalytics-JSON-Endpunkte (in `lib/lolalytics.ts` gekapselt). Für privaten Gebrauch gedacht; bei öffentlichem Deployment Lolalytics-ToS prüfen.
