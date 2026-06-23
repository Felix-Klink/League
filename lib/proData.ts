// Loader für die vorberechneten Pro-Daten (lib/data/proData.json).
// Quelle: Oracle's Elixir (per scripts/build-pro-data.mjs gebaut) — gebündelt,
// kein Live-Call, kein Rate-Limit. Neu bauen, wenn eine neue CSV vorliegt.

import raw from "./data/proData.json";
import type { Archetype, Lane } from "./types";

interface CoreEntry {
  cid: number;
  lift: number;
  count: number;
}
interface PickEntry {
  total: number;
  byLane: Partial<Record<Lane, number>>;
}
interface ProDataShape {
  meta: { source: string; games: number; dateFrom: string; dateTo: string; ddVersion: string; builtAt: string };
  totalComps: number;
  picks: Record<string, PickEntry>;
  maxPickLane: number;
  cores: Record<string, CoreEntry[]>;
  archetypes: { raw: Record<Archetype, number>; normalized: Record<Archetype, number> };
}

const data = raw as unknown as ProDataShape;

export const proMeta = data.meta;
export const proArchetypePrior = data.archetypes.normalized;

/** Pro-Pick-Stärke eines Champs in einer Lane, 0..1 (relativ zum Maximum). */
export function proPickScore(cid: number, lane: Lane): number {
  const p = data.picks[String(cid)];
  if (!p) return 0;
  const n = p.byLane[lane] ?? 0;
  return Math.min(1, n / (data.maxPickLane || 1));
}

/** Wird der Champ in dieser Lane überhaupt von Pros gespielt? */
export function proPlayed(cid: number, lane: Lane): boolean {
  return (data.picks[String(cid)]?.byLane[lane] ?? 0) > 0;
}

/**
 * Lane-Verteilung eines Champs als Anteile (0..1), normalisiert über seine
 * Pro-Picks. Leeres Objekt, wenn keine Daten vorliegen. Basis für die
 * automatische Lane-Zuordnung im Live-Champ-Select.
 */
export function laneShares(cid: number): Partial<Record<Lane, number>> {
  const p = data.picks[String(cid)];
  if (!p) return {};
  const total = Object.values(p.byLane).reduce((a, b) => a + (b ?? 0), 0);
  if (!total) return {};
  const out: Partial<Record<Lane, number>> = {};
  for (const [lane, n] of Object.entries(p.byLane))
    out[lane as Lane] = (n ?? 0) / total;
  return out;
}

/** Lift eines Pro-Cores zwischen zwei Champs (0 wenn kein verlässliches Paar). */
export function coreLift(a: number, b: number): number {
  const list = data.cores[String(a)];
  if (!list) return 0;
  const hit = list.find((c) => c.cid === b);
  return hit ? hit.lift : 0;
}
