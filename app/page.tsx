import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { MatchCard } from "@/components/match-card";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function sortPredictions<T extends { kickoffAt: Date; homeEdge: number | null; confidence: string }>(arr: T[], sort: string) {
  if (sort === "edge") return arr.sort((a, b) => Math.abs(b.homeEdge ?? 0) - Math.abs(a.homeEdge ?? 0));
  if (sort === "confidence") return arr.sort((a, b) => b.confidence.localeCompare(a.confidence));
  return arr.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
}

export default async function Home({ searchParams }: { searchParams?: Promise<{ sort?: string }> }) {
  const sort = (await searchParams)?.sort ?? "time";
  type PredictionWithRelations = Prisma.PredictionGetPayload<{
    include: { match: true; homeTeam: true; awayTeam: true };
  }>;

  const now = new Date();
  const currentSeason = now.getUTCFullYear();

  let predictions: PredictionWithRelations[] = [];
  let loadError: string | null = null;

  try {
    predictions = await prisma.prediction.findMany({
      include: {
        match: true,
        homeTeam: true,
        awayTeam: true
      },
      orderBy: { generatedAt: "desc" },
      take: 200
    });
  } catch (error) {
    console.error("Failed to load predictions", error);
    loadError = "Predictions are temporarily unavailable. Please check your database connection and try again.";
  }

  const newestByMatch = Array.from(new Map(predictions.map((p) => [p.matchId, p])).values()).filter((p) => p.match.kickoffAt >= now);
  const sorted = sortPredictions(newestByMatch.map((p) => ({ ...p, kickoffAt: p.match.kickoffAt })), sort);

  const currentRoundMatch = await prisma.match.findFirst({
    where: { season: currentSeason, kickoffAt: { gte: now } },
    orderBy: { kickoffAt: "asc" }
  });

  const currentRound = currentRoundMatch?.round ?? 1;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-3 text-4xl font-bold">NRL Model</h1>
      <p className="mb-4 text-sm text-slate-300">Season-aware dashboard for full-year fixture tracking, predictions, and graded outcomes.</p>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/?sort=time" className="rounded bg-slate-800 px-3 py-1">Sort: Time</a>
        <a href="/?sort=edge" className="rounded bg-slate-800 px-3 py-1">Sort: Biggest Edge</a>
        <a href="/?sort=confidence" className="rounded bg-slate-800 px-3 py-1">Sort: Confidence</a>
        <Link href={`/season/${currentSeason}`} className="rounded bg-sky-700 px-3 py-1">Season {currentSeason}</Link>
        <Link href={`/season/${currentSeason}/round/${currentRound}`} className="rounded bg-slate-700 px-3 py-1">Current Round {currentRound}</Link>
        <a href="/settings" className="rounded bg-slate-700 px-3 py-1">Settings</a>
      </div>
      {loadError ? (
        <p className="mb-4 rounded border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">{loadError}</p>
      ) : null}
      <div className="grid gap-4">
        {sorted.map((p) => (
          <MatchCard
            key={p.id}
            id={p.matchId}
            homeTeam={p.homeTeam.shortName}
            awayTeam={p.awayTeam.shortName}
            kickoffAt={p.match.kickoffAt.toISOString()}
            homeModel={p.modelHomeProbability}
            homeOdds={p.marketHomeProbability ? 1 / p.marketHomeProbability : null}
            homeMarket={p.marketHomeProbability}
            homeEdge={p.homeEdge}
            confidence={p.confidence}
          />
        ))}
      </div>
    </main>
  );
}
