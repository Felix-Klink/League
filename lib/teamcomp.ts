// Team-Comp-Engine: schlägt je offenem Slot Champs vor, die die Comp
// ergänzen, gegen die Gegner stark sind, im Meta/Pro gut dastehen und zum
// Spieler-Pool passen. Siehe KONZEPT-TEAMCOMP.md.

import { ARCHETYPE_LABELS, ARCHETYPES, champArchetype } from "./archetypes";
import { deriveTraits } from "./champTraits";
import { getChampionIndex } from "./ddragon";
import {
  fetchChampLane,
  fetchRelevantLanes,
  fetchSynergy,
  fetchTierList,
  type FetchOpts,
} from "./lolalytics";
import { coreLift, proArchetypePrior, proMeta, proPickScore } from "./proData";
import type {
  Archetype,
  ChampTraits,
  CompScorecard,
  Lane,
  MetaEntry,
  Reason,
  SlotResult,
  SlotSuggestion,
  SynergyByLane,
  TeamCompInput,
  TeamCompResult,
} from "./types";

// ---- Kalibrierbare Gewichte & Schwellen -----------------------------------
export const CONFIG = {
  W_COUNTER: 1.0,
  W_COMP: 1.0,
  W_SYNERGY: 0.7, // Duo-Synergie (Lolalytics Synergy Delta)
  W_PROCORE: 1.2, // Pro-Core-Completion (echte Pro-Comps) — größter Hebel
  W_TEAM: 0.9, // Fit zur Team-Strategie (Archetyp)
  W_META: 0.6, // Meta/Pro-Pick als unterstützendes, nicht dominierendes Signal
  W_PLAYER: 0.6,

  MIN_POOL_GAMES: 1000, // Champ gilt als in Lane spielbar (Kandidatenpool)
  MIN_LANE_SHARE_PCT: 30, // mind. % der Champ-Games in DIESER Lane (kein Off-Role)
  MIN_MATCHUP_GAMES: 200, // Verlässlichkeit eines Matchups
  COUNTER_SAME_LANE_W: 2.0, // Gewicht direkter Lane-Gegner
  COUNTER_CROSS_LANE_W: 0.5,
  COUNTER_NORM: 12, // wr-Punkte, die counterScore=1 ergeben
  MIN_SYNERGY_GAMES: 2000, // Verlässlichkeit eines Paares (filtert Off-Role-Rauschen)
  SYNERGY_NORM: 4, // Delta-Punkte, die synergyScore vom Neutralwert auf 1 heben
  CORE_NORM: 4, // (lift-1)/dies -> proCoreScore (lift ~5 => ~1.0)
  CORE_LIFT_REASON: 1.4, // ab diesem Lift zählt ein Anchor zur Pro-Core-Gruppe
  CORE_GROUP_BONUS: 0.15, // Bonus je zusätzlichem Core-Member (3–5er-Core > Paar)
  PRO_MODE_MULT: { synergy: 1.3, procore: 1.5, team: 1.4, meta: 1.3 }, // Boost im Pro-Modus
  TOP_N: 6,
};

// Relevanz der Duo-Synergie je Rollen-Paar. Lane-Duo (Bot+Sup) ist am
// aussagekräftigsten; Top/Mid<->ADC ist meist Rauschen (z.B. Fizz-Mid + Senna).
// Symmetrisch; betrifft NUR die Lolalytics-Duo-Synergie, nicht die Pro-Cores
// (die auf echten Pro-Paaren beruhen und cross-role aussagekräftig sind).
const ROLE_SYNERGY: Record<string, number> = {
  "bottom|support": 1.0,
  "jungle|middle": 0.7,
  "jungle|top": 0.55,
  "jungle|bottom": 0.55,
  "jungle|support": 0.5,
  "middle|support": 0.5,
  "middle|top": 0.35,
  "support|top": 0.25,
  "bottom|top": 0.2,
  "bottom|middle": 0.15, // ADC <-> Mid: kaum direkte Synergie
};
function rolePairWeight(a: Lane, b: Lane): number {
  if (a === b) return 1;
  const key = [a, b].sort().join("|");
  return ROLE_SYNERGY[key] ?? 0.3;
}

// ---- Hilfen ---------------------------------------------------------------

