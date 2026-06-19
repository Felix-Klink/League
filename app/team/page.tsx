"use client";

import { useEffect, useMemo, useState } from "react";
import ChampPicker, { type ClientChampion } from "@/components/ChampPicker";
import CompScorecard, { type Scorecard } from "@/components/CompScorecard";

type Lane = "top" | "jungle" | "middle" | "bottom" | "support";
const LANES: { key: Lane; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "jungle", label: "Jungle" },
  { key: "middle", label: "Mid" },
  { key: "bottom", label: "Bot" },
  { key: "support", label: "Support" },
];

const TIERS = [
  { value: "emerald_plus", label: "Emerald+" },
  { value: "platinum_plus", label: "Platinum+" },
  { value: "diamond_plus", label: "Diamond+" },
  { value: "master_plus", label: "Master+" },
  { value: "challenger", label: "Challenger" },
  { value: "all", label: "Alle Ränge" },
];

interface AllyState {
  lane: Lane;
  locked: ClientChampion | null;
  mains: ClientChampion[];
  poolOnly: boolean;
}
interface EnemyState {
  champ: ClientChampion;
  lane: Lane | "";
}

type Archetype =
  | "teamfight"
  | "poke"
  | "dive"
  | "pick"
  | "protect"
  | "splitpush";

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  teamfight: "Teamfight / Wombo",
  poke: "Poke / Siege",
  dive: "Dive",
  pick: "Pick",
  protect: "Protect the Carry",
  splitpush: "Splitpush",
};

const STRATEGIES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto (aus Picks erkennen)" },
  { value: "teamfight", label: "Teamfight / Wombo" },
  { value: "poke", label: "Poke / Siege" },
  { value: "dive", label: "Dive" },
  { value: "pick", label: "Pick" },
  { value: "protect", label: "Protect the Carry" },
  { value: "splitpush", label: "Splitpush" },
];

interface Reason {
  kind:
    | "comp"
    | "counter"
    | "synergy"
    | "procore"
    | "team"
    | "meta"
    | "pro"
    | "player";
  label: string;
}
interface Parts {
  counter: number;
  comp: number;
  synergy: number;
  procore: number;
  team: number;
  meta: number;
  player: number;
}
interface Suggestion {
  cid: number;
  score: number;
  fromPool: boolean;
  learn: boolean;
  reasons: Reason[];
  parts: Parts;
}
interface SlotResult {
  lane: Lane;
  suggestions: Suggestion[];
  pickPriority: number;
  enemyKnownInLane: boolean;
}
interface Weights {
  counter: number;
  comp: number;
  synergy: number;
  procore: number;
  team: number;
  meta: number;
  player: number;
}
interface Result {
  slots: SlotResult[];
  scorecard: Scorecard;
  weights: Weights;
  archetypeProfile: Record<Archetype, number>;
  strategy: Archetype | null;
  strategyAuto: boolean;
  proMode: boolean;
  proInfo: { source: string; dateFrom: string; dateTo: string; games: number };
}

// Erklärung der vier Bewertungs-Kriterien
const CRITERIA: { key: keyof Parts; label: string; color: string; desc: string }[] = [
  { key: "counter", label: "Counter", color: "#e5484d", desc: "Wie gut der Champ die bekannten Gegner schlägt (direkter Lane-Gegner zählt stärker)." },
  { key: "comp", label: "Comp-Fit", color: "#c8aa6e", desc: "Füllt fehlende Bedarfe: AD/AP-Schaden, Engage, Frontline, Hard-CC." },
  { key: "synergy", label: "Duo-Synergie", color: "#3fbfb0", desc: "Paarweise Synergie mit den Allies (inkl. deren Mains): Lolalytics Synergy Delta. 0.5 = neutral." },
  { key: "procore", label: "Pro-Core", color: "#5ad1ff", desc: "Bildet der Champ mit einem Ally ein echtes Pro-Comp-Duo (Co-Occurrence-Lift aus Pro-Spielen)? Der direkte Hebel zu echten Pro-Comps." },
  { key: "team", label: "Team-Strategie", color: "#e0a64a", desc: "Wie stark der Champ die Gesamt-Comp-Strategie (Teamfight/Poke/Dive/Pick/Protect/Splitpush) vorantreibt." },
  { key: "meta", label: "Meta + Pro", color: "#46c93a", desc: "Winrate über Durchschnitt (Lolalytics) + Pro-Pick-Häufigkeit (Leaguepedia)." },
  { key: "player", label: "Spieler-Pool", color: "#b07be0", desc: "Bonus, wenn der Champ ein Main des Spielers ist." },
];

