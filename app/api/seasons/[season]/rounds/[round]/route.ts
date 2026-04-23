import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ season: string; round: string }> }) {
  const { season, round } = await params;
  const seasonNumber = Number(season);
  const roundNumber = Number(round);

  const matches = await prisma.match.findMany({
    where: { season: seasonNumber, round: roundNumber },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 },
      predictions: { orderBy: { generatedAt: "desc" }, take: 5 }
    },
    orderBy: { kickoffAt: "asc" }
  });

  return NextResponse.json(matches);
}
