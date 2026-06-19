"use client";

export interface Scorecard {
  adShare: number;
  apShare: number;
  hasEngage: boolean;
  frontlineCount: number;
  hardCCCount: number;
  rangedCount: number;
  meleeCount: number;
  hasHypercarry: boolean;
  carryCount: number;
  notes: string[];
}

// Eine Bedarf-Zeile: Label, Ist-Wert, ob erfüllt, kurzer Hinweis
function NeedRow({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: ok ? "var(--good)" : "var(--danger)" }}
      />
      <span className="text-sm w-24">{label}</span>
      <span className="text-sm font-medium w-20" style={{ color: ok ? "var(--good)" : "var(--danger)" }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}

export default function CompScorecard({ sc }: { sc: Scorecard }) {
  const total = sc.rangedCount + sc.meleeCount || 1;
  const rangedPct = Math.round((sc.rangedCount / total) * 100);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-medium">Comp-Scorecard</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          nur gepickte Champs · Schaden nach Beitrag gewichtet
        </span>
      </div>

      {/* Damage balance bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: "#e08e45" }}>AD {sc.adShare}%</span>
          <span style={{ color: "#4aa3e0" }}>AP {sc.apShare}%</span>
        </div>
        <div
          className="h-2.5 rounded-full overflow-hidden flex"
          style={{ background: "var(--panel-2)" }}
        >
          <div style={{ width: `${sc.adShare}%`, background: "#e08e45" }} />
          <div style={{ width: `${sc.apShare}%`, background: "#4aa3e0" }} />
        </div>
      </div>

      {/* Bedarf-Zeilen mit Ziel */}
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <NeedRow
          label="Engage"
          value={sc.hasEngage ? "vorhanden" : "fehlt"}
          ok={sc.hasEngage}
          hint="Ziel: ≥ 1 verlässlicher Initiator"
        />
        <NeedRow
          label="Frontline"
          value={`${sc.frontlineCount}`}
          ok={sc.frontlineCount >= 1}
          hint="Ziel: ≥ 1 Tank/Frontline"
        />
        <NeedRow
          label="Hard-CC"
          value={`${sc.hardCCCount}`}
          ok={sc.hardCCCount >= 2}
          hint="Ziel: ≥ 2 verlässliche CC-Quellen"
        />
        <NeedRow
          label="Win-Condition"
          value={sc.hasHypercarry ? "vorhanden" : "fehlt"}
          ok={sc.hasHypercarry}
          hint="Ziel: ≥ 1 skalierender Carry (Late-Game-Plan)"
        />
        <NeedRow
          label="Schaden"
          value={`${sc.carryCount} Carrys`}
          ok={sc.carryCount >= 2}
          hint="Ziel: ≥ 2 echte Schadensquellen"
        />
      </div>

      {/* Range/Melee Mini-Bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
          <span>Range {sc.rangedCount}</span>
          <span>Melee {sc.meleeCount}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "var(--panel-2)" }}>
          <div style={{ width: `${rangedPct}%`, background: "#7c9cc4" }} />
          <div style={{ width: `${100 - rangedPct}%`, background: "#9c7c5a" }} />
        </div>
      </div>

      {sc.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {sc.notes.map((n) => (
            <li key={n} className="text-xs" style={{ color: "var(--danger)" }}>
              ⚠ {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
