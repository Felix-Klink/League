// Kern-Algorithmus: gemeinsame Counter finden + Ergänzungs-Champ empfehlen.
// Siehe KONZEPT.md Abschnitt 4 und DATA.md.

import { getChampionIndex } from "./ddragon";
import { fetchChampLane, fetchRelevantLanes, type FetchOpts } from "./lolalytics";
import type { Champion, ChampLaneData, Lane, Tier } from "./types";

// ---- Kalibrierbare Schwellenwerte -----------------------------------------
// Wichtig: Matchup-Winrates sind nach oben verschoben (Champ-Baseline ~52%).
// Deshalb wird ein Counter RELATIV zur eigenen Lane-Winrate definiert, nicht
// gegen absolute 50%.
export const CONFIG = {
  COUNTER_MARGIN: 2.0, // vsWr <= eigeneLaneWr - MARGIN => Gegner countert mich
  MIN_MATCHUP_GAMES: 200, // Mindest-Games eines Matchups (Verlässlichkeit)
  MIN_ROLE_GAMES: 1000, // Mindest-Games eines Champs in einer Lane
  MIN_LANE_SHARE: 5, // Mindest-Lane-Anteil in % (filtert Off-Roles)
  MIN_CANDIDATE_WR: 49, // Kandidat muss solide Gesamt-Winrate haben
  COMMON_MIN_MAINS: 2, // Counter muss >= so viele Mains countern
};

export interface AnalyzeInput {
  mainSlugs: string[];
  tier: Tier;
  patch: number;
  preferredLane?: Lane | null;
}

export interface CommonCounter {
  champ: Champion;
  lane: Lane;
  countersMains: { champ: Champion; vsWr: number; n: number }[]; // welche Mains werden gecountert
  problemScore: number;
}

export interface Recommendation {
  champ: Champion;
  lane: Lane;
  overallWr: number;
  fitScore: number;
  beats: { counter: Champion; winVs: number; n: number }[]; // welche gemeinsamen Counter er schlägt
}

export interface LaneAnalysis {
  lane: Lane;
  mains: Champion[]; // Mains, die in dieser Lane spielen
  commonCounters: CommonCounter[];
  recommendations: Recommendation[];
}

export interface AnalyzeResult {
  mains: Champion[];
  lanes: LaneAnalysis[];
}

