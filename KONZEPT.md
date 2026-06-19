# LoL Pool-Gap Finder — Konzept

> Eine Web-App, die zu deinen 2–3 Main-Champs den sinnvollsten **neuen Champ zum Lernen** findet — basierend auf aktuellen Matchup-Winrates. Ziel: die Lücke schließen, die deine aktuellen Champs gemeinsam haben.

---

## 1. Idee in einem Satz

Du gibst deine Main-Champs ein. Die App ermittelt, welche Gegner-Champs deine Mains **gemeinsam** schlecht schlagen (gemeinsame Counter), und empfiehlt dir einen Champ, der **genau diese Counter** gut schlägt — damit du deinen Pool gezielt ergänzt, statt blind irgendeinen Meta-Champ zu picken.

---

## 2. Kern-Ablauf (User-Flow)

1. **Eingabe:** User trägt 2–3 Main-Champs ein (Autocomplete aus statischer Champ-Liste). Optional wählbar: **bevorzugte Lane** für die Empfehlung und **Rang-Bereich** (Default: Emerald+).
2. **Rollen-Erkennung:** Für jeden Main werden automatisch die Lane(s) bestimmt, in denen er eine **relevante Stichprobe (>1000 Games)** hat. Nur diese Rollen zählen.
3. **Matchup-Daten holen:** Pro (Champ, Rolle) werden die Matchup-Winrates gegen alle Gegner-Champs von Lolalytics geladen.
4. **Counter-Analyse:** Pro Main werden die Champs ermittelt, gegen die er verliert (niedrige Winrate). Dann werden **gemeinsame Counter** über alle Mains gefunden.
5. **Empfehlung:** Es wird ein Champ gesucht (den der User noch nicht spielt), der gegen diese gemeinsamen Counter eine gute Winrate hat → "Lern diesen Champ, um deine Lücke zu schließen."
6. **Anzeige:** Ergebnis-Dashboard mit Begründung (welche Counter, welche Winrates, warum dieser Pick).

---

## 3. Daten & API

### 3.1 Statische Champion-Daten (offiziell, kostenlos)
- **Riot Data Dragon** (`ddragon.leagueoflegends.com`) — Champ-Liste, Namen, Icons, IDs, aktuelle Patch-Version.
- Wird für Autocomplete, Icons und Mapping Name↔ID genutzt.

### 3.2 Matchup-/Winrate-Daten (Kern)
- **Lolalytics** stellt inoffizielle JSON-Endpunkte bereit (kein offizieller Support, kann sich ändern).
- Geliefert werden u.a.: Winrate eines Champs pro Lane, Pick-/Ban-Rate, **Matchup-Tabelle** (Winrate gegen jeden Gegner-Champ inkl. Game-Count des Matchups).
- **Wichtig:** Endpunkt-Struktur ist nicht dokumentiert → muss zu Implementierungsbeginn verifiziert werden (Request-Format, Patch-Parameter, Rang-Filter wie z.B. Emerald+). Felder/Pfade werden in einer kleinen `lolalytics.ts`-Adapter-Schicht gekapselt, damit Änderungen nur an einer Stelle gefixt werden müssen.

### 3.3 Was die offizielle Riot API NICHT kann
- Keine Winrates, keine Counter, keine aggregierten Matchup-Statistiken. Daher zwingend Drittanbieter (Lolalytics).

### 3.4 Caching
- Matchup-Daten ändern sich nur pro Patch → serverseitiges Caching (z.B. 6–24 h) pro (Champ, Rolle).
- Schont die Drittanbieter-Endpunkte und macht die App schnell.

---

## 4. Algorithmus (Herzstück)

### Begriffe
- `M` = Menge deiner Main-Champs.
- `R(c)` = Rollen von Champ `c` mit > 1000 Games (relevante Stichprobe).
- `WR(c, e, r)` = Winrate von Champ `c` gegen Gegner `e` in Rolle `r`.
- `games(c, e, r)` = Anzahl Games dieses Matchups (für Verlässlichkeit).

### Schritt 1 — Counter je Main bestimmen
Für jeden Main `c` und jede relevante Rolle `r`:
- Sammle alle Gegner `e`, bei denen `WR(c, e, r) <= LaneWR(c,r) − MARGIN` (Default MARGIN = 2 %)
  **und** `games(c, e, r) >= MIN_GAMES` (statistisch belastbar).
- ⚠️ **Relativ**, nicht absolut: Matchup-Winrates sind nach oben verschoben (Champ-Baseline ~52 %), daher wird gegen die *eigene* Lane-Winrate gemessen, nicht gegen 50 %. (Live an Daten kalibriert.)
- "Härte" eines Counters = `LaneWR(c,r) − WR` (je tiefer, desto schlimmer).

