# Lolalytics API — verifizierte Endpunkt-Doku

> Stand: 2026-06-18, live getestet. **Inoffiziell** — kann sich jederzeit ändern. Alle Zugriffe werden im Adapter `lib/lolalytics.ts` gekapselt, damit Änderungen nur an einer Stelle gefixt werden müssen.

## Endpunkt

```
GET https://a1.lolalytics.com/mega/?ep=counter&c=<champ>&lane=<lane>&tier=<tier>&queue=420&patch=<patch>
```

Header: ein normaler Browser-`User-Agent` reicht (z.B. `Mozilla/5.0`). Antwort ist JSON.

> Hinweis: Der `ep`-Wert **muss `counter`** sein. `champion`, `counters`, `matchup` etc. liefern `invalid end point`. Ein gültiger `ep` mit falschen Parametern liefert `{"status":404}`.

### Parameter

| Param  | Pflicht | Beispiel        | Bedeutung |
|--------|---------|-----------------|-----------|
| `ep`   | ✅      | `counter`       | Endpunkt-Typ. Nur `counter` ist relevant/gültig. |
| `c`    | ✅      | `ahri`, `leesin`| Champ als **Slug**: lowercase, **ohne Leerzeichen/Apostroph/Punkt**. `Lee Sin`→`leesin`, `Kai'Sa`→`kaisa`. Mit Leerzeichen (`lee%20sin`) → 404. |
| `lane` | ✅      | `middle`        | `top` \| `jungle` \| `middle` \| `bottom` \| `support` |
| `tier` | ✅      | `emerald_plus`  | `all`, `<rank>`, `<rank>_plus`. Getestet ok: `all`, `emerald`, `emerald_plus`, `platinum_plus`, `diamond_plus`. **Nicht** gültig: `diamond_2_plus`, `1_plus`. |
| `queue`| ✅      | `420`           | `420` = Ranked Solo/Duo. |
| `patch`| ✅      | `30`            | Zeitfenster in **Tagen** (Rolling Window). Getestet ok: `7`, `14`, `30`. `90` und leer → 404. Default: `30`. |
| `region`| –      | `all`           | Optional, Default `all`. |

## Antwort-Struktur

```jsonc
{
  "stats": {
    "cid": 103,            // Champion-ID (Riot)
    "lane": "middle",      // angefragte Lane
    "defaultLane": "middle",
    "analysed": 57517917,  // Gesamt-Games im Tier (Basis)
    "avgWr": 51.63,        // Durchschnitts-Winrate aller Champs (Baseline ~51-52% wg. Remakes)
    "wr": "52.36",         // Winrate des Champs in dieser Lane
    "pr": "10.24",         // Pickrate %
    "br": 4.25,            // Banrate %
    "lanes": {             // Lane-Verteilung des Champs in % -> Rollen-Erkennung!
      "top": 1.9, "jungle": 0, "middle": 96.6, "bottom": 0.5, "support": 0.9
    },
    "counters": {          // vorberechnete Top-Counter (Champion-IDs)
      "strong": [58, 21, 64],  // beste Matchups für den Champ
      "weak":   [30, 60, 26]   // schlechteste Matchups (= countern den Champ)
    }
  },
  "counters": [            // <-- KERN-DATEN: alle Matchups
    { "cid": 58, "vsWr": 64.36, "n": 275, "d1": 14.74, "d2": 10.75, "allWr": 49.62, "defaultLane": "top" },
    { "cid": 30, "vsWr": 45.57, "n": 542, "d1": -2.48, "d2": -6.47, "allWr": 48.05, "defaultLane": "jungle" }
    // ...
  ],
  "cache": "cached",
  "response": { "valid": true, "duration": "0" }
}
```

### `counters[]` — Feld-Bedeutung (verifiziert)

