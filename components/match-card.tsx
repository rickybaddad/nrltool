import Link from "next/link";

type Props = {
  slug: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  venue?: string | null;
  round?: number | null;
  homeWinProb: number;
  awayWinProb: number;
  homeOdds?: number | null;
  awayOdds?: number | null;
  homeImplied?: number | null;
  awayImplied?: number | null;
  homeEdge?: number | null;
  awayEdge?: number | null;
  confidence: string;
};

function confidenceCls(c: string) {
  if (c === "High") return "badge-high";
  if (c === "Medium") return "badge-medium";
  return "badge-low";
}

function edgeCls(edge: number | null | undefined) {
  if (edge == null) return "text-slate-400";
  return edge > 0 ? "text-emerald-400" : "text-rose-400";
}

export function MatchCard(props: Props) {
  const kickoff = new Date(props.kickoffAt);

  return (
    <Link
      href={`/match/${props.slug}`}
      className="block rounded-lg border border-slate-700 bg-slate-900 p-4 hover:border-sky-500 hover:bg-slate-900/80"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {props.homeTeam} <span className="text-slate-500">vs</span> {props.awayTeam}
          </h3>
          <p className="text-xs text-slate-400">
            {kickoff.toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}{" "}
            {kickoff.toLocaleTimeString("en-AU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {props.venue && ` · ${props.venue}`}
            {props.round && ` · Rd ${props.round}`}
          </p>
        </div>
        <span className={confidenceCls(props.confidence)}>{props.confidence}</span>
      </div>

      {/* Probability bars */}
      <div className="mt-3 space-y-1.5">
        {[
          { label: props.homeTeam, prob: props.homeWinProb },
          { label: props.awayTeam, prob: props.awayWinProb },
        ].map(({ label, prob }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-slate-400 truncate">{label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${(prob * 100).toFixed(0)}%` }}
              />
            </div>
            <span className="w-10 text-right font-medium tabular-nums">
              {(prob * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Odds + edge row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <div>
          <p>Odds</p>
          <p className="font-medium text-white">
            {props.homeOdds ? props.homeOdds.toFixed(2) : "—"} /{" "}
            {props.awayOdds ? props.awayOdds.toFixed(2) : "—"}
          </p>
        </div>
        <div>
          <p>Implied</p>
          <p className="font-medium text-white">
            {props.homeImplied != null
              ? `${(props.homeImplied * 100).toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div>
          <p>Edge (home)</p>
          <p className={`font-medium tabular-nums ${edgeCls(props.homeEdge)}`}>
            {props.homeEdge != null
              ? `${props.homeEdge > 0 ? "+" : ""}${(props.homeEdge * 100).toFixed(1)}%`
              : "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}