### Schritt 2 — Gemeinsame Counter finden
- Zähle, gegen wie viele deiner Mains ein Gegner `e` ein Counter ist.
- **Gemeinsamer Counter** = Gegner, der ≥ 2 deiner Mains countert.
- Gewichte jeden gemeinsamen Counter mit `problem_score(e)`:
  ```
  problem_score(e) = Σ über alle gecounterten Mains c:  (Härte(c,e) × Popularität(e))
  ```
  Popularität = wie häufig der Gegner gespielt wird (häufige Counter tun mehr weh).

### Schritt 3 — Ergänzungs-Champ empfehlen
- Kandidaten `x` = alle Champs, die der User **nicht** schon spielt.
- Für jeden Kandidaten `x` (in seiner Haupt-Rolle, >1000 Games):
  ```
  fit_score(x) = Σ über gemeinsame Counter e:  problem_score(e) × max(0, WR(x, e) − 50%)
  ```
  → belohnt Champs, die genau die problematischen Gegner gut schlagen.
- Zusätzliche Filter/Boni:
  - Mindest-Gesamtwinrate von `x` (kein Troll-Pick).
  - **Lane-Präferenz (wählbar):** Hat der User eine bevorzugte Lane gewählt, werden Kandidaten dieser Lane bevorzugt / nur diese gezeigt. Ohne Auswahl wird rollenübergreifend empfohlen.
- **Rang-Bereich:** Alle Winrates/Matchups werden für den gewählten Rang-Bereich geladen (Default: **Emerald+**), da dies die aussagekräftigste Datenbasis ist. Umstellbar in der Eingabe.
- **Ausgabe:** Top 1–3 Empfehlungen, sortiert nach `fit_score`, jeweils mit Begründung.

### Beispiel (vereinfacht)
- Mains: Ahri (Mid), Syndra (Mid).
- Beide verlieren stark gegen **Yasuo** und **Fizz** → gemeinsame Counter.
- Gesucht: Mid-Champ mit guter Winrate gegen Yasuo **und** Fizz → z.B. **Malzahar/Lissandra**.
- Empfehlung: "Lern Lissandra — schlägt deine 2 größten gemeinsamen Counter (Yasuo +6 %, Fizz +4 %)."

---

## 5. Tech-Stack

- **Next.js (App Router) + React + TypeScript** — Frontend & Backend in einem.
- **API-Routes / Server Actions** holen Lolalytics-Daten serverseitig (umgeht CORS, ermöglicht Caching, versteckt Roh-Endpunkte).
- **Styling:** Tailwind CSS (schnell, sauberes Dashboard-Layout).
- **Caching:** einfacher In-Memory- oder Datei-Cache pro Patch; später optional Redis/Vercel KV.
- **Deployment:** Vercel (kostenlos, passt zu Next.js).

---

## 6. Geplante Projektstruktur

```
league/
├── app/
│   ├── page.tsx                 # Eingabe + Ergebnis-Dashboard
│   └── api/
│       ├── champions/route.ts   # Champ-Liste (Data Dragon)
│       └── analyze/route.ts     # Kern: Analyse-Endpoint
├── lib/
│   ├── ddragon.ts               # Champ-Liste, Icons, Patch
│   ├── lolalytics.ts            # Adapter für Matchup-Daten (gekapselt)
│   ├── analysis.ts              # Counter- & Empfehlungs-Algorithmus
│   └── cache.ts                 # Caching-Layer
├── components/
│   ├── ChampPicker.tsx          # Autocomplete-Eingabe
│   ├── CounterList.tsx          # gemeinsame Counter anzeigen
│   └── Recommendation.tsx       # empfohlener Champ + Begründung
└── KONZEPT.md
```

---

## 7. Offene Punkte / Risiken

- **Lolalytics-Endpunkt inoffiziell:** Struktur muss verifiziert werden und kann brechen → in `lolalytics.ts` isoliert. Fallback/Fehlerhandling nötig.
- **Rang-Filter:** Default **Emerald+** (aussagekräftigste Basis), in der Eingabe umstellbar. ✅ entschieden.
- **Lane-Empfehlung:** bevorzugte Lane ist **wählbar**; ohne Auswahl rollenübergreifend. ✅ entschieden.
- **Schwellenwerte** (`SCHWELLE`, `MIN_GAMES`, Counter-Härte) sind erste Schätzwerte und müssen mit echten Daten kalibriert werden.
- **Rate-Limiting / faire Nutzung** der Drittanbieter-Endpunkte beachten (Caching hilft).
- **Rechtliches:** Nur für privaten Gebrauch gedacht; Lolalytics-ToS bei öffentlichem Deployment prüfen.

---

## 8. Vorgeschlagene Umsetzungs-Reihenfolge (MVP zuerst)

1. Next.js-Projekt aufsetzen + Champ-Liste/Autocomplete (Data Dragon).
2. `lolalytics.ts`-Adapter: für **einen** Champ Matchup-Daten holen & Format verstehen.
3. Counter-Analyse für die eingegebenen Mains (Schritt 1 + 2).
4. Empfehlungs-Algorithmus (Schritt 3).
5. Ergebnis-Dashboard mit Begründungen.
6. Caching + Politur (Icons, Rang-Filter, Loading-States).
