import axios from "axios";
import { MatchStatus } from "@prisma/client";

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const NRL_LEAGUE_ID = "4416";

const SPORTSDB_HEADERS = {
  "User-Agent": "nrltool/1.0",
  Accept: "application/json",
};

// TheSportsDB returns numeric fields as strings despite the "int" prefix
type SportsDbEvent = {
  idEvent: string;
  strEvent: string;
  intRound: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strVenue: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
  strTime: string | null;
  strStatus: string | null;
  strPostponed: string | null;
};

export type FixtureRow = {
  externalId: string;
  season: number;
  round: number;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  sourceUrl: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
};

function parseStatus(strStatus: string | null, strPostponed: string | null): MatchStatus {
  if (strPostponed === "yes") return MatchStatus.POSTPONED;
  const s = (strStatus ?? "").toUpperCase();
  if (["FT", "AET", "AP", "AWD", "WO"].includes(s)) return MatchStatus.FINISHED;
  if (["1H", "2H", "HT", "ET", "P", "LIVE"].includes(s)) return MatchStatus.LIVE;
  if (["PPD"].includes(s)) return MatchStatus.POSTPONED;
  if (["CANC", "ABD"].includes(s)) return MatchStatus.CANCELLED;
  return MatchStatus.SCHEDULED;
}

function parseKickoff(event: SportsDbEvent): Date | null {
  // strTimestamp is ISO 8601 UTC — most reliable
  if (event.strTimestamp) {
    const d = new Date(event.strTimestamp);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  // Fallback: dateEvent + strTime (treated as UTC)
  if (event.dateEvent && event.strTime) {
    const d = new Date(`${event.dateEvent}T${event.strTime}Z`);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  return null;
}

export async function scrapeNrlFixtures(season: number): Promise<FixtureRow[]> {
  const url = `${SPORTSDB_BASE}/eventsseason.php?id=${NRL_LEAGUE_ID}&s=${season}`;
  const res = await axios.get<{ events: SportsDbEvent[] | null }>(url, {
    headers: SPORTSDB_HEADERS,
    timeout: 20000,
  });

  const events = res.data?.events ?? [];
  const rows: FixtureRow[] = [];

  for (const ev of events) {
    const kickoffAt = parseKickoff(ev);
    if (!kickoffAt) continue;

    const round = Number(ev.intRound ?? 0);
    const homeScore = ev.intHomeScore != null ? Number(ev.intHomeScore) : undefined;
    const awayScore = ev.intAwayScore != null ? Number(ev.intAwayScore) : undefined;

    rows.push({
      externalId: `sportsdb-${ev.idEvent}`,
      season,
      round,
      kickoffAt,
      homeTeamName: ev.strHomeTeam,
      awayTeamName: ev.strAwayTeam,
      venue: ev.strVenue ?? undefined,
      sourceUrl: `https://www.thesportsdb.com/event/${ev.idEvent}`,
      status: parseStatus(ev.strStatus, ev.strPostponed),
      homeScore: Number.isFinite(homeScore) ? homeScore : undefined,
      awayScore: Number.isFinite(awayScore) ? awayScore : undefined,
    });
  }

  return rows;
}
