// Gemeinsame Typen für die App

export type Lane = "top" | "jungle" | "middle" | "bottom" | "support";
export const LANES: Lane[] = ["top", "jungle", "middle", "bottom", "support"];

// Team-Comp-Archetypen (Strategie-Ebene) — Definitionen in lib/archetypes.ts
export type Archetype =
  | "teamfight"
  | "poke"
  | "dive"
  | "pick"
  | "protect"
  | "splitpush";

export const LANE_LABELS: Record<Lane, string> = {
  top: "Top",
  jungle: "Jungle",
  middle: "Mid",
  bottom: "Bot",
  support: "Support",
};

// Erlaubte Tier-Werte (siehe DATA.md)
export type Tier =
  | "all"
  | "emerald"
  | "emerald_plus"
  | "platinum_plus"
  | "diamond_plus"
  | "master_plus"
  | "grandmaster"
  | "challenger";

export const TIER_LABELS: Record<Tier, string> = {
  all: "Alle Ränge",
  emerald: "Emerald",
  emerald_plus: "Emerald+",
  platinum_plus: "Platinum+",
  diamond_plus: "Diamond+",
  master_plus: "Master+",
  grandmaster: "Grandmaster",
  challenger: "Challenger",
};

// Champion-Klassen-Tags von Data Dragon
export type ChampTag =
  | "Fighter"
  | "Tank"
  | "Mage"
  | "Assassin"
  | "Marksman"
  | "Support";

// Ein Champion aus Data Dragon
export interface Champion {
  cid: number; // Riot numeric id (key)
  id: string; // Data Dragon id, z.B. "MonkeyKing"
  name: string; // Anzeigename, z.B. "Wukong"
  slug: string; // Lolalytics-Slug, z.B. "wukong"
  iconUrl: string;
  tags: ChampTag[]; // z.B. ["Mage","Assassin"]
  info: { attack: number; defense: number; magic: number; difficulty: number };
  attackrange: number;
  partype: string; // Mana / Energy / None ...
}

// Abgeleitete Kompositions-Attribute eines Champs (siehe lib/champTraits.ts)
export type DamageType = "AD" | "AP" | "Hybrid";

export interface ChampTraits {
  cid: number;
  damageType: DamageType;
  damageWeight: number; // 0..1: wie viel echten (Dauer-)Schaden der Champ beiträgt
  dealsDamage: boolean; // primärer Schadensträger (Tanks/Enchanter = false)
  ranged: boolean;
  frontline: boolean; // taugt als Frontline/Tank
  engage: boolean; // verlässlicher Engage/Initiator
  hardCC: boolean; // verlässliches Hard-CC
  hypercarry: boolean; // skalierende Win-Condition (Late-Game-Carry)
  primaryClass: ChampTag;
}

// Ein rohes Matchup aus dem Lolalytics counter-Endpunkt
export interface Matchup {
  cid: number; // Gegner-Champion-ID
  vsWr: number; // Winrate MEINES Champs gegen diesen Gegner
  n: number; // Anzahl Games des Matchups
  allWr: number; // Gesamt-Winrate des Gegners
  defaultLane: Lane;
}

// Aufbereitete Counter-Daten für (Champ, Lane)
export interface ChampLaneData {
  cid: number;
  lane: Lane;
  wr: number; // Champ-Winrate in dieser Lane
  pr: number; // Pickrate %
  laneShare: number; // Anteil dieser Lane an den Games des Champs (%)
  estGames: number; // geschätzte Games des Champs in dieser Lane
  matchups: Matchup[];
}

// Synergie-Eintrag aus ep=build-team (Champ + Teammate)
export interface SynergyRow {
  cid: number; // Teammate-Champion-ID
  wr: number; // Winrate zusammen
  d1: number; // Synergy Delta (WR zusammen − Ø beider Einzel-WR)
  d2: number; // Normalised Synergy Delta
  pr: number; // Pickrate des Paares (Common Teammates)
  n: number; // Games des Paares
}
// Synergie eines Champs mit Teammates, gruppiert nach Teammate-Lane
export type SynergyByLane = Partial<Record<Lane, Map<number, SynergyRow>>>;

// Meta-Eintrag aus dem Lolalytics ep=list (Tierlist) pro Champ/Lane
export interface MetaEntry {
  cid: number;
  lane: Lane;
  wr: number;
  avgWrDelta: number; // Winrate über/unter Durchschnitt
  pr: number; // Pickrate %
  br: number; // Banrate %
  tier: number; // 1 (S+) .. höher = schlechter
  games: number;
  pctLane: number; // % der Games des Champs, die in DIESER Lane sind
}

// ---- Team Comp Builder ----------------------------------------------------

// Ein Slot im eigenen Team
export interface AllySlot {
  lane: Lane;
  lockedCid: number | null; // bereits gepickter Champ (oder null = offen)
  mains: number[]; // Champ-Pool des Spielers (cids)
  poolOnly: boolean; // true => nur eigener Pool vorschlagen
}

// Ein bekannter Gegner-Pick
export interface EnemyPick {
  cid: number;
  lane: Lane | null; // optional zugeordnet
}

export interface TeamCompInput {
  allies: AllySlot[];
  enemies: EnemyPick[];
  tier: Tier;
  patch: number;
  strategy?: Archetype | "auto"; // Ziel-Strategie; "auto" = aus Allies erkennen
  proMode?: boolean; // Pro-Modus: höhere Synergie-/Team-/Meta-Gewichte
}

// Begründungs-Chip für einen Vorschlag
export interface Reason {
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

export interface SlotSuggestion {
  cid: number;
  score: number;
  fromPool: boolean; // im Pool des Spielers?
  learn: boolean; // Off-Pool-Lernvorschlag?
  reasons: Reason[];
  // Teil-Scores (für Transparenz/Debug)
  parts: {
    counter: number;
    comp: number;
    synergy: number;
    procore: number;
    team: number;
    meta: number;
    player: number;
  };
}

export interface SlotResult {
  lane: Lane;
  suggestions: SlotSuggestion[];
  pickPriority: number; // höher = sollte eher (als Nächstes) gepickt werden
  enemyKnownInLane: boolean; // direkter Gegner dieser Lane bereits bekannt?
}

// Kompositions-Bewertung der (Teil-)Comp
export interface CompScorecard {
  adShare: number; // % AD am Schaden (grob, gleichgewichtet)
  apShare: number;
  hasEngage: boolean;
  frontlineCount: number;
  hardCCCount: number;
  rangedCount: number;
  meleeCount: number;
  hasHypercarry: boolean; // klare skalierende Win-Condition vorhanden?
  carryCount: number; // Anzahl echter Schadensträger (Carrys)
  notes: string[]; // z.B. "AD-lastig", "kein Engage"
}

export interface TeamCompResult {
  slots: SlotResult[];
  scorecard: CompScorecard;
  weights: {
    counter: number;
    comp: number;
    synergy: number;
    procore: number;
    team: number;
    meta: number;
    player: number;
  };
  // Strategie-Ebene
  archetypeProfile: Record<Archetype, number>; // Anteile der (locked+Mains) Comp
  strategy: Archetype | null; // verwendete Ziel-Strategie (gewählt oder erkannt)
  strategyAuto: boolean; // wurde sie automatisch erkannt?
  proMode: boolean;
  proInfo: { source: string; dateFrom: string; dateTo: string; games: number };
}
