// Leitet Kompositions-Attribute pro Champ ab.
//
// - damageType / ranged / frontline: automatisch aus Data-Dragon-Feldern.
// - engage / hardCC: aus kuratierten Listen unten — Data Dragon liefert das
//   nicht. Die Listen sind bewusst pflegbar: bei Bedarf Champ-ID ergänzen.
//   Keys = Data-Dragon-`id` (stabil, z.B. "MonkeyKing", "JarvanIV").

import type { ChampTag, ChampTraits, Champion, DamageType } from "./types";

// Verlässlicher Engage / Initiator (kann Kämpfe von sich aus eröffnen)
export const ENGAGE_IDS = new Set<string>([
  "Malphite", "Leona", "Nautilus", "Alistar", "Rakan", "Zac", "Amumu",
  "Sejuani", "Rell", "Ornn", "Maokai", "Hecarim", "JarvanIV", "Gragas",
  "Vi", "MonkeyKing", "Kennen", "Galio", "Sett", "Nocturne", "Camille",
  "Skarner", "Rammus", "Volibear", "Pantheon", "Shen", "Kled", "Sion",
  "Diana", "Lissandra", "Neeko", "Wukong", "Warwick", "XinZhao", "Elise",
  "Jarvan", "Zyra", "Ashe", "Pyke", "Renata", "Thresh", "Blitzcrank",
]);

// Verlässliches Hard-CC (Stun/Root/Knockup/Suppress/Charm/Fear/Polymorph)
export const HARDCC_IDS = new Set<string>([
  "Leona", "Nautilus", "Morgana", "Lux", "Ahri", "Annie", "Lissandra",
  "Sejuani", "Amumu", "Malphite", "Ashe", "Varus", "Jhin", "Thresh",
  "Blitzcrank", "Pyke", "Rakan", "Nami", "Sona", "Zoe", "Veigar", "Syndra",
  "TwistedFate", "Neeko", "Skarner", "Warwick", "Maokai", "Sett", "Rell",
  "Galio", "Diana", "Vi", "Camille", "Elise", "Cassiopeia", "Brand",
  "Zyra", "Swain", "Velkoz", "Xerath", "Lulu", "Janna", "Alistar",
  "Nocturne", "Sion", "Kennen", "Gragas", "JarvanIV", "Volibear", "Ornn",
  "Rammus", "Taliyah", "Lillia", "Hecarim", "Renata", "Nidalee", "Poppy",
  "Gnar", "Jax", "Vex", "Ksante", "Mordekaiser",
]);

// Wie viel echten (anhaltenden) Schaden trägt der Champ zur Comp bei?
// Tanks und Enchanter-Supports machen kaum Schaden (wenn, dann nur früh) und
// füllen daher AD/AP-Lücken NICHT richtig. Marksmen/Mages/Assassinen sind die
// echten Schadensträger.
function deriveDamageWeight(tags: ChampTag[]): number {
  const primary = tags[0];
  // Tank-primär = kaum Schaden (wenn, dann nur früh).
  if (primary === "Tank") return 0.25;
  // Support-primär = Enchanter/Catcher (Soraka, Lulu, Janna, Thresh ...) —
  // wenig Schaden, AUCH wenn DDragon zusätzlich "Mage" taggt. Echte
  // Schadens-Mage-Supports (Zyra, Lux, Brand) sind dagegen Mage-primär.
  if (primary === "Support") return 0.35;
  if (primary === "Marksman" || primary === "Mage" || primary === "Assassin")
    return 1.0;
  if (primary === "Fighter") return tags.includes("Tank") ? 0.6 : 0.85;
  return 0.6;
}

// Skalierende Win-Conditions / Hypercarrys (Late-Game-Carry). Pflegbar.
export const HYPERCARRY_IDS = new Set<string>([
  "Jinx", "KogMaw", "Aphelios", "Vayne", "Twitch", "Zeri", "Kindred",
  "Smolder", "Tristana", "Kayle", "Kassadin", "Veigar", "Azir", "Viktor",
  "Cassiopeia", "Vladimir", "Nasus", "AurelionSol", "Ryze", "Jax", "Senna",
  "Yunara", "Aurora",
]);

function deriveDamageType(tags: ChampTag[], info: Champion["info"]): DamageType {
  const apScore =
    info.magic +
    (tags.includes("Mage") ? 3 : 0) +
    (tags.includes("Support") && !tags.includes("Marksman") ? 1 : 0);
  const adScore =
    info.attack +
    (tags.includes("Marksman") ? 3 : 0) +
    (tags.includes("Fighter") ? 1 : 0) +
    (tags.includes("Assassin") ? 1 : 0);
  if (adScore - apScore >= 2) return "AD";
  if (apScore - adScore >= 2) return "AP";
  return "Hybrid";
}

export function deriveTraits(champ: Champion): ChampTraits {
  const ranged = champ.attackrange > 300;
  const frontline =
    champ.tags.includes("Tank") || champ.info.defense >= 7;
  const damageWeight = deriveDamageWeight(champ.tags);
  return {
    cid: champ.cid,
    damageType: deriveDamageType(champ.tags, champ.info),
    damageWeight,
    dealsDamage: damageWeight >= 0.6,
    ranged,
    frontline,
    engage: ENGAGE_IDS.has(champ.id),
    hardCC: HARDCC_IDS.has(champ.id),
    hypercarry: HYPERCARRY_IDS.has(champ.id),
    primaryClass: champ.tags[0] ?? "Fighter",
  };
}
