import Link from "next/link";

type Props = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeModel: number;
  homeOdds?: number | null;
  homeMarket?: number | null;
  homeEdge?: number | null;
  confidence: string;
};

export function MatchCard(props: Props) {
  return (
    <Link href={`/matches/${props.id}`} className="block rounded-lg border border-slate-700 bg-slate-900 p-4 shadow hover:border-sky-400">
      <h2 className="text-lg font-semibold">{props.homeTeam} vs {props.awayTeam}</h2>
      <p className="text-sm text-slate-400">{new Date(props.kickoffAt).toLocaleString()}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>Model Home: {(props.homeModel * 100).toFixed(1)}%</div>
        <div>Odds: {props.homeOdds?.toFixed(2) ?? "N/A"}</div>
        <div>Implied: {props.homeMarket != null ? `${(props.homeMarket * 100).toFixed(1)}%` : "N/A"}</div>
        <div>Edge: {props.homeEdge != null ? `${(props.homeEdge * 100).toFixed(1)}%` : "N/A"}</div>
      </div>
      <span className="mt-3 inline-block rounded bg-sky-700 px-2 py-1 text-xs">Confidence: {props.confidence}</span>
    </Link>
  );
}
