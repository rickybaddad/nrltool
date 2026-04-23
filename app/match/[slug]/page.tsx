import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function ProbBar({ prob, label }: { prob: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-white">{(prob * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${(prob * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

function confidenceBadge(c: string | null) {
  if (!c) return null;
  const cls =
    c === "High" ? "badge-high" : c === "Medium" ? "badge-medium" : "badge-low";
  return <span className={cls}>{c} confidence</span>;
}

function resultBadge(resultType: string | null) {
  if (!resultType) return null;
  if (resultType === "WIN") return <span className="badge-correct">Correct</span>;
  if (resultType === "LOSS") return <span className="badge-incorrect">Incorrect</span>;
  if (resultType === "DRAW") return <span className="badge-draw">Draw</span>;
  return <span className="badge-low">{resultType}</span>;
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const match = await prisma.match.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { pulledAt: "desc" }, take: 20 },
      predictions: { orderBy: { generatedAt: "desc" }, take: 10 },
    },
  });

  if (!match) notFound();

  const evaluationPred = match.predictions.find((p) => p.usedForEvaluation);
  const latestPred =
    evaluationPred ??
    match.predictions.find((p) => p.isLatest) ??
    match.predictions[0] ??
    null;

  const [homeLast5, awayLast5] = await Promise.all([
    prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }],
        status: "FINISHED",
        id: { not: match.id },
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "desc" },
      take: 5,
    }),
    prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: match.awayTeamId }, { awayTeamId: match.awayTeamId }],
        status: "FINISHED",
        id: { not: match.id },
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "desc" },
      take: 5,
    }),
  ]);

  const isFinished = match.status === "FINISHED";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <Link href="/" className="hover:text-white">Dashboard</Link>
        <span>/</span>
        {match.round && (
          <>
            <Link
              href={`/season/${match.season}/round/${match.round}`}
              className="hover:text-white"
            >
              Season {match.season} · Round {match.round}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-slate-200">
          {match.homeTeam.shortName} vs {match.awayTeam.shortName}
        </span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          {match.homeTeam.name} vs {match.awayTeam.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <span>
            {new Date(match.kickoffAt).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {match.venue && <span>· {match.venue}</span>}
          {match.round && <span>· Round {match.round}</span>}
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isFinished
                ? "bg-slate-700 text-slate-200"
                : match.status === "LIVE"
                ? "bg-emerald-700 text-emerald-100"
                : "bg-sky-900 text-sky-200"
            }`}
          >
            {match.status}
          </span>
        </div>

        {/* Score */}
        {isFinished && match.homeScore != null && match.awayScore != null && (
          <div className="mt-4 flex items-center gap-6">
            <div className="text-center">
              <p className="text-sm text-slate-400">{match.homeTeam.shortName}</p>
              <p className="text-5xl font-bold">{match.homeScore}</p>
            </div>
            <p className="text-2xl text-slate-500">—</p>
            <div className="text-center">
              <p className="text-sm text-slate-400">{match.awayTeam.shortName}</p>
              <p className="text-5xl font-bold">{match.awayScore}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Probability breakdown */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-4 text-lg font-semibold">Prediction</h2>
          {latestPred ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                {confidenceBadge(latestPred.confidence)}
                {evaluationPred && resultBadge(evaluationPred.resultType ?? null)}
              </div>

              <div className="space-y-3">
                <ProbBar prob={latestPred.homeWinProbability} label={`${match.homeTeam.shortName} (model)`} />
                <ProbBar prob={latestPred.awayWinProbability} label={`${match.awayTeam.shortName} (model)`} />
              </div>

              {latestPred.homeImpliedProbability != null && (
                <div className="space-y-3 border-t border-slate-800 pt-4">
                  <p className="text-xs text-slate-400">
                    Market · {latestPred.selectedBookmaker ?? "Bookmaker"}
                  </p>
                  <ProbBar prob={latestPred.homeImpliedProbability} label={`${match.homeTeam.shortName} (implied)`} />
                  <ProbBar prob={latestPred.awayImpliedProbability!} label={`${match.awayTeam.shortName} (implied)`} />
                </div>
              )}

              {(latestPred.homeEdge != null || latestPred.awayEdge != null) && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">{match.homeTeam.shortName} edge</p>
                    <p
                      className={`text-lg font-semibold ${
                        (latestPred.homeEdge ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {latestPred.homeEdge != null
                        ? `${(latestPred.homeEdge * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{match.awayTeam.shortName} edge</p>
                    <p
                      className={`text-lg font-semibold ${
                        (latestPred.awayEdge ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {latestPred.awayEdge != null
                        ? `${(latestPred.awayEdge * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
              )}

              {latestPred.homeTeamRating != null && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">{match.homeTeam.shortName} Elo</p>
                    <p className="text-base font-medium">{latestPred.homeTeamRating.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{match.awayTeam.shortName} Elo</p>
                    <p className="text-base font-medium">{latestPred.awayTeamRating?.toFixed(0)}</p>
                  </div>
                  {latestPred.eloDifference != null && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-400">Elo difference</p>
                      <p className="text-base font-medium">
                        {latestPred.eloDifference > 0 ? "+" : ""}
                        {latestPred.eloDifference.toFixed(0)} (home advantage +
                        {latestPred.homeAdvantageApplied?.toFixed(0) ?? "50"})
                      </p>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Generated {new Date(latestPred.generatedAt).toLocaleString("en-AU")} ·{" "}
                {latestPred.modelVersion}
              </p>
            </div>
          ) : (
            <p className="text-slate-400">No prediction generated yet.</p>
          )}
        </section>

        {/* Odds */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-4 text-lg font-semibold">Bookmaker odds</h2>
          {match.oddsSnapshots.length === 0 ? (
            <p className="text-slate-400">No odds stored for this match.</p>
          ) : (
            <div className="space-y-2">
              {match.oddsSnapshots.slice(0, 8).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded bg-slate-800 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{o.bookmakerTitle}</span>
                  <div className="flex gap-4 tabular-nums">
                    <span>{o.homeOdds?.toFixed(2) ?? "—"}</span>
                    <span className="text-slate-500">/</span>
                    <span>{o.awayOdds?.toFixed(2) ?? "—"}</span>
                    {o.overround != null && (
                      <span className="text-slate-400">
                        ({(o.overround * 100).toFixed(1)}% OR)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent form — Home */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-3 text-lg font-semibold">
            {match.homeTeam.shortName} — last 5
          </h2>
          {homeLast5.length === 0 ? (
            <p className="text-sm text-slate-400">No recent matches.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {homeLast5.map((m) => {
                const homeWon =
                  m.homeTeamId === match.homeTeamId
                    ? (m.homeScore ?? 0) > (m.awayScore ?? 0)
                    : (m.awayScore ?? 0) > (m.homeScore ?? 0);
                return (
                  <li key={m.id} className="flex items-center justify-between">
                    <span className="text-slate-300">
                      {m.homeTeam.shortName} {m.homeScore}–{m.awayScore}{" "}
                      {m.awayTeam.shortName}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        homeWon ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {homeWon ? "W" : "L"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent form — Away */}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-3 text-lg font-semibold">
            {match.awayTeam.shortName} — last 5
          </h2>
          {awayLast5.length === 0 ? (
            <p className="text-sm text-slate-400">No recent matches.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {awayLast5.map((m) => {
                const awayWon =
                  m.awayTeamId === match.awayTeamId
                    ? (m.awayScore ?? 0) > (m.homeScore ?? 0)
                    : (m.homeScore ?? 0) > (m.awayScore ?? 0);
                return (
                  <li key={m.id} className="flex items-center justify-between">
                    <span className="text-slate-300">
                      {m.homeTeam.shortName} {m.homeScore}–{m.awayScore}{" "}
                      {m.awayTeam.shortName}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        awayWon ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {awayWon ? "W" : "L"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Prediction history */}
      {match.predictions.length > 1 && (
        <section className="mt-6 rounded-lg border border-slate-700 bg-slate-900 p-5">
          <h2 className="mb-3 text-lg font-semibold">Prediction history</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="pb-2 pr-4">Generated</th>
                  <th className="pb-2 pr-4">Home %</th>
                  <th className="pb-2 pr-4">Away %</th>
                  <th className="pb-2 pr-4">Home edge</th>
                  <th className="pb-2 pr-4">Confidence</th>
                  <th className="pb-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {match.predictions.map((p) => (
                  <tr key={p.id} className={p.usedForEvaluation ? "bg-slate-800/40" : ""}>
                    <td className="py-2 pr-4 text-slate-300">
                      {new Date(p.generatedAt).toLocaleDateString("en-AU")}
                    </td>
                    <td className="py-2 pr-4">
                      {(p.homeWinProbability * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4">
                      {(p.awayWinProbability * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4">
                      {p.homeEdge != null
                        ? `${(p.homeEdge * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-4">{p.confidence}</td>
                    <td className="py-2">
                      {p.usedForEvaluation ? resultBadge(p.resultType ?? null) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
