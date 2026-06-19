// Team-Comp-Archetypen (Strategie-Ebene) — über die reine Duo-Synergie hinaus.
// Taxonomie nach gängiger LoL-Theorie (Mobalytics/Dignitas):
//   teamfight (inkl. Wombo/AoE-Engage), poke, dive, pick, protect, splitpush.
//
// Jeder Champ bekommt einen Beitrags-Vektor (0..1) je Archetyp. Primär über
// kuratierte Listen (Data-Dragon-`id`), ergänzt um Trait-basierte Fallbacks,
// damit auch nicht gelistete Champs ein Profil haben. Listen sind pflegbar.

import type { Archetype, ChampTraits, Champion } from "./types";

export const ARCHETYPES: Archetype[] = [
  "teamfight",
  "poke",
  "dive",
  "pick",
  "protect",
  "splitpush",
];

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  teamfight: "Teamfight / Wombo",
  poke: "Poke / Siege",
  dive: "Dive",
  pick: "Pick",
  protect: "Protect the Carry",
  splitpush: "Splitpush",
};

// Kuratierte Mitgliedschaften (Data-Dragon-`id`). Mehrfachzuordnung erwünscht.
const SETS: Record<Archetype, Set<string>> = {
  // AoE-Engage / Wombo-Combo: eröffnen oder verstärken 5v5-Teamfights
  teamfight: new Set([
    "Malphite", "Amumu", "Orianna", "Kennen", "Yasuo", "MissFortune", "Sett",
    "Rell", "Galio", "Diana", "Neeko", "Seraphine", "Sona", "Gragas", "Zac",
    "Maokai", "Sejuani", "Leona", "Nautilus", "Alistar", "Wukong", "JarvanIV",
    "Ornn", "Hecarim", "Yone", "Samira", "Rumble", "Vladimir", "Brand", "Zyra",
    "AurelionSol", "KSante", "Annie",
  ]),
  // Poke/Siege: lange Skillshots + Disengage
  poke: new Set([
    "Xerath", "Velkoz", "Zoe", "Jayce", "Caitlyn", "Ezreal", "Lux", "Varus",
    "Ziggs", "Corki", "Nidalee", "Karma", "Janna", "Jhin", "Vex", "Senna",
    "Ashe", "Swain", "Teemo", "Heimerdinger", "Zeri", "Smolder", "Vladimir",
  ]),
  // Dive: Gap-Closer, die die Backline erreichen
  dive: new Set([
    "Camille", "Hecarim", "Diana", "Kennen", "Irelia", "JarvanIV", "Vi",
    "Wukong", "Zac", "Rengar", "Khazix", "Akali", "Kayn", "Pantheon", "Jax",
    "LeeSin", "XinZhao", "Elise", "Nocturne", "Rakan", "Alistar", "Briar",
    "Viego", "Belveth", "Yone", "Naafiri", "Sylas", "Akshan", "Fizz",
  ]),
  // Pick: einzelnes Ziel locken + bursten (Haken/Roots/Stealth/Burst)
  pick: new Set([
    "Thresh", "Blitzcrank", "Pyke", "Ahri", "Morgana", "Nautilus", "Elise",
    "Twitch", "Evelynn", "Leblanc", "Zed", "Talon", "Fizz", "Katarina",
    "Rengar", "Khazix", "Nocturne", "Neeko", "Lissandra", "Skarner", "Warwick",
    "Bard", "TwistedFate", "Veigar", "Syndra", "Vex", "Naafiri",
  ]),
  // Protect the Carry: Peel/Enchanter + Hypercarry
  protect: new Set([
    // Peeler/Enchanter
    "Lulu", "Janna", "Soraka", "Nami", "Yuumi", "Milio", "Karma", "Renata",
    "Sona", "Taric", "Braum", "TahmKench",
    // Hypercarrys
    "Jinx", "KogMaw", "Aphelios", "Twitch", "Vayne", "Kayle", "Zeri",
    "Kindred", "Cassiopeia",
  ]),
  // Splitpush: starke Seitenlane (1v1, Waveclear, Escape, Global)
  splitpush: new Set([
    "Camille", "Fiora", "Jax", "Tryndamere", "Yorick", "Trundle", "Nasus",
    "Sion", "Gangplank", "Tristana", "Quinn", "Jayce", "Kayle", "MasterYi",
    "Olaf", "Shen", "Singed", "Kled", "Riven", "Gwen", "Yone",
  ]),
};

// Trait-basierte Fallbacks, falls ein Champ in keiner Liste steht.
function fallback(t: ChampTraits, a: Archetype): number {
  switch (a) {
    case "teamfight":
      return t.engage && t.hardCC ? 0.5 : t.frontline && t.hardCC ? 0.3 : 0;
    case "dive":
      return t.engage && !t.ranged && t.damageWeight >= 0.6 ? 0.45 : 0;
    case "poke":
      return t.ranged && t.damageWeight >= 0.8 ? 0.35 : 0;
    case "pick":
      return t.hardCC && t.damageWeight >= 0.8 ? 0.35 : 0;
    case "protect":
      return t.primaryClass === "Support" && t.damageWeight <= 0.4 ? 0.5 : 0;
    case "splitpush":
      return !t.ranged && t.damageWeight >= 0.8 && t.primaryClass === "Fighter"
        ? 0.35
        : 0;
  }
}

export function champArchetype(
  champ: Champion,
  traits: ChampTraits,
): Record<Archetype, number> {
  const out = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) {
    out[a] = SETS[a].has(champ.id) ? 1 : fallback(traits, a);
  }
  return out;
}

// Team-Profil = Summe der Mitglieder-Vektoren, normalisiert auf Anteile.
export function teamProfile(
  vectors: Record<Archetype, number>[],
): Record<Archetype, number> {
  const sum = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) sum[a] = 0;
  for (const v of vectors) for (const a of ARCHETYPES) sum[a] += v[a];
  const total = ARCHETYPES.reduce((s, a) => s + sum[a], 0) || 1;
  const out = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) out[a] = sum[a] / total;
  return out;
}

// Dominanten Archetyp bestimmen (oder null, wenn nichts heraussticht).
export function dominantArchetype(
  profile: Record<Archetype, number>,
): Archetype | null {
  let best: Archetype | null = null;
  let max = 0;
  for (const a of ARCHETYPES) {
    if (profile[a] > max) {
      max = profile[a];
      best = a;
    }
  }
  return max > 0 ? best : null;
}
