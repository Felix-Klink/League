import { NextRequest, NextResponse } from "next/server";
import { analyze } from "@/lib/analysis";
import type { Lane, Tier } from "@/lib/types";
import { LANES } from "@/lib/types";

const VALID_TIERS: Tier[] = [
  "all",
  "emerald",
  "emerald_plus",
  "platinum_plus",
  "diamond_plus",
];
const VALID_PATCH = [7, 14, 30];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mainSlugs: string[] = Array.isArray(body.mainSlugs)
      ? body.mainSlugs.filter((s: unknown) => typeof s === "string")
      : [];

    if (mainSlugs.length < 2 || mainSlugs.length > 3) {
      return NextResponse.json(
        { error: "Bitte 2 oder 3 Main-Champs angeben." },
        { status: 400 },
      );
    }

    const tier: Tier = VALID_TIERS.includes(body.tier)
      ? body.tier
      : "emerald_plus";
    const patch: number = VALID_PATCH.includes(Number(body.patch))
      ? Number(body.patch)
      : 30;
    const preferredLane: Lane | null = LANES.includes(body.preferredLane)
      ? body.preferredLane
      : null;

    const result = await analyze({ mainSlugs, tier, patch, preferredLane });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
