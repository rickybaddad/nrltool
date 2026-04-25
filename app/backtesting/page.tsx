import Link from "next/link";
import { getBacktestData, type ModelType, type ConfidenceFilter, type BacktestData, type ModelComparisonRow, type EdgeBucketRow, type ConfidenceBucketRow, type RoundRow, type FavUnderdogRow, type PredictionRow } from "@/lib/services/backtesting";
import { getErrorMessage } from "@/lib/utils/error-message";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function plusMinus(n: number | null) {
  if (n == null) return "—";
  const s = n.toFixed(2);
  return n >= 0 ? `+${s}` : s;
}

function roiCls(n: number | null) {
  if (n == null) return "text-slate-400";
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}

function accCls(n: number) {
  if (n >= 0.65) return "text-emerald-400";
  if (n >= 0.5) return "text-slate-200";
  return "text-rose-400";
}

function resultBadge(type: string) {
  if (type === "WIN") return <span className="badge-correct">W</span>;
  if (type === "LOSS") return <span className="badge-incorrect">L</span>;
  if (type === "DRAW") return <span className="badge-draw">D</span>;
  return <span className="badge-low">—</span>;
}

// ---------------------------------------------------------------------------
// Filter form (plain HTML — no JS required)
// ---------------------------------------------------------------------------

