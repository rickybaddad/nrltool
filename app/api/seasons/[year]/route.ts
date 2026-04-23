import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const year = Number((await params).year);

  const [matchCount, finishedCount, rounds, graded] = await Promise.all([
    prisma.match.count({ where: { season: year } }),
    prisma.match.count({ where: { season: year, status: "FINISHED" } }),
    prisma.match.groupBy({
      by: ["round"],
      where: { season: year, round: { not: null } },
      _count: { _all: true },
      orderBy: { round: "asc" },
    }),
    prisma.prediction.findMany({
      where: { match: { season: year }, usedForEvaluation: true },
      select: { wasCorrect: true },
    }),
  ]);

  const correct = graded.filter((p) => p.wasCorrect === true).length;

  return NextResponse.json({
    year,
    matchCount,
    finishedCount,
    roundCount: rounds.length,
    predictionsGraded: graded.length,
    correct,
    accuracy: graded.length ? correct / graded.length : 0,
  });
}
