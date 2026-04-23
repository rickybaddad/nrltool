import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function SeasonOverview({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const season = Number((await params).season);

  const [rounds, graded, totalMatches, finishedMatches] = await Promise.all([
    prisma.match.groupBy({
      by: ["round"],
      where: { season, round: { not: null } },
      _count: { _all: true },
      orderBy: { round: "asc" },
    }),
    prisma.prediction.findMany({
      where: { match: { season }, usedForEvaluation: true },
      select: { wasCorrect: true, match: { select: { round: true } } },
    }),
    prisma.match.count({ where: { season } }),
    prisma.match.count({ where: { season, status: "FINISHED" } }),
  ]);

  const correct = graded.filter((p) => p.wasCorrect === true).length;
  const incorrect = graded.filter((p) => p.wasCorrect === false).length;
  const accuracy = graded.length
    ? ((correct / graded.length) * 100).toFixed(1)
    : null;

  const roundStats = rounds.map((r) => {
    const roundPredictions = graded.filter((p) => p.match.round === r.round);
    const rc = roundPredictions.filter((p) => p.wasCorrect === true).length;
    const ri = roundPredictions.filter((p) => p.wasCorrect === false).length;
    return {
      round: r.round,
      matchCount: r._count._all,
      graded: roundPredictions.length,
      correct: rc,
      incorrect: ri,
      accuracy: roundPredictions.length ? ((rc / roundPredictions.length) * 100).toFixed(0) : null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="text-slate-400 hover:text-white">
          Dashboard
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-300">Season {season}</span>
      </div>

      <h1 className="mb-2 text-3xl font-bold">Season {season}</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total matches</p>
          <p className="mt-1 text-3xl font-bold">{totalMatches}</p>
          <p className="mt-0.5 text-xs text-slate-400">{finishedMatches} completed</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Graded predictions</p>
          <p className="mt-1 text-3xl font-bold">{graded.length}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Correct</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">{correct}</p>
          <p className="mt-0.5 text-xs text-slate-400">{incorrect} incorrect</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Accuracy</p>
          <p className="mt-1 text-3xl font-bold">
            {accuracy ? `${accuracy}%` : "—"}
          </p>
        </div>
      </div>

      <h2 className="mb-4 text-xl font-semibold">Rounds</h2>
      {rounds.length === 0 ? (
        <p className="text-slate-400">
          No rounds found. Run a{" "}
          <Link href="/settings" className="underline">
            season sync
          </Link>{" "}
          to import fixtures.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {roundStats.map((r) => (
            <Link
              key={r.round}
              href={`/season/${season}/round/${r.round}`}
              className="group rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold group-hover:text-sky-300">
                  Round {r.round}
                </h3>
                {r.accuracy && (
                  <span className="text-sm font-medium text-emerald-400">
                    {r.accuracy}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {r.matchCount} matches
                {r.graded > 0 && ` · ${r.graded} graded`}
              </p>
              {r.graded > 0 && (
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="text-emerald-400">✓ {r.correct}</span>
                  <span className="text-rose-400">✗ {r.incorrect}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
