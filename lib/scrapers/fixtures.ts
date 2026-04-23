import axios from "axios";
import { MatchStatus } from "@prisma/client";
import { normalizeTeamName } from "@/lib/utils/nrl-teams";

const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/3";
const NRL_LEAGUE_ID = "4416";

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
  round: number | null;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  venue?: string;
  sourceUrl: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
};

function parseKickoff(event: SportsDbEvent): Date | null {
  if (event.strTimestamp) {
    const d = new Date(event.strTimestamp);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  if (event.dateEvent && event.strTime) {
    const d = new Date(`${event.dateEvent}T${event.strTime}Z`);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  if (event.dateEvent) {
    const d = new Date(`${event.dateEvent}T00:00:00Z`);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  return null;
}

export async function scrapeNrlFixtures(season: number): Promise<FixtureRow[]> {
  const url = `${SPORTSDB_BASE}/eventsseason.php?id=${NRL_LEAGUE_ID}&s=${season}`;
  const res = await axios.get<{ events: SportsDbEvent[] | null }>(url, {
    headers: { "User-Agent": "nrltool/1.0", Accept: "application/json" },
    timeout: 20000,
  });

  const events = res.data?.events ?? [];
  const rows: FixtureRow[] = [];

  for (const ev of events) {
    const rawRound = Number(ev.intRound ?? 0);
    // Valid NRL regular-season rounds are 1–27; anything outside that
    // (0, 500, etc.) means TheSportsDB hasn't assigned a round yet.
    const round: number | null = rawRound >= 1 && rawRound <= 27 ? rawRound : null;

    const kickoffAt = parseKickoff(ev);
    if (!kickoffAt) continue;

    // Resolve canonical team names; preserve raw name if unknown so the
    // pipeline can still report it as unmatched rather than silently drop it
    let homeTeamName: string;
    let awayTeamName: string;
    try {
      homeTeamName = normalizeTeamName(ev.strHomeTeam);
      awayTeamName = normalizeTeamName(ev.strAwayTeam);
    } catch {
      homeTeamName = ev.strHomeTeam;
      awayTeamName = ev.strAwayTeam;
    }

    const homeScore = ev.intHomeScore != null ? Number(ev.intHomeScore) : undefined;
    const awayScore = ev.intAwayScore != null ? Number(ev.intAwayScore) : undefined;

    // Completed if both scores are present, otherwise scheduled
    const bothScores =
      homeScore !== undefined &&
      awayScore !== undefined &&
      ev.intHomeScore !== null &&
      ev.intAwayScore !== null;
    const status = bothScores ? MatchStatus.FINISHED : MatchStatus.SCHEDULED;

    rows.push({
      externalId: `sportsdb-${ev.idEvent}`,
      season,
      round,  // null when TheSportsDB hasn't assigned a round yet
      kickoffAt,
      homeTeamName,
      awayTeamName,
      venue: ev.strVenue ?? undefined,
      sourceUrl: `https://www.thesportsdb.com/event/${ev.idEvent}`,
      status,
      homeScore: bothScores ? homeScore : undefined,
      awayScore: bothScores ? awayScore : undefined,
    });
  }

  return rows;
}
