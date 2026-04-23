import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ season: string }> }) {
  const season = Number((await params).season);

  const graded = await prisma.prediction.findMany({
    where: {
      match: { season },
      usedForEvaluation: true
    },
    include: { match: true }
  });

  const completedMatches = await prisma.match.count({ where: { season, status: "FINISHED" } });
  const correct = graded.filter((p) => p.wasCorrect === true).length;
  const incorrect = graded.filter((p) => p.wasCorrect === false).length;
  const noPrediction = Math.max(completedMatches - graded.length, 0);

  const byRound = Object.values(
    graded.reduce<Record<string, { round: number; total: number; correct: number; incorrect: number }>>((acc, row) => {
      const round = row.match.round ?? 0;
      const key = `${round}`;
      if (!acc[key]) acc[key] = { round, total: 0, correct: 0, incorrect: 0 };
      acc[key].total += 1;
      if (row.wasCorrect === true) acc[key].correct += 1;
      if (row.wasCorrect === false) acc[key].incorrect += 1;
      return acc;
    }, {})
  ).sort((a, b) => a.round - b.round);

  return NextResponse.json({
    season,
    totalPredictionsGraded: graded.length,
    correct,
    incorrect,
    accuracy: graded.length ? correct / graded.length : 0,
    noPrediction,
    byRound
  });
}
