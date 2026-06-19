// Riot Data Dragon: Champ-Liste, Icons, Patch-Version, Name<->ID-Mapping.
// Liefert auch den Lolalytics-Slug (siehe DATA.md).

import { cached, HOUR } from "./cache";
import type { ChampTag, Champion } from "./types";

const DDRAGON = "https://ddragon.leagueoflegends.com";

// Lolalytics-Slug weicht vom lowercased Anzeigenamen nur in wenigen Fällen ab.
// Key = Data-Dragon-`id`.
const SLUG_EXCEPTIONS: Record<string, string> = {
  Nunu: "nunu", // Anzeigename "Nunu & Willump"
  Renata: "renata", // Anzeigename "Renata Glasc"
};

function toSlug(id: string, name: string): string {
  if (SLUG_EXCEPTIONS[id]) return SLUG_EXCEPTIONS[id];
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function latestVersion(): Promise<string> {
  return cached("ddragon:version", 6 * HOUR, async () => {
    const res = await fetch(`${DDRAGON}/api/versions.json`);
    if (!res.ok) throw new Error(`Data Dragon versions failed: ${res.status}`);
    const versions: string[] = await res.json();
    return versions[0];
  });
}

export interface ChampionIndex {
  version: string;
  byCid: Map<number, Champion>;
  bySlug: Map<string, Champion>;
  all: Champion[];
}

export async function getChampionIndex(): Promise<ChampionIndex> {
  return cached("ddragon:champions", 6 * HOUR, async () => {
    const version = await latestVersion();
    const res = await fetch(
      `${DDRAGON}/cdn/${version}/data/en_US/champion.json`,
    );
    if (!res.ok) throw new Error(`Data Dragon champions failed: ${res.status}`);
    const data = await res.json();

    const byCid = new Map<number, Champion>();
    const bySlug = new Map<string, Champion>();
    const all: Champion[] = [];

    for (const key of Object.keys(data.data)) {
      const c = data.data[key];
      const cid = Number(c.key);
      const champ: Champion = {
        cid,
        id: c.id,
        name: c.name,
        slug: toSlug(c.id, c.name),
        iconUrl: `${DDRAGON}/cdn/${version}/img/champion/${c.image.full}`,
        tags: (c.tags ?? []) as ChampTag[],
        info: c.info,
        attackrange: c.stats?.attackrange ?? 0,
        partype: c.partype ?? "",
      };
      byCid.set(cid, champ);
      bySlug.set(champ.slug, champ);
      all.push(champ);
    }
    all.sort((a, b) => a.name.localeCompare(b.name));
    return { version, byCid, bySlug, all };
  });
}