const REASON_COLOR: Record<Reason["kind"], string> = {
  counter: "#e5484d",
  comp: "#c8aa6e",
  synergy: "#3fbfb0",
  procore: "#5ad1ff",
  team: "#e0a64a",
  meta: "#46c93a",
  pro: "#4aa3e0",
  player: "#b07be0",
};

export default function TeamPage() {
  const [champions, setChampions] = useState<ClientChampion[]>([]);
  const [allies, setAllies] = useState<AllyState[]>(
    LANES.map((l) => ({ lane: l.key, locked: null, mains: [], poolOnly: false })),
  );
  const [enemies, setEnemies] = useState<EnemyState[]>([]);
  const [tier, setTier] = useState("emerald_plus");
  const [strategy, setStrategy] = useState("auto");
  const [proMode, setProMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []))
      .catch(() => setError("Champion-Liste konnte nicht geladen werden."));
  }, []);

  const byCid = useMemo(() => {
    const m = new Map<number, ClientChampion>();
    champions.forEach((c) => m.set(c.cid, c));
    return m;
  }, [champions]);

  function setAlly(i: number, patch: Partial<AllyState>) {
    setAllies((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }
  function addEnemy(c: ClientChampion) {
    setEnemies((prev) =>
      prev.some((e) => e.champ.cid === c.cid) ? prev : [...prev, { champ: c, lane: "" }],
    );
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/teamcomp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          patch: 30,
          strategy,
          proMode,
          allies: allies.map((a) => ({
            lane: a.lane,
            lockedCid: a.locked?.cid ?? null,
            mains: a.mains.map((m) => m.cid),
            poolOnly: a.poolOnly,
          })),
          enemies: enemies.map((e) => ({ cid: e.champ.cid, lane: e.lane || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analyse fehlgeschlagen.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-5 py-8">
      <h1 className="text-3xl font-bold mb-1">
        Team <span style={{ color: "var(--accent)" }}>Comp Builder</span>
      </h1>
      <p style={{ color: "var(--muted)" }} className="mb-6">
        Trag eure Picks, Spieler-Mains und die bekannten Gegner ein. Für jeden
        offenen Slot werden Champs vorgeschlagen, die die Comp ergänzen, gegen
        die Gegner stark sind und im Meta/Pro gut dastehen.
      </p>

      {/* Ally board */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
      >
        <h2 className="font-medium mb-3">Euer Team</h2>
        <div className="space-y-4">
          {allies.map((a, i) => (
            <div
              key={a.lane}
              className="grid md:grid-cols-[70px_1fr_1fr_auto] gap-3 items-start pb-4"
              style={{ borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}
            >
              <div
                className="text-sm font-semibold pt-2"
                style={{ color: "var(--accent)" }}
              >
                {LANES[i].label}
              </div>

              <div>
                <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
                  Gepickt
                </div>
                <ChampPicker
                  champions={champions}
                  selected={a.locked ? [a.locked] : []}
                  onChange={(arr) => setAlly(i, { locked: arr[arr.length - 1] ?? null })}
                  max={1}
                />
              </div>

              <div>
                <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
                  Mains des Spielers
                </div>
                <ChampPicker
                  champions={champions}
                  selected={a.mains}
                  onChange={(arr) => setAlly(i, { mains: arr })}
                  max={7}
                />
              </div>

              <label
                className="flex items-center gap-2 text-xs pt-2 whitespace-nowrap"
                style={{ color: "var(--muted)" }}
              >
                <input
                  type="checkbox"
                  checked={a.poolOnly}
                  onChange={(e) => setAlly(i, { poolOnly: e.target.checked })}
                />
                nur Pool
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Enemy board */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
      >
        <h2 className="font-medium mb-3">Bekannte Gegner</h2>
        <ChampPicker
          champions={champions}
          selected={[]}
          onChange={(arr) => arr[0] && addEnemy(arr[0])}
          max={1}
        />
        {enemies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {enemies.map((e, i) => (
              <span
                key={e.champ.cid}
                className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1"
                style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.champ.iconUrl} alt={e.champ.name} className="w-6 h-6 rounded-full" />
                <span className="text-sm">{e.champ.name}</span>
                <select
                  value={e.lane}
                  onChange={(ev) =>
                    setEnemies((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, lane: ev.target.value as Lane | "" } : x,
                      ),
                    )
                  }
                  className="text-xs rounded px-1 py-0.5"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <option value="">Lane?</option>
                  {LANES.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setEnemies((prev) => prev.filter((_, j) => j !== i))}
                  style={{ color: "var(--muted)" }}
                  aria-label="entfernen"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-2">
        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
            Rang
          </label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="rounded-lg px-3 py-2"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>
            Team-Strategie
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="rounded-lg px-3 py-2"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <label
          className="flex items-center gap-2 text-sm pb-2.5 cursor-pointer"
          style={{ color: proMode ? "var(--accent)" : "var(--muted)" }}
          title="Höhere Gewichtung von Synergie/Strategie/Meta + High-Elo-Tier (näher an Pro-Drafts)"
        >
          <input type="checkbox" checked={proMode} onChange={(e) => setProMode(e.target.checked)} />
          Pro-Modus
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg px-5 py-2.5 font-semibold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#1a1205" }}
        >
          {loading ? "Berechne…" : "Vorschläge berechnen"}
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          {/* Team-Strategie + Archetyp-Profil */}
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-medium">Team-Strategie</h3>
              <span className="text-sm">
                {result.strategy ? (
                  <span style={{ color: "#e0a64a" }}>
                    {ARCHETYPE_LABELS[result.strategy]}
                    {result.strategyAuto && (
                      <span style={{ color: "var(--muted)" }}> (erkannt)</span>
                    )}
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>
                    noch keine — Champs picken oder Strategie wählen
                  </span>
                )}
              </span>
            </div>
            <div className="space-y-1.5">
              {(Object.keys(ARCHETYPE_LABELS) as Archetype[])
                .map((a) => ({ a, v: result.archetypeProfile[a] ?? 0 }))
                .sort((x, y) => y.v - x.v)
                .map(({ a, v }) => (
                  <div key={a} className="flex items-center gap-2">
                    <span className="text-xs w-32" style={{ color: "var(--muted)" }}>
                      {ARCHETYPE_LABELS[a]}
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
                      <div
                        style={{
                          width: `${Math.round(v * 100)}%`,
                          height: "100%",
                          background: a === result.strategy ? "#e0a64a" : "#5a6472",
                        }}
                      />
                    </div>
                    <span className="text-xs tabular-nums w-9 text-right" style={{ color: "var(--muted)" }}>
                      {Math.round(v * 100)}%
                    </span>
                  </div>
                ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
              Profil, Synergie & Pro-Cores basieren auf den <strong>gepickten</strong>{" "}
              Champs. Pro-Cores aus {result.proInfo.source} (
              {result.proInfo.games.toLocaleString("de")} Comps,{" "}
              {result.proInfo.dateFrom?.slice(0, 10)}–
              {result.proInfo.dateTo?.slice(0, 10)})
              {result.proMode && (
                <span style={{ color: "var(--accent)" }}> · Pro-Modus aktiv</span>
              )}
              .
            </p>
          </div>

          <CompScorecard sc={result.scorecard} />

          {/* Kriterien-Legende */}
          <div
            className="rounded-xl p-4"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            <h3 className="font-medium mb-2">So wird bewertet</h3>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              Gesamt-Score = Summe aus vier Kriterien, jeweils (Roh-Wert 0–1 ×
              Gewicht). Klick „Wie berechnet?" bei einem Vorschlag für die
              Aufschlüsselung.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {CRITERIA.map((c) => (
                <div key={c.key} className="flex items-start gap-2">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                    style={{ background: "var(--panel-2)", color: c.color }}
                  >
                    {c.label} ×{result.weights[c.key].toFixed(1)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {c.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {result.slots.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              Keine offenen Slots — trag mindestens eine Lane ohne Pick ein.
            </p>
          ) : (
            <>
              {/* "Als Nächstes picken"-Banner */}
              {result.slots[0]?.suggestions[0] &&
                (() => {
                  const top = result.slots[0];
                  const champ = byCid.get(top.suggestions[0].cid);
                  const laneLabel = LANES.find((l) => l.key === top.lane)?.label;
                  return (
                    <div
                      className="rounded-xl p-3 flex items-center gap-3 flex-wrap"
                      style={{ background: "var(--panel-2)", border: "1px solid var(--accent)" }}
                    >
                      <span className="text-sm" style={{ color: "var(--muted)" }}>
                        👉 Als Nächstes picken:
                      </span>
                      <span className="font-semibold" style={{ color: "var(--accent)" }}>
                        {laneLabel}
                      </span>
                      {champ && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={champ.iconUrl} alt={champ.name} className="w-8 h-8 rounded-full" />
                      )}
                      <span className="font-semibold">{champ?.name}</span>
                      {top.enemyKnownInLane && (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          · kontert bekannten Gegner in dieser Lane
                        </span>
                      )}
                    </div>
                  );
                })()}

              {result.slots.map((s, si) => (
              <section
                key={s.lane}
                className="rounded-xl p-4"
                style={{ background: "var(--panel)", border: si === 0 ? "1px solid var(--accent)" : "1px solid var(--border)" }}
              >
                <h3 className="font-semibold mb-3 flex items-center gap-2 flex-wrap">
                  <span style={{ color: "var(--accent)" }}>
                    {LANES.find((l) => l.key === s.lane)?.label}
                  </span>
                  {si === 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: "var(--accent)", color: "#1a1205" }}
                    >
                      als Nächstes
                    </span>
                  )}
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>— Vorschläge</span>
                </h3>
                {s.suggestions.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Keine passenden Kandidaten gefunden.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {s.suggestions.map((g, i) => {
                      const champ = byCid.get(g.cid);
                      const key = `${s.lane}:${g.cid}`;
                      const open = expanded === key;
                      return (
                        <li
                          key={g.cid}
                          className="rounded-lg"
                          style={{ background: open ? "var(--panel-2)" : "transparent" }}
                        >
                          <div className="flex items-center gap-3 p-1">
                            <span
                              className="w-5 text-center text-sm font-bold"
                              style={{ color: i === 0 ? "var(--accent)" : "var(--muted)" }}
                            >
                              {i + 1}
                            </span>
                            {champ && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={champ.iconUrl} alt={champ.name} className="w-9 h-9 rounded-full" />
                            )}
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-2 flex-wrap">
                                {champ?.name ?? g.cid}
                                {g.fromPool && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--panel)", color: "#b07be0" }}>
                                    Main
                                  </span>
                                )}
                                {g.learn && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--panel)", color: "var(--muted)" }}>
                                    zum Lernen
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {g.reasons.map((r, k) => (
                                  <span
                                    key={k}
                                    className="text-xs px-1.5 py-0.5 rounded"
                                    style={{ background: "var(--panel-2)", color: REASON_COLOR[r.kind] }}
                                  >
                                    {r.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums">
                                {g.score.toFixed(2)}
                              </div>
                              <button
                                onClick={() => setExpanded(open ? null : key)}
                                className="text-xs"
                                style={{ color: "var(--accent)" }}
                              >
                                {open ? "schließen" : "Wie berechnet?"}
                              </button>
                            </div>
                          </div>

                          {open && (
                            <div className="px-3 pb-3 pt-1">
                              <table className="w-full text-xs">
                                <tbody>
                                  {CRITERIA.map((c) => {
                                    const raw = g.parts[c.key];
                                    const w = result.weights[c.key];
                                    return (
                                      <tr key={c.key}>
                                        <td className="py-1 pr-2" style={{ color: c.color, width: 90 }}>
                                          {c.label}
                                        </td>
                                        <td className="py-1 pr-2" style={{ width: "50%" }}>
                                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--panel)" }}>
                                            <div style={{ width: `${Math.min(100, raw * 100)}%`, height: "100%", background: c.color }} />
                                          </div>
                                        </td>
                                        <td className="py-1 tabular-nums text-right" style={{ color: "var(--muted)" }}>
                                          {raw.toFixed(2)} × {w.toFixed(1)} = {(raw * w).toFixed(2)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                                    <td className="pt-2 font-semibold">Summe</td>
                                    <td></td>
                                    <td className="pt-2 font-semibold tabular-nums text-right">
                                      {g.score.toFixed(2)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  );
}
