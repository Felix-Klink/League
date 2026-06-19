// Pro-Play-Daten via Leaguepedia Cargo API.
//
// Leaguepedia limitiert hart und verlangt einen aussagekräftigen User-Agent.
// Strategie: EINE gruppierte Query (Picks je Champion+Rolle, letzte 90 Tage),
// 24h gecached, und bei Fehler/Rate-Limit ein leeres Ergebnis (graceful) —
// die App läuft dann allein mit dem High-Elo-Proxy weiter.

import { cached } from "./cache";
import { getChampionIndex } from "./ddragon";
import type { Lane } from "./types";

const API = "https://lol.fandom.com/api.php";
const UA =
  "LoLPoolGapFinder/0.1 (personal team-comp tool; contact: local-user)";
const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 90;

export interface ProStat {
  cid: number;
  picks: number;
  byRole: Partial<Record<Lane, number>>;
}

export interface ProData {
  byCid: Map<number, ProStat>;
  totalGames: number;
  available: boolean; // false => Quelle nicht erreichbar, Fallback aktiv
}

const ROLE_TO_LANE: Record<string, Lane> = {
  Top: "top",
  Jungle: "jungle",
  Mid: "middle",
  Bot: "bottom",
  Support: "support",
};

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sinceDate(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * DAY);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getProData(): Promise<ProData> {
  return cached("prostats:picks", DAY, async () => {
    try {
      const index = await getChampionIndex();
      // Name -> cid (normalisiert, deckt Sonderzeichen ab)
      const nameToCid = new Map<string, number>();
      for (const c of index.all) nameToCid.set(normName(c.name), c.cid);

      const params = new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "ScoreboardPlayers=SP,ScoreboardGames=SG",
        join_on: "SP.GameId=SG.GameId",
        fields: "SP.Champion=champion,SP.Role=role,COUNT(*)=picks",
        where: `SG.DateTime_UTC > '${sinceDate()}'`,
        group_by: "SP.Champion,SP.Role",
        order_by: "picks DESC",
        limit: "500",
      });

      const res = await fetch(`${API}?${params.toString()}`, {
        headers: { "User-Agent": UA, "Accept-Encoding": "gzip" },
      });
      if (!res.ok) throw new Error(`Leaguepedia HTTP ${res.status}`);
      const json = (await res.json()) as {
        error?: unknown;
        cargoquery?: { title: { champion: string; role: string; picks: string } }[];
      };
      if (json.error || !json.cargoquery) {
        throw new Error("Leaguepedia error/empty");
      }

      const byCid = new Map<number, ProStat>();
      let totalPicks = 0;
      for (const row of json.cargoquery) {
        const t = row.title;
        const cid = nameToCid.get(normName(t.champion));
        if (!cid) continue;
        const picks = Number(t.picks) || 0;
        totalPicks += picks;
        if (!byCid.has(cid)) byCid.set(cid, { cid, picks: 0, byRole: {} });
        const entry = byCid.get(cid)!;
        entry.picks += picks;
        const lane = ROLE_TO_LANE[t.role];
        if (lane) entry.byRole[lane] = (entry.byRole[lane] ?? 0) + picks;
      }

      return {
        byCid,
        totalGames: Math.round(totalPicks / 10), // 10 Picks pro Spiel
        available: true,
      };
    } catch {
      // Graceful Fallback: keine Pro-Daten, App nutzt nur High-Elo-Proxy.
      return { byCid: new Map(), totalGames: 0, available: false };
    }
  });
}