function FiltersForm({
  season,
  modelType,
  confidence,
  minEdge,
}: {
  season: number;
  modelType: ModelType;
  confidence: ConfidenceFilter;
  minEdge: number;
}) {
  const select =
    "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500";

  return (
    <form method="GET" action="/backtesting" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Season</label>
        <select name="season" defaultValue={season} className={select}>
          {[CURRENT_YEAR - 1, CURRENT_YEAR].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Model</label>
        <select name="modelType" defaultValue={modelType} className={select}>
          <option value="blended">Final blended</option>
          <option value="elo">Elo only</option>
          <option value="score">Score model only</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Confidence</label>
        <select name="confidence" defaultValue={confidence} className={select}>
          <option value="all">All</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Min edge</label>
        <select name="minEdge" defaultValue={minEdge} className={select}>
          <option value="0">All</option>
          <option value="0">0%+</option>
          <option value="0.03">3%+</option>
          <option value="0.05">5%+</option>
          <option value="0.07">7%+</option>
        </select>
      </div>

      <button
        type="submit"
        className="rounded bg-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-600"
      >
        Apply
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string | number;
  sub?: string;
  cls?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cls ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SummaryCards({ data }: { data: BacktestData }) {
  const { summary } = data;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Summary</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SummaryCard label="Graded" value={summary.totalGraded} />
        <SummaryCard
          label="Correct"
          value={summary.correct}
          cls="text-emerald-400"
        />
        <SummaryCard
          label="Incorrect"
          value={summary.incorrect}
          cls="text-rose-400"
        />
        {summary.draws > 0 && (
          <SummaryCard label="Draws" value={summary.draws} cls="text-slate-400" />
        )}
        <SummaryCard
          label="Accuracy"
          value={pct(summary.accuracy)}
          cls={accCls(summary.accuracy)}
        />
        <SummaryCard
          label="Avg model prob"
          value={summary.avgModelProb != null ? pct(summary.avgModelProb) : "—"}
        />
        <SummaryCard
          label="Avg edge"
          value={summary.avgEdge != null ? pct(summary.avgEdge) : "—"}
          cls={summary.avgEdge != null ? roiCls(summary.avgEdge) : ""}
        />
        <SummaryCard
          label="Best round"
          value={summary.bestRound != null ? `Rd ${summary.bestRound}` : "—"}
          cls="text-emerald-400"
        />
        <SummaryCard
          label="Worst round"
          value={summary.worstRound != null ? `Rd ${summary.worstRound}` : "—"}
          cls="text-rose-400"
        />
        {summary.theoreticalPL != null && (
          <>
            <SummaryCard
              label="Theoretical P/L"
              value={plusMinus(summary.theoreticalPL)}
              sub="1 unit per bet"
              cls={roiCls(summary.theoreticalPL)}
            />
            <SummaryCard
              label="ROI"
              value={pct(summary.roi ?? 0)}
              sub="per unit staked"
              cls={roiCls(summary.roi)}
            />
            {summary.avgOdds != null && (
              <SummaryCard
                label="Avg odds"
                value={summary.avgOdds.toFixed(2)}
                sub="fair value"
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Model comparison
// ---------------------------------------------------------------------------

function ModelComparisonTable({ rows }: { rows: ModelComparisonRow[] }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Model comparison</h2>
      <p className="mb-3 text-xs text-slate-400">
        Same filtered dataset, different prediction rules. Predicted winner = team with higher model probability.
      </p>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3 text-right">Graded</th>
              <th className="px-4 py-3 text-right">Correct</th>
              <th className="px-4 py-3 text-right">Incorrect</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
              <th className="px-4 py-3 text-right">Avg edge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.model} className="hover:bg-slate-900/40">
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.graded}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{r.correct}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-rose-400">{r.incorrect}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${accCls(r.accuracy)}`}>
                  {r.graded > 0 ? pct(r.accuracy) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.avgEdge)}`}>
                  {r.avgEdge != null ? pct(r.avgEdge) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Round breakdown
// ---------------------------------------------------------------------------

function RoundBreakdownTable({ rows }: { rows: RoundRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Round by round</h2>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Round</th>
              <th className="px-4 py-3 text-right">Graded</th>
              <th className="px-4 py-3 text-right">Correct</th>
              <th className="px-4 py-3 text-right">Incorrect</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
              <th className="px-4 py-3 text-right">Avg edge</th>
              <th className="px-4 py-3 text-right">P/L</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.round ?? "unknown"} className="hover:bg-slate-900/40">
                <td className="px-4 py-2.5 font-medium">
                  {r.round != null ? `Rd ${r.round}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.predictions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{r.correct}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-rose-400">{r.incorrect}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${accCls(r.accuracy)}`}>
                  {r.predictions > 0 ? pct(r.accuracy) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.avgEdge)}`}>
                  {r.avgEdge != null ? pct(r.avgEdge) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.theoreticalPL)}`}>
                  {r.theoreticalPL != null ? plusMinus(r.theoreticalPL) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.roi)}`}>
                  {r.roi != null ? pct(r.roi) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Edge buckets
// ---------------------------------------------------------------------------

function EdgeBucketsTable({ rows }: { rows: EdgeBucketRow[] }) {
  const nonEmpty = rows.filter((r) => r.predictions > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Performance by edge</h2>
      <p className="mb-3 text-xs text-slate-400">
        Edge = model probability − market implied probability for the predicted side.
      </p>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Edge range</th>
              <th className="px-4 py-3 text-right">Predictions</th>
              <th className="px-4 py-3 text-right">Correct</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
              <th className="px-4 py-3 text-right">Avg odds</th>
              <th className="px-4 py-3 text-right">P/L</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.label} className={`hover:bg-slate-900/40 ${r.predictions === 0 ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5 font-medium">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.predictions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{r.correct}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.predictions > 0 ? accCls(r.accuracy) : "text-slate-500"}`}>
                  {r.predictions > 0 ? pct(r.accuracy) : "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                  {r.avgOdds != null ? r.avgOdds.toFixed(2) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.theoreticalPL)}`}>
                  {r.theoreticalPL != null ? plusMinus(r.theoreticalPL) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.roi)}`}>
                  {r.roi != null ? pct(r.roi) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Confidence breakdown
// ---------------------------------------------------------------------------

function ConfidenceBucketsTable({ rows }: { rows: ConfidenceBucketRow[] }) {
  const nonEmpty = rows.filter((r) => r.predictions > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Performance by confidence</h2>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3 text-right">Predictions</th>
              <th className="px-4 py-3 text-right">Correct</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
              <th className="px-4 py-3 text-right">Avg edge</th>
              <th className="px-4 py-3 text-right">P/L</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.label} className={`hover:bg-slate-900/40 ${r.predictions === 0 ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.label === "High"
                        ? "badge-high"
                        : r.label === "Medium"
                        ? "badge-medium"
                        : "badge-low"
                    }
                  >
                    {r.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.predictions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{r.correct}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.predictions > 0 ? accCls(r.accuracy) : "text-slate-500"}`}>
                  {r.predictions > 0 ? pct(r.accuracy) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.avgEdge)}`}>
                  {r.avgEdge != null ? pct(r.avgEdge) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.theoreticalPL)}`}>
                  {r.theoreticalPL != null ? plusMinus(r.theoreticalPL) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.roi)}`}>
                  {r.roi != null ? pct(r.roi) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Favourite vs underdog
// ---------------------------------------------------------------------------

function FavUnderdogTable({ rows }: { rows: FavUnderdogRow[] }) {
  const nonEmpty = rows.filter((r) => r.predictions > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Favourite vs underdog</h2>
      <p className="mb-3 text-xs text-slate-400">
        Classified by market implied probability: predicted team with higher implied probability = favourite.
      </p>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Predictions</th>
              <th className="px-4 py-3 text-right">Correct</th>
              <th className="px-4 py-3 text-right">Incorrect</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
              <th className="px-4 py-3 text-right">P/L</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.type} className={`hover:bg-slate-900/40 ${r.predictions === 0 ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5 font-medium capitalize">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.predictions}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">{r.correct}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-rose-400">{r.incorrect}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.predictions > 0 ? accCls(r.accuracy) : "text-slate-500"}`}>
                  {r.predictions > 0 ? pct(r.accuracy) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.theoreticalPL)}`}>
                  {r.theoreticalPL != null ? plusMinus(r.theoreticalPL) : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${roiCls(r.roi)}`}>
                  {r.roi != null ? pct(r.roi) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Prediction list
// ---------------------------------------------------------------------------

function PredictionListTable({ rows }: { rows: PredictionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        Prediction list
        <span className="ml-2 text-sm font-normal text-slate-400">
          ({rows.length} records)
        </span>
      </h2>
      <div className="overflow-x-auto rounded border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-3">Rd</th>
              <th className="px-3 py-3">Match</th>
              <th className="px-3 py-3">Predicted</th>
              <th className="px-3 py-3">Actual</th>
              <th className="px-3 py-3 text-right">Prob</th>
              <th className="px-3 py-3 text-right">Edge</th>
              <th className="px-3 py-3">Conf</th>
              <th className="px-3 py-3 text-right">Odds</th>
              <th className="px-3 py-3 text-center">Result</th>
              <th className="px-3 py-3 text-right">P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.matchId} className="hover:bg-slate-900/40">
                <td className="px-3 py-2 text-slate-400">
                  {r.round != null ? r.round : "—"}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {r.homeTeam} vs {r.awayTeam}
                </td>
                <td className="px-3 py-2 font-medium">{r.predictedTeam}</td>
                <td className="px-3 py-2 text-slate-300">{r.actualWinner ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pct(r.modelProbability)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${roiCls(r.edge)}`}>
                  {r.edge != null ? pct(r.edge) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.confidence === "High"
                        ? "badge-high"
                        : r.confidence === "Medium"
                        ? "badge-medium"
                        : "badge-low"
                    }
                  >
                    {r.confidence}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                  {r.odds != null ? r.odds.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-center">{resultBadge(r.resultType)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${roiCls(r.profit)}`}>
                  {r.profit != null ? plusMinus(r.profit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        P/L: +odds−1 on correct, −1 on incorrect (1 unit stake at fair-value odds 1/implied).
        Draws excluded from graded totals.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="rounded border border-slate-700 bg-slate-900 px-6 py-16 text-center text-slate-400">
      <p className="text-lg font-medium">No graded predictions found</p>
      <p className="mt-2 text-sm">
        Run{" "}
        <Link href="/settings" className="underline hover:text-slate-200">
          Generate predictions
        </Link>{" "}
        and{" "}
        <Link href="/settings" className="underline hover:text-slate-200">
          Evaluate predictions
        </Link>{" "}
        from the Settings page first.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BacktestingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const season = params.season ? parseInt(params.season) : CURRENT_YEAR;
  const modelType = (params.modelType ?? "blended") as ModelType;
  const confidence = (params.confidence ?? "all") as ConfidenceFilter;
  const minEdge = params.minEdge ? parseFloat(params.minEdge) : 0;

  let data: BacktestData | null = null;
  let loadError: string | null = null;

  try {
    data = await getBacktestData({ season, modelType, confidence, minEdge });
  } catch (error) {
    loadError = getErrorMessage(error);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Backtesting Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Season {season} · {modelType === "elo" ? "Elo model" : modelType === "score" ? "Score model" : "Final blended model"}
          </p>
        </div>
        <Link
          href="/"
          className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
        >
          ← Predictions
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-8 rounded border border-slate-700 bg-slate-900/40 p-4">
        <FiltersForm
          season={season}
          modelType={modelType}
          confidence={confidence}
          minEdge={minEdge}
        />
      </div>

      {loadError && (
        <div className="mb-6 rounded border border-rose-500/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
          Error loading data: {loadError}
        </div>
      )}

      {data && data.summary.totalGraded === 0 && <EmptyState />}

      {data && data.summary.totalGraded > 0 && (
        <div className="space-y-10">
          <SummaryCards data={data} />
          <ModelComparisonTable rows={data.modelComparison} />
          <RoundBreakdownTable rows={data.roundBreakdown} />
          <EdgeBucketsTable rows={data.edgeBuckets} />
          <ConfidenceBucketsTable rows={data.confidenceBuckets} />
          <FavUnderdogTable rows={data.favouriteUnderdog} />
          <PredictionListTable rows={data.predictions} />
        </div>
      )}
    </div>
  );
}