| Feld          | Bedeutung |
|---------------|-----------|
| `cid`         | Gegner-Champion-ID (Riot). |
| **`vsWr`**    | **Winrate MEINES Champs gegen diesen Gegner.** Hoch = gutes Matchup für mich; **niedrig = Gegner countert mich.** (Verifiziert: `stats.counters.weak` = die `cid`s mit niedrigster `vsWr`, `strong` = höchste.) |
| **`n`**       | Anzahl Games dieses Matchups → **Verlässlichkeits-Filter** (`MIN_GAMES`). |
| `allWr`       | Gesamt-Winrate des Gegners (Popularität/Stärke-Kontext). |
| `d1`, `d2`    | Deltas (Matchup-Winrate vs. erwarteter Baseline; „lane delta"). Optional fürs Ranking. |
| `defaultLane` | Haupt-Lane des Gegners. |

## Konsequenzen für den Algorithmus

Ein **einziger** Request pro (Champ, Lane) liefert **alle** benötigten Daten:

1. **Counter eines Mains** = Einträge mit niedriger `vsWr` (+ `n >= MIN_GAMES`).
2. **Empfehlungs-Check**: Für einen Kandidaten-Champ denselben Endpunkt abrufen und seine `vsWr` gegen die gemeinsamen-Counter-`cid`s nachschlagen.
3. **Rollen-Erkennung (>1000 Games / relevante Lane)**: über `stats.lanes` (%) × geschätzte Champ-Games (`analysed × pr/100`). ⚠️ Bei Emerald+ (zig Mio. Games) überschreiten auch Off-Lanes oft 1000 Games — daher zusätzlich/stattdessen **Lane-Anteil-Schwelle** (z.B. Lane ≥ 5 %) verwenden. Beide Schwellen konfigurierbar.

### cid → Name/Icon
Mapping über **Riot Data Dragon** (`/cdn/<patch>/data/de_DE/champion.json` bzw. `.../en_US/...`). Liefert `key` (= numerische cid als String), `id` (= Slug-artiger Name), Anzeigename und Icon-Pfad. Daraus wird auch der `c=`-Slug für Lolalytics gebaut (lowercase, Sonderzeichen entfernen).

## Caching
- Antworten enthalten `"cache":"cached"` (serverseitig). Trotzdem **eigenes Caching** pro `(c, lane, tier, patch)` für ~6–24 h, um Last/Latenz zu minimieren.

## Bekannte Stolpersteine
- Champ-Slug-Sonderfälle (`Kai'Sa`, `Dr. Mundo`, `Nunu & Willump`, `Wukong`/`MonkeyKing`) beim Build/Test gegenprüfen.
- `tier`-Werte strikt aus erlaubter Liste; sonst 404.
- `patch` nur 7/14/30 (Tage). Kein Patch-String wie `14.12`.

---

# Weitere Endpunkte (Team Comp Builder)

## Lolalytics Tierlist — `ep=list`

```
GET https://a1.lolalytics.com/mega/?ep=list&lane=<lane>&tier=<tier>&queue=420&patch=<patch>
```

Liefert die Meta-Werte **aller** in der Lane gespielten Champs. Adapter: `fetchTierList` in [lib/lolalytics.ts](lib/lolalytics.ts).

Antwort:
```jsonc
{
  "fields": [ ... ],        // Spalten-Metadaten (UI), für uns irrelevant
  "cid": {                  // Objekt, key = Champion-ID (String)
    "103": {
      "lane": "middle", "defaultLane": "middle", "pctLane": 96.6,
      "wr": 52.73,          // Winrate in der Lane
      "avgWrDelta": 1.59,   // Winrate über/unter Lane-Durchschnitt  <-- Meta-Signal
      "pr": 2.75, "br": 0.77,
      "tier": 8,            // Tier-Note (kleiner = besser)
      "games": 157950
    }
    // ...
  }
}
```

### High-Elo-Tiers (Pro-Proxy, verifiziert)
Zusätzlich zu den Counter-Tiers gültig: `master_plus`, `grandmaster`, `challenger`.
Nicht gültig: `diamond2_plus`, `1_plus`.

## Leaguepedia Cargo — Pro Pick/Presence

```
GET https://lol.fandom.com/api.php?action=cargoquery&format=json
  &tables=ScoreboardPlayers=SP,ScoreboardGames=SG
  &join_on=SP.GameId=SG.GameId
  &fields=SP.Champion=champion,SP.Role=role,COUNT(*)=picks
  &where=SG.DateTime_UTC > '<YYYY-MM-DD>'
  &group_by=SP.Champion,SP.Role
  &order_by=picks DESC&limit=500
```

Adapter: [lib/proStats.ts](lib/proStats.ts).

- **User-Agent Pflicht** (aussagekräftig), sonst sofort `{"error":{"code":"ratelimited"}}`.
- Antwort: `{ "cargoquery": [ { "title": { "champion", "role", "picks" } }, ... ] }`.
- `Role`-Werte: `Top` `Jungle` `Mid` `Bot` `Support` → Lane-Mapping im Adapter.
- Champion-Name = Data-Dragon-Anzeigename (Mapping über normalisierten Namen).
- **Strenges Caching** (24 h) + sequenzielle Nutzung; bei Fehler **graceful Fallback** (App nutzt nur den High-Elo-Proxy).

## Lolalytics Synergie — `ep=build-team`

```
GET https://a1.lolalytics.com/mega/?ep=build-team&v=1&patch=<patch>&c=<champ>&lane=<lane>&tier=<tier>&queue=420&region=all
```

Liefert die **Teammate-Synergie** des Champs, gruppiert nach Teammate-Lane. Adapter: `fetchSynergy` in [lib/lolalytics.ts](lib/lolalytics.ts).

> Gefunden durch Reverse-Engineering der Lolalytics-Seite: der Synergie-Tab triggert den Client-Handler `a("build-team","team")`. Endpunkt-Namen können zusammengesetzt sein (z.B. auch `build-earlyset`).

Antwort:
```jsonc
{
  "team_h": ["id","wr","d1","d2","pr","n"],   // Spalten-Header
  "team": {
    "top":    [ [cid, wr, d1, d2, pr, n], ... ],
    "jungle": [ ... ],
    "bottom": [ ... ],
    "support":[ ... ]
    // die EIGENE Lane fehlt (man ist nicht sein eigener Teammate)
  }
}
```

| Feld | Bedeutung |
|------|-----------|
| `id` | Teammate-Champion-ID |
| `wr` | Winrate **zusammen** (→ „Good/Bad Synergy") |
| **`d1`** | **Synergy Delta** = WR zusammen − Ø(beide Einzel-WR). >0 = besser als erwartet. |
| `d2` | **Normalised Synergy Delta** |
| `pr` | Pickrate des Paares (→ „Common Teammates") |
| **`n`** | Games des Paares → **Pflicht-Filter** (z.B. `n>=2000`), sonst Off-Role-Rauschen (Mini-Samples mit absurden Deltas). |

**Effizient:** Ein Request je gelocktem Ally (`c=ally`, `lane=allyLane`) liefert die Synergie mit **allen** Kandidaten aller anderen Lanes → `team[kandidatenLane]`.

## Data Dragon — Champ-Attribute

Aus `champion.json` zusätzlich genutzt: `tags`, `info{attack,defense,magic,difficulty}`, `stats.attackrange`, `partype`.
Ableitung in [lib/champTraits.ts](lib/champTraits.ts): Schadenstyp (AD/AP/Hybrid), Range (melee/ranged), Frontline. Engage/Hard-CC kommen aus kuratierten Listen (DDragon liefert das nicht).
