import { NextResponse } from "next/server";
import { getChampSelect } from "@/lib/lcu";

// Kein Caching — der Champ-Select ändert sich sekündlich.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const state = await getChampSelect();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "client_not_running", allies: [], enemies: [], bans: [], error: (err as Error).message },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
