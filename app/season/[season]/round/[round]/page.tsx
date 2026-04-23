import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { RoundMatchRow } from "@/components/round-match-row";

export const dynamic = "force-dynamic";

export default async function RoundPage({ params }: { params: Promise<{ season: string; round: string }> }) {
  const { season, round } = await params;
  const seasonNumber = Number(season);
  const roundNumber = Number(round);

  const matches = await prisma.match.findMany({
    where: { season: seasonNumber, round: roundNumber },
    include: {
      homeTeam: true,
      awayTeam: true,
      predictions: {
        where: { usedForEvaluation: true },
        orderBy: { generatedAt: "desc" },
        take: 1
      }
    },
    orderBy: { kickoffAt: "asc" }
  });

  const prevRound = roundNumber > 1 ? roundNumber - 1 : null;
  const nextRound = roundNumber + 1;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link className="rounded bg-slate-800 px-3 py-1" href={`/season/${seasonNumber}`}>Season overview</Link>
        {prevRound ? <Link className="rounded bg-slate-800 px-3 py-1" href={`/season/${seasonNumber}/round/${prevRound}`}>← Round {prevRound}</Link> : null}
        <Link className="rounded bg-slate-800 px-3 py-1" href={`/season/${seasonNumber}/round/${nextRound}`}>Round {nextRound} →</Link>
      </div>

      <h1 className="text-4xl font-bold">Season {seasonNumber} • Round {roundNumber}</h1>

      <div className="mt-6 grid gap-3">
        {matches.map((match) => {
          const evaluation = match.predictions[0];
          const predictedWinner = evaluation?.predictedWinnerTeamId === match.homeTeamId
            ? match.homeTeam.shortName
            : evaluation?.predictedWinnerTeamId === match.awayTeamId
            ? match.awayTeam.shortName
            : null;

          const actualWinner = match.homeScore == null || match.awayScore == null
            ? null
            : match.homeScore === match.awayScore
            ? "Draw"
            : match.homeScore > match.awayScore
            ? match.homeTeam.shortName
            : match.awayTeam.shortName;

          return (
            <RoundMatchRow
              key={match.id}
              matchId={match.id}
              homeTeam={match.homeTeam.shortName}
              awayTeam={match.awayTeam.shortName}
              kickoffAt={match.kickoffAt.toISOString()}
              venue={match.venue}
              status={match.status}
              homeScore={match.homeScore}
              awayScore={match.awayScore}
              predictedWinner={predictedWinner}
              actualWinner={actualWinner}
              confidence={evaluation?.confidence}
              homeProb={evaluation?.modelHomeProbability}
              awayProb={evaluation?.modelAwayProbability}
              homeEdge={evaluation?.homeEdge}
              awayEdge={evaluation?.awayEdge}
              resultType={evaluation?.resultType}
            />
          );
        })}
      </div>
    </main>
  );
}
