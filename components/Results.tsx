"use client";

interface ChampRef {
  cid: number;
  name: string;
  slug: string;
  iconUrl: string;
}

interface CommonCounter {
  champ: ChampRef;
  lane: string;
  countersMains: { champ: ChampRef; vsWr: number; n: number }[];
  problemScore: number;
}

interface Recommendation {
  champ: ChampRef;
  lane: string;
  overallWr: number;
  fitScore: number;
  beats: { counter: ChampRef; winVs: number; n: number }[];
}

interface LaneAnalysis {
  lane: string;
  mains: ChampRef[];
  commonCounters: CommonCounter[];
  recommendations: Recommendation[];
}

export interface AnalyzeResult {
  mains: ChampRef[];
  lanes: LaneAnalysis[];
}

const LANE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  support: "Support",
};

function Icon({ c, size = 32 }: { c: ChampRef; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={c.iconUrl}
      alt={c.name}
      title={c.name}
      width={size}
      height={size}
      className="rounded-full"
      style={{ width: size, height: size }}
    />
  );
}

export default function Results({ result }: { result: AnalyzeResult }) {
  if (result.lanes.length === 0) {
    return (
      <p style={{ color: "var(--muted)" }} className="mt-6">
        Keine relevanten Lanes gefunden. Prüfe die Champ-Auswahl oder die
        Filter.
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      {result.lanes.map((la) => (
        <section key={la.lane}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold">
              <span style={{ color: "var(--accent)" }}>
                {LANE_LABELS[la.lane] ?? la.lane}
              </span>
            </h2>
            <div className="flex gap-1">
              {la.mains.map((m) => (
                <Icon key={m.cid} c={m} size={28} />
              ))}
            </div>
          </div>

          {la.commonCounters.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>
              Keine gemeinsamen Counter gefunden — dein Pool ist hier breit
              aufgestellt. 👍
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Gemeinsame Counter */}
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
              >
                <h3 className="font-medium mb-3">Gemeinsame Counter</h3>
                <ul className="space-y-3">
                  {la.commonCounters.map((cc) => (
                    <li key={cc.champ.cid} className="flex items-start gap-3">
                      <Icon c={cc.champ} />
                      <div className="flex-1">
                        <div className="font-medium">{cc.champ.name}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          countert{" "}
                          {cc.countersMains
                            .map(
                              (x) =>
                                `${x.champ.name} (${x.vsWr.toFixed(1)}%)`,
                            )
                            .join(", ")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Empfehlungen */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--accent)",
                }}
              >
                <h3 className="font-medium mb-3">
                  Empfohlen zum Lernen
                </h3>
                {la.recommendations.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Kein klarer Ergänzungs-Champ gefunden.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {la.recommendations.map((r, i) => (
                      <li key={r.champ.cid} className="flex items-start gap-3">
                        <div
                          className="text-sm font-bold w-5 text-center"
                          style={{
                            color: i === 0 ? "var(--accent)" : "var(--muted)",
                          }}
                        >
                          {i + 1}
                        </div>
                        <Icon c={r.champ} />
                        <div className="flex-1">
                          <div className="font-medium flex items-center gap-2">
                            {r.champ.name}
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: "var(--panel-2)",
                                color: "var(--good)",
                              }}
                            >
                              {r.overallWr.toFixed(1)}% WR
                            </span>
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            schlägt{" "}
                            {r.beats
                              .map(
                                (b) =>
                                  `${b.counter.name} (${b.winVs.toFixed(1)}%)`,
                              )
                              .join(", ")}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
