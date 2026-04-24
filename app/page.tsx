import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { MatchCard } from "@/components/match-card";
import { getErrorMessage } from "@/lib/utils/error-message";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();

async function getDashboardData() {
  const now = new Date();

  const [upcomingPredictions, gradedPredictions, nextMatch, totalMatches] =
    await Promise.all([
      prisma.prediction.findMany({
        where: {
          isLatest: true,
          match: { season: CURRENT_YEAR, kickoffAt: { gte: now } },
        },
        include: { match: true, homeTeam: true, awayTeam: true },
        orderBy: { match: { kickoffAt: "asc" } },
        take: 50,
      }),
      prisma.prediction.findMany({
        where: { match: { season: CURRENT_YEAR }, usedForEvaluation: true },
        select: { wasCorrect: true },
      }),
      prisma.match.findFirst({
        where: { season: CURRENT_YEAR, kickoffAt: { gte: now } },
        orderBy: { kickoffAt: "asc" },
      }),
      prisma.match.count({ where: { season: CURRENT_YEAR } }),
    ]);

  const correct = gradedPredictions.filter((p) => p.wasCorrect === true).length;
  const accuracy =
    gradedPredictions.length > 0
      ? ((correct / gradedPredictions.length) * 100).toFixed(1)
      : null;

  const highEdge = upcomingPredictions.filter((p) => p.confidence === "High").length;

  return {
    upcomingPredictions,
    gradedCount: gradedPredictions.length,
    correct,
    accuracy,
    highEdge,
    currentRound: nextMatch?.round ?? null,
    totalMatches,
  };
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function Home() {
  let data;
  let loadError: string | null = null;

  try {
    data = await getDashboardData();
  } catch (error) {
    loadError = getErrorMessage(error);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {process.env.NEXT_PUBLIC_APP_NAME ?? "NRL Model"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Season {CURRENT_YEAR} · Elo model vs bookmaker markets
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/season/${CURRENT_YEAR}`}
            className="rounded bg-sky-700 px-3 py-1.5 font-medium hover:bg-sky-600"
          >
            Season {CURRENT_YEAR}
          </Link>
          {data?.currentRound && (
            <Link
              href={`/season/${CURRENT_YEAR}/round/${data.currentRound}`}
              className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600"
            >
              Round {data.currentRound}
            </Link>
          )}
          <Link
            href="/settings"
            className="rounded bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            Settings
          </Link>
        </div>
      </div>

      {loadError && (
        <div className="mb-6 rounded border border-amber-500/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
          Database error: {loadError}. Run bootstrap from Settings to set up data.
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Season matches"
              value={data.totalMatches}
              sub={`Season ${CURRENT_YEAR}`}
            />
            <SummaryCard
              label="Predictions graded"
              value={data.gradedCount}
              sub={`${data.correct} correct`}
            />
            <SummaryCard
              label="Season accuracy"
              value={data.accuracy ? `${data.accuracy}%` : "—"}
              sub="Pre-match predictions"
            />
            <SummaryCard
              label="High-edge upcoming"
              value={data.highEdge}
              sub="Edge ≥ 6%"
            />
          </div>

          <h2 className="mb-4 text-xl font-semibold">Upcoming predictions</h2>

          {data.upcomingPredictions.length === 0 ? (
            <div className="rounded border border-slate-700 bg-slate-900 px-6 py-10 text-center text-slate-400">
              No upcoming predictions found. Run a{" "}
              <Link href="/settings" className="underline">
                season sync
              </Link>{" "}
              to import fixtures and generate predictions.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.upcomingPredictions.map((p) => (
                <MatchCard
                  key={p.id}
                  slug={p.match.slug ?? p.matchId}
                  homeTeam={p.homeTeam.shortName}
                  awayTeam={p.awayTeam.shortName}
                  kickoffAt={p.match.kickoffAt.toISOString()}
                  venue={p.match.venue}
                  round={p.match.round}
                  homeWinProb={p.homeWinProbability}
                  awayWinProb={p.awayWinProbability}
                  homeImplied={p.homeImpliedProbability}
                  awayImplied={p.awayImpliedProbability}
                  homeEdge={p.homeEdge}
                  awayEdge={p.awayEdge}
                  confidence={p.confidence}
                  homeOdds={
                    p.homeImpliedProbability && p.homeImpliedProbability > 0
                      ? 1 / p.homeImpliedProbability
                      : null
                  }
                  awayOdds={
                    p.awayImpliedProbability && p.awayImpliedProbability > 0
                      ? 1 / p.awayImpliedProbability
                      : null
                  }
                  expectedHomeScore={p.expectedHomeScore}
                  expectedAwayScore={p.expectedAwayScore}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