export async function analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
  const index = await getChampionIndex();
  const opts: FetchOpts = { tier: input.tier, patch: input.patch };

  // 1) Mains auflösen + ihre relevanten Lanes holen
  const mains: Champion[] = [];
  for (const slug of input.mainSlugs) {
    const champ = index.bySlug.get(slug);
    if (champ) mains.push(champ);
  }
  const mainSet = new Set(mains.map((m) => m.cid));

  // (Main, Lane)-Daten laden
  const mainLaneData = new Map<number, ChampLaneData[]>();
  await Promise.all(
    mains.map(async (m) => {
      let lanes = await fetchRelevantLanes(
        m.slug,
        opts,
        CONFIG.MIN_LANE_SHARE,
        CONFIG.MIN_ROLE_GAMES,
      );
      if (input.preferredLane) {
        lanes = lanes.filter((l) => l.lane === input.preferredLane);
      }
      mainLaneData.set(m.cid, lanes);
    }),
  );

  // Welche Lanes betrachten wir? Alle, in denen >=1 Main spielt.
  const lanesInPlay = new Set<Lane>();
  for (const lanes of mainLaneData.values())
    for (const l of lanes) lanesInPlay.add(l.lane);

  const laneAnalyses: LaneAnalysis[] = [];

  for (const lane of lanesInPlay) {
    // Mains dieser Lane
    const laneMains = mains.filter((m) =>
      (mainLaneData.get(m.cid) ?? []).some((d) => d.lane === lane),
    );
    if (laneMains.length === 0) continue;

    // 2) Counter je Main in dieser Lane bestimmen
    // Map enemyCid -> Liste der gecounterten Mains (mit vsWr, n, Härte)
    const counterMap = new Map<
      number,
      { champ: Champion; vsWr: number; n: number; hardness: number }[]
    >();

    for (const m of laneMains) {
      const data = (mainLaneData.get(m.cid) ?? []).find((d) => d.lane === lane);
      if (!data) continue;
      const counterThreshold = data.wr - CONFIG.COUNTER_MARGIN;
      for (const mu of data.matchups) {
        if (mu.n < CONFIG.MIN_MATCHUP_GAMES) continue;
        if (mu.vsWr > counterThreshold) continue; // kein Counter (relativ)
        if (!counterMap.has(mu.cid)) counterMap.set(mu.cid, []);
        counterMap.get(mu.cid)!.push({
          champ: m,
          vsWr: mu.vsWr,
          n: mu.n,
          hardness: data.wr - mu.vsWr, // wie weit unter eigener Lane-WR
        });
      }
    }

    // 3) Gemeinsame Counter (>= COMMON_MIN_MAINS) + problemScore
    const commonCounters: CommonCounter[] = [];
    for (const [enemyCid, list] of counterMap) {
      if (list.length < CONFIG.COMMON_MIN_MAINS) continue;
      const champ = index.byCid.get(enemyCid);
      if (!champ) continue;
      // problemScore = Summe der Härten über alle gecounterten Mains
      const problemScore = list.reduce((acc, x) => acc + x.hardness, 0);
      commonCounters.push({
        champ,
        lane,
        countersMains: list,
        problemScore,
      });
    }
    commonCounters.sort((a, b) => b.problemScore - a.problemScore);

    // 4) Empfehlung: jeden gemeinsamen Counter abfragen und die Champs
    // sammeln, die ihn schlagen (counter.vsWr niedrig => Kandidat gewinnt).
    const candidateMap = new Map<
      number,
      {
        overallWr: number;
        beats: { counter: Champion; winVs: number; n: number }[];
        fitScore: number;
      }
    >();

    await Promise.all(
      commonCounters.map(async (cc) => {
        const ccData = await fetchChampLane(cc.champ.slug, lane, opts);
        if (!ccData) return;
        // Schwelle relativ zur Lane-WR des Counters: liegt seine vsWr gegen
        // einen Kandidaten deutlich darunter, schlägt der Kandidat ihn.
        const beatThreshold = ccData.wr - CONFIG.COUNTER_MARGIN;
        for (const mu of ccData.matchups) {
          if (mu.n < CONFIG.MIN_MATCHUP_GAMES) continue;
          // mu.vsWr = Winrate des Counters gegen Kandidat mu.cid.
          if (mu.vsWr > beatThreshold) continue; // Kandidat schlägt ihn nicht
          if (mainSet.has(mu.cid)) continue; // eigene Mains ausschließen
          if (mu.allWr < CONFIG.MIN_CANDIDATE_WR) continue; // kein Troll-Pick

          const beatMargin = ccData.wr - mu.vsWr; // wie klar der Kandidat gewinnt
          if (!candidateMap.has(mu.cid)) {
            candidateMap.set(mu.cid, {
              overallWr: mu.allWr,
              beats: [],
              fitScore: 0,
            });
          }
          const entry = candidateMap.get(mu.cid)!;
          entry.beats.push({
            counter: cc.champ,
            winVs: 100 - mu.vsWr, // ~ Winrate des Kandidaten gegen den Counter
            n: mu.n,
          });
          entry.fitScore += cc.problemScore * beatMargin;
        }
      }),
    );

    const recommendations: Recommendation[] = [];
    for (const [cid, e] of candidateMap) {
      const champ = index.byCid.get(cid);
      if (!champ) continue;
      // Nur Kandidaten, die mehr als einen gemeinsamen Counter schlagen,
      // sind echte Lücken-Füller (wenn es >1 gemeinsamen Counter gibt).
      recommendations.push({
        champ,
        lane,
        overallWr: e.overallWr,
        fitScore: e.fitScore,
        beats: e.beats.sort((a, b) => b.winVs - a.winVs),
      });
    }
    recommendations.sort((a, b) => {
      // bevorzuge Kandidaten, die mehr Counter abdecken, dann fitScore
      if (b.beats.length !== a.beats.length)
        return b.beats.length - a.beats.length;
      return b.fitScore - a.fitScore;
    });

    laneAnalyses.push({
      lane,
      mains: laneMains,
      commonCounters,
      recommendations: recommendations.slice(0, 8),
    });
  }

  return { mains, lanes: laneAnalyses };
}