// Schadensanteile, gewichtet nach tatsächlichem Schadensbeitrag:
// Tanks/Enchanter zählen kaum, echte Carrys voll.
function damageShares(traits: ChampTraits[]): { ad: number; ap: number } {
  let ad = 0,
    ap = 0;
  for (const t of traits) {
    const w = t.damageWeight;
    if (t.damageType === "AD") ad += w;
    else if (t.damageType === "AP") ap += w;
    else {
      ad += w / 2;
      ap += w / 2;
    }
  }
  const sum = ad + ap || 1;
  return { ad: ad / sum, ap: ap / sum };
}

function buildScorecard(locked: ChampTraits[]): CompScorecard {
  const { ad, ap } = damageShares(locked);
  const frontlineCount = locked.filter((t) => t.frontline).length;
  const hardCCCount = locked.filter((t) => t.hardCC).length;
  const hasEngage = locked.some((t) => t.engage);
  const rangedCount = locked.filter((t) => t.ranged).length;
  const meleeCount = locked.length - rangedCount;
  const hasHypercarry = locked.some((t) => t.hypercarry);
  const carryCount = locked.filter((t) => t.dealsDamage).length;

  const notes: string[] = [];
  if (locked.length >= 2) {
    if (ad >= 0.75) notes.push("AD-lastig — AP-Schaden fehlt");
    if (ap >= 0.75) notes.push("AP-lastig — AD-Schaden fehlt");
    if (!hasEngage) notes.push("Kein verlässlicher Engage");
    if (frontlineCount === 0) notes.push("Keine Frontline");
    if (hardCCCount < 2) notes.push("Wenig Hard-CC");
    if (!hasHypercarry) notes.push("Keine klare Win-Condition (Scaling-Carry)");
    if (carryCount < 2) notes.push("Wenig Schadensquellen");
  }
  return {
    adShare: Math.round(ad * 100),
    apShare: Math.round(ap * 100),
    hasEngage,
    frontlineCount,
    hardCCCount,
    rangedCount,
    meleeCount,
    hasHypercarry,
    carryCount,
    notes,
  };
}

// Ein Anchor = ein (wahrscheinlicher) Mitspieler-Champ im Team-Kontext:
// gelockt (weight 1) oder ein Main eines noch offenen Slots (weight 1/nMains).
interface Anchor {
  cid: number;
  weight: number;
  lane: Lane;
  traits: ChampTraits;
}

// Gewichtete Schadensanteile über Anchor-Champs.
function damageSharesW(anchors: Anchor[]): { ad: number; ap: number; w: number } {
  let ad = 0, ap = 0, w = 0;
  for (const a of anchors) {
    const x = a.weight * a.traits.damageWeight;
    w += a.weight;
    if (a.traits.damageType === "AD") ad += x;
    else if (a.traits.damageType === "AP") ap += x;
    else { ad += x / 2; ap += x / 2; }
  }
  const sum = ad + ap || 1;
  return { ad: ad / sum, ap: ap / sum, w };
}

// compFit (gewichtet): füllt der Kandidat die Lücken des wahrscheinlichen Teams?
function compFitW(
  cand: ChampTraits,
  anchors: Anchor[],
): { score: number; reasons: Reason[] } {
  const reasons: Reason[] = [];
  if (anchors.length === 0) return { score: 0.3, reasons };

  const { ad, ap } = damageSharesW(anchors);
  const sumW = (pred: (t: ChampTraits) => boolean) =>
    anchors.reduce((s, a) => s + (pred(a.traits) ? a.weight : 0), 0);
  let score = 0;

  if (cand.dealsDamage) {
    if (cand.damageType === "AP" && ap < 0.4) {
      score += 0.4 * cand.damageWeight;
      reasons.push({ kind: "comp", label: "füllt AP-Lücke" });
    } else if (cand.damageType === "AD" && ad < 0.4) {
      score += 0.4 * cand.damageWeight;
      reasons.push({ kind: "comp", label: "füllt AD-Lücke" });
    } else if (cand.damageType === "Hybrid") {
      score += 0.15 * cand.damageWeight;
    }
  }
  if (sumW((t) => t.engage) < 0.5 && cand.engage) {
    score += 0.35;
    reasons.push({ kind: "comp", label: "Engage" });
  }
  if (sumW((t) => t.frontline) < 0.5 && cand.frontline) {
    score += 0.25;
    reasons.push({ kind: "comp", label: "Frontline" });
  }
  if (sumW((t) => t.hardCC) < 1.5 && cand.hardCC) {
    score += 0.15;
    reasons.push({ kind: "comp", label: "Hard-CC" });
  }
  // Win-Condition: fehlt der Comp ein skalierender Carry und der Kandidat ist
  // einer? -> Bonus.
  if (sumW((t) => t.hypercarry) < 0.5 && cand.hypercarry) {
    score += 0.2;
    reasons.push({ kind: "comp", label: "Win-Condition" });
  }
  if (cand.dealsDamage) {
    if (cand.damageType === "AD" && ad >= 0.8) score -= 0.2;
    if (cand.damageType === "AP" && ap >= 0.8) score -= 0.2;
  }
  return { score: Math.max(0, Math.min(1, score)), reasons };
}

