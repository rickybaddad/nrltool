import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { fetchedAt: "desc" }, take: 10 },
      predictions: { orderBy: { generatedAt: "desc" }, take: 1 }
    }
  });
  if (!match) notFound();

  const prediction = match.predictions[0];
  const homeLast5 = await prisma.match.findMany({ where: { OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }], status: "FINISHED" }, orderBy: { kickoffAt: "desc" }, take: 5 });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-3xl font-bold">{match.homeTeam.fullName} vs {match.awayTeam.fullName}</h1>
      <p className="text-slate-400">{match.kickoffAt.toLocaleString()}</p>

      <section className="mt-6 rounded border border-slate-700 p-4">
        <h2 className="mb-2 font-semibold">Probability Breakdown</h2>
        <p>Model Home: {prediction ? `${(prediction.modelHomeProbability * 100).toFixed(1)}%` : "N/A"}</p>
        <p>Market Home: {prediction?.marketHomeProbability != null ? `${(prediction.marketHomeProbability * 100).toFixed(1)}%` : "N/A"}</p>
        <p>Home Edge: {prediction?.homeEdge != null ? `${(prediction.homeEdge * 100).toFixed(1)}%` : "N/A"}</p>
        <p>Confidence: {prediction?.confidence ?? "N/A"}</p>
      </section>

      <section className="mt-6 rounded border border-slate-700 p-4">
        <h2 className="mb-2 font-semibold">Recent Odds</h2>
        <ul className="space-y-2 text-sm">
          {match.oddsSnapshots.map((o) => (
            <li key={o.id}>{o.bookmakerTitle}: {o.homePrice.toFixed(2)} / {o.awayPrice.toFixed(2)} (overround {(o.overround * 100).toFixed(2)}%)</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded border border-slate-700 p-4">
        <h2 className="mb-2 font-semibold">{match.homeTeam.shortName} Last 5</h2>
        <ul className="text-sm">
          {homeLast5.map((m) => (
            <li key={m.id}>{m.kickoffAt.toDateString()} - {m.homeScore}-{m.awayScore}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded border border-slate-700 p-4 text-sm text-slate-300">
        <h2 className="mb-2 font-semibold">Model Explanation</h2>
        <p>Elo ratings are updated from historical completed matches with configurable K-factor and home advantage. Upcoming probabilities are compared against normalized bookmaker implied probabilities to estimate value edge.</p>
      </section>
    </main>
  );
}
