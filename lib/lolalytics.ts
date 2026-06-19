// Adapter für den (inoffiziellen) Lolalytics counter-Endpunkt.
// Gesamte Endpunkt-Logik ist hier gekapselt — siehe DATA.md.

import { cached, HOUR } from "./cache";
import type {
  ChampLaneData,
  Lane,
  Matchup,
  MetaEntry,
  SynergyByLane,
  Tier,
} from "./types";
import { LANES } from "./types";

const BASE = "https://a1.lolalytics.com/mega/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

export interface FetchOpts {
  tier: Tier;
  patch: number; // Tage-Fenster: 7 | 14 | 30
}

interface RawCounter {
  cid: number;
  vsWr: number;
  n: number;
  allWr: number;
  defaultLane: Lane;
}

interface RawResponse {
  stats: {
    cid: number;
    lane: Lane;
    analysed: number;
    wr: string | number;
    pr: string | number;
    lanes: Record<string, number>;
  };
  counters: RawCounter[];
}

function num(v: string | number): number {
  return typeof v === "number" ? v : parseFloat(v);
}

/**
 * Holt die Counter-/Matchup-Daten für (slug, lane).
 * Liefert null, wenn die Lane für den Champ nicht existiert (404).
 */
export async function fetchChampLane(
  slug: string,
  lane: Lane,
  opts: FetchOpts,
): Promise<ChampLaneData | null> {
  const key = `lol:${slug}:${lane}:${opts.tier}:${opts.patch}`;
  return cached(key, 12 * HOUR, async () => {
    const url =
      `${BASE}?ep=counter&c=${encodeURIComponent(slug)}&lane=${lane}` +
      `&tier=${opts.tier}&queue=420&patch=${opts.patch}&region=all`;

    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Lolalytics ${slug}/${lane}: ${res.status}`);

    const text = await res.text();
    // Ungültiger Endpunkt liefert "Array ( [valid] => )" statt JSON.
    if (!text.trimStart().startsWith("{")) {
      throw new Error(`Lolalytics non-JSON for ${slug}/${lane}`);
    }
    const data = JSON.parse(text) as RawResponse | { status: number };

    // {"status":404} -> Lane/Champ-Kombination existiert nicht.
    if ("status" in data) return null;

    const s = data.stats;
    const laneShare = s.lanes?.[lane] ?? 0;
    const pr = num(s.pr);
    // Geschätzte Games des Champs in dieser Lane:
    // analysed * pickrate% * laneShare%.
    const estGames = Math.round((s.analysed * (pr / 100) * laneShare) / 100);

    const matchups: Matchup[] = (data.counters ?? []).map((c) => ({
      cid: c.cid,
      vsWr: c.vsWr,
      n: c.n,
      allWr: c.allWr,
      defaultLane: c.defaultLane,
    }));

    return {
      cid: s.cid,
      lane,
      wr: num(s.wr),
      pr,
      laneShare,
      estGames,
      matchups,
    };
  });
}

// ---- Tierlist / Meta-Stärke (ep=list) -------------------------------------

interface RawListEntry {
  lane: Lane;
  wr: number;
  avgWrDelta: number;
  pr: number;
  br: number;
  tier: number;
  games: number;
  pctLane: number;
}

/**
 * Holt die Tierlist einer Lane: Map<cid, MetaEntry> mit Winrate, Delta zur
 * Durchschnitts-WR, Pick-/Banrate, Tier-Note und Games. Quelle: ep=list.
 */
export async function fetchTierList(
  lane: Lane,
  opts: FetchOpts,
): Promise<Map<number, MetaEntry>> {
  const key = `lollist:${lane}:${opts.tier}:${opts.patch}`;
  return cached(key, 12 * HOUR, async () => {
    const url =
      `${BASE}?ep=list&lane=${lane}&tier=${opts.tier}` +
      `&queue=420&patch=${opts.patch}&region=all`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Lolalytics list ${lane}: ${res.status}`);
    const text = await res.text();
    if (!text.trimStart().startsWith("{")) {
      throw new Error(`Lolalytics list non-JSON for ${lane}`);
    }
    const data = JSON.parse(text) as { cid?: Record<string, RawListEntry> };
    const map = new Map<number, MetaEntry>();
    const rows = data.cid ?? {};
    for (const cidStr of Object.keys(rows)) {
      const r = rows[cidStr];
      map.set(Number(cidStr), {
        cid: Number(cidStr),
        lane,
        wr: r.wr,
        avgWrDelta: r.avgWrDelta,
        pr: r.pr,
        br: r.br,
        tier: r.tier,
        games: r.games,
        pctLane: r.pctLane,
      });
    }
    return map;
  });
}

// ---- Synergie / Teammates (ep=build-team) ---------------------------------

interface RawTeamRow {
  0: number; // cid
  1: number; // wr
  2: number; // d1 (Synergy Delta)
  3: number; // d2 (Normalised Synergy Delta)
  4: number; // pr
  5: number; // n
}

/**
 * Holt die Teammate-Synergie eines Champs (in seiner Lane), gruppiert nach
 * Teammate-Lane. Quelle: ep=build-team. team_h = [id,wr,d1,d2,pr,n].
 */
export async function fetchSynergy(
  slug: string,
  lane: Lane,
  opts: FetchOpts,
): Promise<SynergyByLane | null> {
  const key = `lolteam:${slug}:${lane}:${opts.tier}:${opts.patch}`;
  return cached(key, 12 * HOUR, async () => {
    const url =
      `${BASE}?ep=build-team&v=1&patch=${opts.patch}&c=${encodeURIComponent(slug)}` +
      `&lane=${lane}&tier=${opts.tier}&queue=420&region=all`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Lolalytics team ${slug}/${lane}: ${res.status}`);
    const text = await res.text();
    if (!text.trimStart().startsWith("{")) return null;
    const data = JSON.parse(text) as {
      team?: Partial<Record<Lane, RawTeamRow[]>>;
      status?: number;
    };
    if (!data.team) return null;

    const out: SynergyByLane = {};
    for (const ln of LANES) {
      const rows = data.team[ln];
      if (!rows) continue;
      const m = new Map<number, import("./types").SynergyRow>();
      for (const r of rows) {
        m.set(r[0], { cid: r[0], wr: r[1], d1: r[2], d2: r[3], pr: r[4], n: r[5] });
      }
      out[ln] = m;
    }
    return out;
  });
}

/**
 * Ermittelt für einen Champ alle "relevanten" Lanes und ihre Daten.
 * Relevant = laneShare >= minLaneShare UND estGames >= minGames.
 */
export async function fetchRelevantLanes(
  slug: string,
  opts: FetchOpts,
  minLaneShare: number,
  minGames: number,
): Promise<ChampLaneData[]> {
  const results = await Promise.all(
    LANES.map((lane) => fetchChampLane(slug, lane, opts)),
  );
  return results.filter(
    (d): d is ChampLaneData =>
      d !== null && d.laneShare >= minLaneShare && d.estGames >= minGames,
  );
}
