import { NextRequest, NextResponse } from "next/server";
import { buildTeamComp } from "@/lib/teamcomp";
import type { AllySlot, Archetype, EnemyPick, Lane, Tier } from "@/lib/types";
import { LANES } from "@/lib/types";

const VALID_STRATEGY: (Archetype | "auto")[] = [
  "auto",
  "teamfight",
  "poke",
  "dive",
  "pick",
  "protect",
  "splitpush",
];

const VALID_TIERS: Tier[] = [
  "all",
  "emerald",
  "emerald_plus",
  "platinum_plus",
  "diamond_plus",
  "master_plus",
  "grandmaster",
  "challenger",
];
const VALID_PATCH = [7, 14, 30];

function parseLane(v: unknown): Lane | null {
  return typeof v === "string" && (LANES as string[]).includes(v)
    ? (v as Lane)
    : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Allies: erwartet 5 Slots (oder weniger), je { lane, lockedCid, mains, poolOnly }
    const allies: AllySlot[] = Array.isArray(body.allies)
      ? body.allies
          .map((a: Record<string, unknown>): AllySlot | null => {
            const lane = parseLane(a.lane);
            if (!lane) return null;
            return {
              lane,
              lockedCid:
                typeof a.lockedCid === "number" ? a.lockedCid : null,
              mains: Array.isArray(a.mains)
                ? a.mains.filter((x: unknown) => typeof x === "number")
                : [],
              poolOnly: a.poolOnly === true,
            };
          })
          .filter((a: AllySlot | null): a is AllySlot => a !== null)
      : [];

    if (allies.length === 0) {
      return NextResponse.json(
        { error: "Mindestens ein Team-Slot mit Lane nötig." },
        { status: 400 },
      );
    }

    const enemies: EnemyPick[] = Array.isArray(body.enemies)
      ? body.enemies
          .map((e: Record<string, unknown>): EnemyPick | null =>
            typeof e.cid === "number"
              ? { cid: e.cid, lane: parseLane(e.lane) }
              : null,
          )
          .filter((e: EnemyPick | null): e is EnemyPick => e !== null)
      : [];

    const tier: Tier = VALID_TIERS.includes(body.tier)
      ? body.tier
      : "emerald_plus";
    const patch: number = VALID_PATCH.includes(Number(body.patch))
      ? Number(body.patch)
      : 30;
    const strategy: Archetype | "auto" = VALID_STRATEGY.includes(body.strategy)
      ? body.strategy
      : "auto";
    const proMode = body.proMode === true;
    // Im Pro-Modus auf High-Elo-Tier hochziehen (nähe an Pro-Drafts)
    const effTier: Tier = proMode && tier !== "challenger" ? "master_plus" : tier;

    const result = await buildTeamComp({
      allies,
      enemies,
      tier: effTier,
      patch,
      strategy,
      proMode,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
