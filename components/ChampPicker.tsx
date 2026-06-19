"use client";

import { useMemo, useState } from "react";

export interface ClientChampion {
  cid: number;
  name: string;
  slug: string;
  iconUrl: string;
}

interface Props {
  champions: ClientChampion[];
  selected: ClientChampion[];
  onChange: (next: ClientChampion[]) => void;
  max?: number;
}

export default function ChampPicker({
  champions,
  selected,
  onChange,
  max = 3,
}: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const selectedSlugs = new Set(selected.map((c) => c.slug));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return champions
      .filter(
        (c) => !selectedSlugs.has(c.slug) && c.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, champions, selected]);

  function add(c: ClientChampion) {
    if (selected.length >= max) return;
    onChange([...selected, c]);
    setQuery("");
  }

  function remove(slug: string) {
    onChange(selected.filter((c) => c.slug !== slug));
  }

  const full = selected.length >= max;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {selected.map((c) => (
          <span
            key={c.slug}
            className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1"
            style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.iconUrl} alt={c.name} className="w-6 h-6 rounded-full" />
            <span className="text-sm">{c.name}</span>
            <button
              onClick={() => remove(c.slug)}
              className="text-xs ml-1"
              style={{ color: "var(--muted)" }}
              aria-label={`${c.name} entfernen`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={
            full ? `Maximal ${max} Champs` : "Champion suchen…"
          }
          disabled={full}
          className="w-full rounded-lg px-3 py-2 outline-none disabled:opacity-50"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        {focused && matches.length > 0 && (
          <ul
            className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden shadow-xl"
            style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          >
            {matches.map((c) => (
              <li key={c.slug}>
                <button
                  onMouseDown={() => add(c)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[var(--panel-2)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.iconUrl}
                    alt={c.name}
                    className="w-7 h-7 rounded-full"
                  />
                  <span className="text-sm">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
