import { env } from "@/lib/config/env";

export type OddsApiGame = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>;
  }>;
};

export async function fetchOdds(): Promise<OddsApiGame[]> {
  const params = new URLSearchParams({
    apiKey: env.ODDS_API_KEY,
    regions: env.ODDS_API_REGION,
    markets: env.ODDS_API_MARKETS,
    oddsFormat: "decimal"
  });

  const res = await fetch(`https://api.the-odds-api.com/v4/sports/rugbyleague_nrl/odds?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.text()).trim();
    const detail = body.length ? ` - ${body}` : "";
    throw new Error(`Odds API error: ${res.status}${detail}`);
  }
  return (await res.json()) as OddsApiGame[];
}
