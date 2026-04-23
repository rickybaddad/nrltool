import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { RoundMatchRow } from "@/components/round-match-row";

export const dynamic = "force-dynamic";

export default async function RoundPage({
  params,
}: {
  params: Promise<{ season: string; round: string }>;
}) {
  const { season, round } = await params;
  const seasonNumber = Number(season);
  const roundNumber = Number(round);

  const matches = await prisma.match.findMany({
    where: { season: seasonNumber, round: roundNumber },
    include: {
      homeTeam: true,
      awayTeam: true,
      predictions: {
        where: { OR: [{ usedForEvaluation: true }, { isLatest: true }] },
        orderBy: { generatedAt: "desc" },
        take: 2,
      },
      oddsSnapshots: { orderBy: { pulledAt: "desc" }, take: 1 },
    },
    orderBy: { kickoffAt: "asc" },
  });

  const prevRound = roundNumber > 1 ? roundNumber - 1 : null;
  const nextRound = roundNumber + 1;

  const graded = matches.flatMap((m) => m.predictions.filter((p) => p.usedForEvaluation));
  const correct = graded.filter((p) => p.wasCorrect === true).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <Link href="/" className="hover:text-white">Dashboard</Link>
        <span>/</span>
        <Link href={`/season/${seasonNumber}`} className="hover:text-white">Season {seasonNumber}</Link>
        <span>/</span>
        <span className="text-slate-200">Round {roundNumber}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Round {roundNumber}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {matches.length} matches
            {graded.length > 0 && ` · ${correct}/${graded.length} correct`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {prevRound && (
            <Link
              href={`/season/${seasonNumber}/round/${prevRound}`}
              className="rounded bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
            >
              ← Round {prevRound}
            </Link>
          )}
          <Link
            href={`/season/${seasonNumber}/round/${nextRound}`}
            className="rounded bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            Round {nextRound} →
          </Link>
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="text-slate-400">No matches found for this round.</p>
      ) : (
        <div className="grid gap-3">
          {matches.map((match) => {
            // Prefer the evaluation prediction; fall back to latest
            const evaluation =
              match.predictions.find((p) => p.usedForEvaluation) ??
              match.predictions.find((p) => p.isLatest) ??
              null;

            const predictedWinner =
              evaluation?.predictedWinnerTeamId === match.homeTeamId
                ? match.homeTeam.shortName
                : evaluation?.predictedWinnerTeamId === match.awayTeamId
                ? match.awayTeam.shortName
                : null;

            const actualWinner =
              match.homeScore == null || match.awayScore == null
                ? null
                : match.homeScore === match.awayScore
                ? "Draw"
                : match.homeScore > match.awayScore
                ? match.homeTeam.shortName
                : match.awayTeam.shortName;

            const bestOdds = match.oddsSnapshots[0] ?? null;

            return (
              <RoundMatchRow
                key={match.id}
                slug={match.slug ?? match.id}
                homeTeam={match.homeTeam.shortName}
                awayTeam={match.awayTeam.shortName}
                kickoffAt={match.kickoffAt.toISOString()}
                venue={match.venue}
                status={match.status}
                homeScore={match.homeScore}
                awayScore={match.awayScore}
                predictedWinner={predictedWinner}
                actualWinner={actualWinner}
                confidence={evaluation?.confidence ?? null}
                homeWinProb={evaluation?.homeWinProbability ?? null}
                awayWinProb={evaluation?.awayWinProbability ?? null}
                homeEdge={evaluation?.homeEdge ?? null}
                awayEdge={evaluation?.awayEdge ?? null}
                resultType={evaluation?.resultType ?? null}
                homeOdds={bestOdds?.homeOdds ?? null}
                awayOdds={bestOdds?.awayOdds ?? null}
                homeImplied={bestOdds?.homeImpliedNormalized ?? null}
                awayImplied={bestOdds?.awayImpliedNormalized ?? null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
