import Link from "next/link";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function SeasonOverview({ params }: { params: Promise<{ season: string }> }) {
  const season = Number((await params).season);

  const rounds = await prisma.match.groupBy({
    by: ["round"],
    where: { season, round: { not: null } },
    _count: { _all: true },
    orderBy: { round: "asc" }
  });

  const graded = await prisma.prediction.findMany({ where: { match: { season }, usedForEvaluation: true }, select: { wasCorrect: true, match: { select: { round: true } } } });
  const correct = graded.filter((p) => p.wasCorrect === true).length;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-4xl font-bold">Season {season}</h1>
      <p className="mt-2 text-sm text-slate-300">Graded predictions: {graded.length} • Correct: {correct} • Accuracy: {graded.length ? ((correct / graded.length) * 100).toFixed(1) : "0.0"}%</p>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rounds.map((round) => (
          <Link key={round.round} href={`/season/${season}/round/${round.round}`} className="rounded border border-slate-700 bg-slate-900 p-4 hover:border-sky-400">
            <h2 className="text-xl font-semibold">Round {round.round}</h2>
            <p className="text-sm text-slate-400">Matches: {round._count._all}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
