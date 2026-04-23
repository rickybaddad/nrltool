import Link from "next/link";

type Props = {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue?: string | null;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  predictedWinner?: string | null;
  actualWinner?: string | null;
  confidence?: string | null;
  homeWinProb?: number | null;
  awayWinProb?: number | null;
  homeEdge?: number | null;
  awayEdge?: number | null;
  homeOdds?: number | null;
  awayOdds?: number | null;
  homeImplied?: number | null;
  awayImplied?: number | null;
  resultType?: string | null;
};

export function RoundMatchRow(props: Props) {
  const isFinished = props.status === "FINISHED";
  const isPending = !isFinished;

  const borderCls =
    props.resultType === "WIN"
      ? "border-emerald-600/60 bg-emerald-950/30"
      : props.resultType === "LOSS"
      ? "border-rose-600/60 bg-rose-950/30"
      : "border-slate-700 bg-slate-900";

  const resultLabel =
    props.resultType === "WIN" ? (
      <span className="badge-correct">Correct</span>
    ) : props.resultType === "LOSS" ? (
      <span className="badge-incorrect">Incorrect</span>
    ) : props.resultType === "DRAW" ? (
      <span className="badge-draw">Draw</span>
    ) : null;

  const confidenceLabel =
    props.confidence === "High" ? (
      <span className="badge-high">{props.confidence}</span>
    ) : props.confidence === "Medium" ? (
      <span className="badge-medium">{props.confidence}</span>
    ) : props.confidence ? (
      <span className="badge-low">{props.confidence}</span>
    ) : null;

  return (
    <Link
      href={`/match/${props.slug}`}
      className={`block rounded-lg border p-4 transition-colors hover:border-sky-500 ${borderCls}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">
            {props.homeTeam} <span className="text-slate-500">vs</span> {props.awayTeam}
          </h3>
          <p className="text-xs text-slate-400">
            {new Date(props.kickoffAt).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {props.venue && ` · ${props.venue}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {resultLabel}
          {confidenceLabel}
          {isFinished && props.homeScore != null && props.awayScore != null && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-sm font-bold tabular-nums">
              {props.homeScore}–{props.awayScore}
            </span>
          )}
          {isPending && (
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {props.status}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {/* Model probs */}
        <div>
          <p className="text-slate-400">Model</p>
          <p className="font-medium">
            {props.homeWinProb != null ? `${(props.homeWinProb * 100).toFixed(1)}%` : "—"} /{" "}
            {props.awayWinProb != null ? `${(props.awayWinProb * 100).toFixed(1)}%` : "—"}
          </p>
        </div>

        {/* Odds */}
        <div>
          <p className="text-slate-400">Best odds</p>
          <p className="font-medium tabular-nums">
            {props.homeOdds ? props.homeOdds.toFixed(2) : "—"} /{" "}
            {props.awayOdds ? props.awayOdds.toFixed(2) : "—"}
          </p>
        </div>

        {/* Implied */}
        <div>
          <p className="text-slate-400">Implied</p>
          <p className="font-medium">
            {props.homeImplied != null ? `${(props.homeImplied * 100).toFixed(1)}%` : "—"} /{" "}
            {props.awayImplied != null ? `${(props.awayImplied * 100).toFixed(1)}%` : "—"}
          </p>
        </div>

        {/* Edge / result */}
        {isPending ? (
          <div>
            <p className="text-slate-400">Edge (home)</p>
            <p
              className={`font-medium tabular-nums ${
                (props.homeEdge ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {props.homeEdge != null
                ? `${props.homeEdge > 0 ? "+" : ""}${(props.homeEdge * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-slate-400">Result</p>
            <p className="font-medium">
              {props.actualWinner ?? (isFinished ? "Draw" : "Pending")}
            </p>
          </div>
        )}
      </div>

      {/* Prediction summary line */}
      {props.predictedWinner && (
        <p className="mt-2 text-xs text-slate-400">
          Predicted: <span className="font-medium text-slate-200">{props.predictedWinner}</span>
          {props.actualWinner && props.actualWinner !== "Draw" && (
            <span className="ml-2">
              {props.predictedWinner === props.actualWinner ? "✓" : "✗"}
            </span>
          )}
        </p>
      )}
    </Link>
  );
}
