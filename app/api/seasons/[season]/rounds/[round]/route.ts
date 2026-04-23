import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ season: string; round: string }> }
) {
  const { season, round } = await params;

  const matches = await prisma.match.findMany({
    where: { season: Number(season), round: Number(round) },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { pulledAt: "desc" }, take: 1 },
      predictions: {
        where: { OR: [{ isLatest: true }, { usedForEvaluation: true }] },
        orderBy: { generatedAt: "desc" },
        take: 2,
      },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return NextResponse.json(matches);
}
