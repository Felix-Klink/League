"use client";

import { useEffect, useState } from "react";
import ChampPicker, { type ClientChampion } from "@/components/ChampPicker";
import Results, { type AnalyzeResult } from "@/components/Results";

const TIERS = [
  { value: "emerald_plus", label: "Emerald+" },
  { value: "platinum_plus", label: "Platinum+" },
  { value: "diamond_plus", label: "Diamond+" },
  { value: "emerald", label: "Emerald" },
  { value: "all", label: "Alle Ränge" },
];

const LANES = [
  { value: "", label: "Egal (alle Lanes)" },
  { value: "top", label: "Top" },
  { value: "jungle", label: "Jungle" },
  { value: "middle", label: "Mid" },
  { value: "bottom", label: "Bot" },
  { value: "support", label: "Support" },
];

export default function Home() {
  const [champions, setChampions] = useState<ClientChampion[]>([]);
  const [selected, setSelected] = useState<ClientChampion[]>([]);
  const [tier, setTier] = useState("emerald_plus");
  const [lane, setLane] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/champions")
      .then((r) => r.json())
      .then((d) => setChampions(d.champions ?? []))
      .catch(() => setError("Champion-Liste konnte nicht geladen werden."));
  }, []);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainSlugs: selected.map((c) => c.slug),
          tier,
          patch: 30,
          preferredLane: lane || null,
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

  const canRun = selected.length >= 2 && selected.length <= 3 && !loading;

  return (
    <main className="max-w-4xl mx-auto px-5 py-10">
      <h1 className="text-3xl font-bold mb-1">
        LoL <span style={{ color: "var(--accent)" }}>Pool-Gap Finder</span>
      </h1>
      <p style={{ color: "var(--muted)" }} className="mb-8">
        Gib 2–3 Main-Champs ein. Wir finden ihre gemeinsamen Counter und
        empfehlen einen Champ, der genau diese Lücke schließt.
      </p>

      <div
        className="rounded-xl p-5 mb-2"
        style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
      >
        <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
          Deine Main-Champs (2–3)
        </label>
        <ChampPicker
          champions={champions}
          selected={selected}
          onChange={setSelected}
        />

        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <div>
            <label
              className="block text-sm mb-1"
              style={{ color: "var(--muted)" }}
            >
              Rang
            </label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full rounded-lg px-3 py-2"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm mb-1"
              style={{ color: "var(--muted)" }}
            >
              Bevorzugte Lane
            </label>
            <select
              value={lane}
              onChange={(e) => setLane(e.target.value)}
              className="w-full rounded-lg px-3 py-2"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {LANES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={!canRun}
          className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold disabled:opacity-40 transition"
          style={{ background: "var(--accent)", color: "#1a1205" }}
        >
          {loading ? "Analysiere…" : "Pool analysieren"}
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {result && <Results result={result} />}
    </main>
  );
}
