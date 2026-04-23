import Link from "next/link";

type RoundMatchRowProps = {
  matchId: string;
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
  homeProb?: number | null;
  awayProb?: number | null;
  homeEdge?: number | null;
  awayEdge?: number | null;
  resultType?: string | null;
};

export function RoundMatchRow(props: RoundMatchRowProps) {
  const resultClass =
    props.resultType === "WIN"
      ? "border-emerald-500/50 bg-emerald-900/20"
      : props.resultType === "LOSS"
      ? "border-rose-500/50 bg-rose-900/20"
      : "border-slate-700 bg-slate-900";

  return (
    <Link href={`/matches/${props.matchId}`} className={`block rounded-lg border p-4 ${resultClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{props.homeTeam} vs {props.awayTeam}</h3>
        <span className="text-xs text-slate-300">{props.status}</span>
      </div>
      <p className="text-sm text-slate-400">{new Date(props.kickoffAt).toLocaleString()} {props.venue ? `• ${props.venue}` : ""}</p>

      <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>Prediction: {props.predictedWinner ?? "No clear prediction"}</div>
        <div>Actual: {props.actualWinner ?? (props.status === "FINISHED" ? "Draw / No result" : "Pending")}</div>
        <div>Model probs: {props.homeProb != null ? `${(props.homeProb * 100).toFixed(1)}%` : "N/A"} / {props.awayProb != null ? `${(props.awayProb * 100).toFixed(1)}%` : "N/A"}</div>
        <div>Edge: {props.homeEdge != null ? `${(props.homeEdge * 100).toFixed(1)}%` : "N/A"} / {props.awayEdge != null ? `${(props.awayEdge * 100).toFixed(1)}%` : "N/A"}</div>
        <div>Confidence: {props.confidence ?? "N/A"}</div>
        <div>Score: {props.homeScore != null && props.awayScore != null ? `${props.homeScore}-${props.awayScore}` : "-"}</div>
      </div>
    </Link>
  );
}