// ---- Hauptfunktion --------------------------------------------------------

export async function buildTeamComp(
  input: TeamCompInput,
): Promise<TeamCompResult> {
  const proMode = input.proMode === true;
  const index = await getChampionIndex();
  const opts: FetchOpts = { tier: input.tier, patch: input.patch };

  // Traits- + Archetyp-Lookup
  const traitsByCid = new Map<number, ChampTraits>();
  const archByCid = new Map<number, Record<Archetype, number>>();
  for (const c of index.all) {
    const t = deriveTraits(c);
    traitsByCid.set(c.cid, t);
    archByCid.set(c.cid, champArchetype(c, t));
  }

  // Team-Kontext (Anchors) = NUR tatsächlich gelockte Champs. Mains noch
  // offener Slots zählen hier bewusst NICHT mit (nur der eigene Pool des Slots
  // fließt weiter unten in den Kandidaten ein).
  const slotEff = input.allies.map((a) => ({
    lane: a.lane,
    entries:
      a.lockedCid != null ? [{ cid: a.lockedCid, weight: 1 }] : [],
  }));

  const takenCids = new Set<number>();
  for (const a of input.allies) if (a.lockedCid != null) takenCids.add(a.lockedCid);
  for (const e of input.enemies) takenCids.add(e.cid);

  // Scorecard auf den TATSÄCHLICH gepickten Champs
  const lockedTraits: ChampTraits[] = [];
  for (const a of input.allies)
    if (a.lockedCid != null) {
      const t = traitsByCid.get(a.lockedCid);
      if (t) lockedTraits.push(t);
    }
  const scorecard = buildScorecard(lockedTraits);

  // Anchors außer dem aktuellen Slot (Team-Kontext für Synergie/Comp-Fit)
  function anchorsExcept(slotIdx: number): Anchor[] {
    const out: Anchor[] = [];
    slotEff.forEach((s, i) => {
      if (i === slotIdx) return;
      for (const e of s.entries) {
        const tr = traitsByCid.get(e.cid);
        if (tr) out.push({ cid: e.cid, weight: e.weight, lane: s.lane, traits: tr });
      }
    });
    return out;
  }

  // Team-Strategie: Archetyp-Profil über ALLE effektiven Champs (locked+Mains)
  const profileSum = {} as Record<Archetype, number>;
  ARCHETYPES.forEach((a) => (profileSum[a] = 0));
  let profileW = 0;
  for (const s of slotEff)
    for (const e of s.entries) {
      const av = archByCid.get(e.cid);
      if (!av) continue;
      profileW += e.weight;
      for (const a of ARCHETYPES) profileSum[a] += av[a] * e.weight;
    }
  const ptot = ARCHETYPES.reduce((s, a) => s + profileSum[a], 0) || 1;
  const archetypeProfile = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) archetypeProfile[a] = profileSum[a] / ptot;

  const userStrategy =
    input.strategy && input.strategy !== "auto" ? input.strategy : null;
  // Eigenes Profil mit Pro-Meta-Prior blenden (mehr Kontext => mehr eigenes)
  const alpha = Math.min(1, profileW / 4);
  let detected: Archetype | null = null;
  let bestB = -1;
  for (const a of ARCHETYPES) {
    const b = archetypeProfile[a] * alpha + proArchetypePrior[a] * (1 - alpha);
    if (b > bestB) { bestB = b; detected = a; }
  }
  const strategy: Archetype | null = userStrategy ?? detected;
  const strategyAuto = !userStrategy;
  // Konfidenz: eine auto-erkannte Strategie zählt nur so stark, wie das Team
  // schon bekannt ist (sonst verdrängt eine wackelige Früh-Erkennung echte
  // Synergien/Pro-Cores). Bei manueller Wahl: volle Konfidenz.
  const strategyConfidence = userStrategy ? 1 : Math.min(1, profileW / 3);

  // Synergie-Daten (Lolalytics) für alle einzigartigen Anchor-Champs laden
  const uniqAnchors = new Map<string, { cid: number; lane: Lane }>();
  slotEff.forEach((s) =>
    s.entries.forEach((e) => uniqAnchors.set(e.cid + ":" + s.lane, { cid: e.cid, lane: s.lane })),
  );
  const synByKey = new Map<string, SynergyByLane | null>();
  await Promise.all(
    [...uniqAnchors.values()].map(async (a) => {
      const champ = index.byCid.get(a.cid);
      if (!champ) return;
      synByKey.set(a.cid + ":" + a.lane, await fetchSynergy(champ.slug, a.lane, opts));
    }),
  );

  // Counter-Vorteile pro Gegner vorberechnen: Map<enemyIdx, Map<candCid, adv>>
  const enemyAdvList = await Promise.all(
    input.enemies.map(async (e) => {
      const champ = index.byCid.get(e.cid);
      if (!champ) return null;
      let lane = e.lane;
      if (!lane) {
        const rel = await fetchRelevantLanes(champ.slug, opts, 5, 1000);
        lane = rel.sort((a, b) => b.laneShare - a.laneShare)[0]?.lane ?? null;
      }
      if (!lane) return null;
      const data = await fetchChampLane(champ.slug, lane, opts);
      if (!data) return null;
      const adv = new Map<number, number>();
      for (const mu of data.matchups) {
        if (mu.n < CONFIG.MIN_MATCHUP_GAMES) continue;
        const a = data.wr - mu.vsWr; // >0 => Kandidat mu.cid schlägt Gegner
        if (a > 0) adv.set(mu.cid, a);
      }
      return { enemyCid: e.cid, lane, adv };
    }),
  );

  // Lanes, in denen ein Gegner bereits bekannt ist (für Pick-Reihenfolge)
  const enemyLanes = new Set<Lane>();
  for (const ea of enemyAdvList) if (ea) enemyLanes.add(ea.lane);

  // Tierlisten je benötigter Lane laden
  const openLanes = [
    ...new Set(
      input.allies.filter((a) => a.lockedCid == null).map((a) => a.lane),
    ),
  ];
  const tierLists = new Map<Lane, Map<number, MetaEntry>>();
  await Promise.all(
    openLanes.map(async (lane) => {
      tierLists.set(lane, await fetchTierList(lane, opts));
    }),
  );

  // Effektive Gewichte (Pro-Modus boostet Synergie/Team/Meta)
  const W = {
    counter: CONFIG.W_COUNTER,
    comp: CONFIG.W_COMP,
    synergy: CONFIG.W_SYNERGY * (proMode ? CONFIG.PRO_MODE_MULT.synergy : 1),
    procore: CONFIG.W_PROCORE * (proMode ? CONFIG.PRO_MODE_MULT.procore : 1),
    team: CONFIG.W_TEAM * (proMode ? CONFIG.PRO_MODE_MULT.team : 1),
    meta: CONFIG.W_META * (proMode ? CONFIG.PRO_MODE_MULT.meta : 1),
    player: CONFIG.W_PLAYER,
  };

  const slots: SlotResult[] = [];

  for (let slotIdx = 0; slotIdx < input.allies.length; slotIdx++) {
    const ally = input.allies[slotIdx];
    if (ally.lockedCid != null) continue;
    const lane = ally.lane;
    const tl = tierLists.get(lane);
    if (!tl) {
      slots.push({
        lane,
        suggestions: [],
        pickPriority: -1,
        enemyKnownInLane: enemyLanes.has(lane),
      });
      continue;
    }

    const anchors = anchorsExcept(slotIdx);
    const mainSet = new Set(ally.mains);
    const hasPool = ally.mains.length > 0;

    // Kandidaten = Champs, die in DIESER Lane wirklich gespielt werden
    // (genug Games UND genug Lane-Anteil -> kein Off-Role wie Vlad/Zyra Top).
    // Die eigenen Mains des Spielers werden immer zugelassen.
    const candidateCids = new Set<number>();
    for (const [cid, m] of tl) {
      if (
        m.games >= CONFIG.MIN_POOL_GAMES &&
        m.pctLane >= CONFIG.MIN_LANE_SHARE_PCT
      )
        candidateCids.add(cid);
    }
    for (const cid of ally.mains) candidateCids.add(cid);

    const suggestions: SlotSuggestion[] = [];

    for (const cid of candidateCids) {
      if (takenCids.has(cid)) continue; // schon gepickt / Gegner
      const fromPool = mainSet.has(cid);
      if (ally.poolOnly && !fromPool) continue;

      const traits = traitsByCid.get(cid);
      const meta = tl.get(cid);
      if (!traits) continue;

      const reasons: Reason[] = [];

      // 1) Counter
      let counterRaw = 0;
      let bestEnemyCid: number | null = null;
      let bestEnemyAdv = 0;
      for (const ea of enemyAdvList) {
        if (!ea) continue;
        const a = ea.adv.get(cid);
        if (!a) continue;
        const w =
          ea.lane === lane
            ? CONFIG.COUNTER_SAME_LANE_W
            : CONFIG.COUNTER_CROSS_LANE_W;
        counterRaw += w * a;
        if (ea.lane === lane && a > bestEnemyAdv) {
          bestEnemyAdv = a;
          bestEnemyCid = ea.enemyCid;
        }
      }
      const counterScore = Math.min(1, counterRaw / CONFIG.COUNTER_NORM);
      if (bestEnemyCid != null && bestEnemyAdv >= 1.5) {
        const en = index.byCid.get(bestEnemyCid);
        if (en) reasons.push({ kind: "counter", label: `countert ${en.name}` });
      }

      // 2) Comp-Fit (gewichtet über Anchors = locked + Mains der Mitspieler)
      const fit = compFitW(traits, anchors);
      reasons.push(...fit.reasons);

      // 2b) Duo-Synergie (Lolalytics Synergy Delta) gegen die Anchors.
      // 0.5 = neutral. 0 wenn kein Team-Kontext.
      let duoW = 0;
      let wSum = 0;
      let bestDuoCid = 0;
      let bestDuoD1 = 0;
      // 2c) Pro-Core-Completion: ein echter Pro-Core besteht aus 2–5 Champs.
      // Wir sammeln ALLE Anchors, mit denen der Kandidat zusammen in Pro-Comps
      // auftaucht (Co-Occurrence-Lift), und bilden daraus die Core-Gruppe.
      let proCoreScore = 0;
      // Alle Anchors, die mit dem Kandidaten ein verlässliches Pro-Paar bilden,
      // für die Gruppen-Begründung (Kandidat + diese = 2..5 Champs).
      const coreMembers: { cid: number; lift: number }[] = [];
      for (const a of anchors) {
        const syn = synByKey.get(a.cid + ":" + a.lane);
        const row = syn?.[lane]?.get(cid);
        const rawDuo = row && row.n >= CONFIG.MIN_SYNERGY_GAMES ? row.d1 : 0;
        // Rollen-Paar-Relevanz: Mid/Top<->ADC-Synergie wird stark gedämpft.
        const duoD1 = rawDuo * rolePairWeight(lane, a.lane);
        duoW += a.weight * duoD1;
        wSum += a.weight;
        if (duoD1 > bestDuoD1) { bestDuoD1 = duoD1; bestDuoCid = a.cid; }

        const lift = coreLift(a.cid, cid);
        if (lift > 0) {
          const s = Math.min(1, (lift - 1) / CONFIG.CORE_NORM);
          // gewichtet nach Anchor (Mains zählen anteilig)
          proCoreScore = Math.max(proCoreScore, s * (0.5 + 0.5 * a.weight));
          if (lift >= CONFIG.CORE_LIFT_REASON) coreMembers.push({ cid: a.cid, lift });
        }
      }
      // Bildet der Kandidat mit MEHREREN Locked-Champs ein Pro-Core (echte
      // 3–5er-Core-Gruppe), ist das stärker als ein einzelnes Paar -> Bonus.
      if (coreMembers.length > 1)
        proCoreScore = Math.min(
          1,
          proCoreScore * (1 + CONFIG.CORE_GROUP_BONUS * (coreMembers.length - 1)),
        );
      let synergyScore = 0;
      if (wSum > 0)
        synergyScore = Math.max(0, Math.min(1, 0.5 + duoW / wSum / CONFIG.SYNERGY_NORM));
      if (coreMembers.length > 0) {
        // Stärkste Paarungen zuerst; Kandidat + bis zu 4 Anchors = max. 5 Champs.
        coreMembers.sort((x, y) => y.lift - x.lift);
        const names = coreMembers
          .slice(0, 4)
          .map((m) => index.byCid.get(m.cid)?.name)
          .filter((n): n is string => Boolean(n));
        if (names.length)
          reasons.push({ kind: "procore", label: `Pro-Core mit ${names.join(", ")}` });
      } else if (bestDuoD1 >= 1.0) {
        const al = index.byCid.get(bestDuoCid);
        if (al) reasons.push({ kind: "synergy", label: `Synergie mit ${al.name}` });
      }

      // 2c) Team-Strategie-Fit: trägt der Kandidat zur (gewählten/erkannten)
      // Comp-Strategie bei? Mit Konfidenz skaliert (s.o.).
      let teamScore = 0;
      if (strategy) {
        const av = archByCid.get(cid);
        const rawTeam = av ? av[strategy] : 0;
        teamScore = rawTeam * strategyConfidence;
        if (rawTeam >= 0.6 && (userStrategy || profileW >= 2))
          reasons.push({
            kind: "team",
            label: `passt zu ${ARCHETYPE_LABELS[strategy]}`,
          });
      }

      // 3) Meta (Lolalytics-WR-Delta + echte Pro-Pick-Häufigkeit)
      let metaScore = 0;
      if (meta) {
        const wrPart = Math.max(0, Math.min(1, (meta.avgWrDelta + 3) / 6));
        const proPart = proPickScore(cid, lane);
        metaScore = 0.6 * wrPart + 0.4 * proPart;
        if (meta.avgWrDelta >= 1.5)
          reasons.push({ kind: "meta", label: "stark im Meta" });
        if (proPart >= 0.25) reasons.push({ kind: "pro", label: "Pro-Pick" });
      }

      // 4) Player-Fit
      const playerScore = fromPool ? 1 : 0;
      if (fromPool) reasons.push({ kind: "player", label: "dein Main" });

      const score =
        W.counter * counterScore +
        W.comp * fit.score +
        W.synergy * synergyScore +
        W.procore * proCoreScore +
        W.team * teamScore +
        W.meta * metaScore +
        W.player * playerScore;

      suggestions.push({
        cid,
        score,
        fromPool,
        learn: hasPool && !fromPool && !ally.poolOnly,
        reasons,
        parts: {
          counter: counterScore,
          comp: fit.score,
          synergy: synergyScore,
          procore: proCoreScore,
          team: teamScore,
          meta: metaScore,
          player: playerScore,
        },
      });
    }

    suggestions.sort((a, b) => b.score - a.score);

    // Pick-Reihenfolge: Slot mit der größten Counter-Chance gegen einen
    // bereits bekannten Gegner zuerst (z.B. Gegner zeigt Support -> wir
    // picken Support, um die Lane zu kontern). Ohne Gegner-Info: nach Stärke.
    const enemyKnownInLane = enemyLanes.has(lane);
    const maxCounter = suggestions.reduce(
      (m, s) => Math.max(m, s.parts.counter),
      0,
    );
    const topScore = suggestions[0]?.score ?? 0;
    const pickPriority =
      maxCounter + (enemyKnownInLane ? 0.15 : 0) + 0.05 * topScore;

    slots.push({
      lane,
      suggestions: suggestions.slice(0, CONFIG.TOP_N),
      pickPriority,
      enemyKnownInLane,
    });
  }

  // Slots nach Pick-Priorität sortieren (oben = als Nächstes picken)
  slots.sort((a, b) => b.pickPriority - a.pickPriority);

  return {
    slots,
    scorecard,
    weights: W,
    archetypeProfile,
    strategy,
    strategyAuto,
    proMode,
    proInfo: {
      source: proMeta.source,
      dateFrom: proMeta.dateFrom,
      dateTo: proMeta.dateTo,
      games: proMeta.games,
    },
  };
}
