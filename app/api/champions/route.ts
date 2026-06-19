import { NextResponse } from "next/server";
import { getChampionIndex } from "@/lib/ddragon";

export const revalidate = 21600; // 6h

export async function GET() {
  try {
    const index = await getChampionIndex();
    return NextResponse.json({
      version: index.version,
      champions: index.all.map((c) => ({
        cid: c.cid,
        name: c.name,
        slug: c.slug,
        iconUrl: c.iconUrl,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
