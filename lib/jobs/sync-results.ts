/**
 * Smart results sync: finds past incomplete matches and the current NRL week,
 * calls TheSportsDB eventsday once per date, and updates scores.
 *
 * NRL week = Thursday through Monday (Australia/Sydney time).
 * Never uses the season endpoint — only eventsday per date.
 */
import { MatchStatus, ImportRunStatus, ImportRunType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { fetchEventsByDay, type EventsDayEvent } from "@/lib/scrapers/eventsday";
import { normalizeName } from "@/lib/utils/team-resolver";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SyncSummary = {
  success: boolean;
  datesChecked: string[];
  apiCallsMade: number;
  eventsReturned: number;
  matchesUpdated: number;
  resultsCompleted: number;
  unmatchedEvents: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    eventId: string;
  }>;
  stillMissingResults: Array<{
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    kickoffAt: string;
  }>;
};

export type DbMatch = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: Date;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

type TeamInfo = { id: string; name: string };

// ---------------------------------------------------------------------------
// Date helpers (exported so tests can call them directly)
// ---------------------------------------------------------------------------

export function toSydneyDateStr(date: Date, timezone = "Australia/Sydney"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the 5-date NRL week window (Thu–Mon) that contains or follows `now`.
 *
 * - If today (Sydney) is Thu/Fri/Sat/Sun/Mon → return the current week's Thu–Mon.
 * - If today is Tue or Wed → return the upcoming week's Thu–Mon.
 */
export function getNrlWeekDates(now = new Date(), timezone = "Australia/Sydney"): string[] {
  const todayStr = toSydneyDateStr(now, timezone);

  const shortDay = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dayMap[shortDay] ?? 0;

  // Tue(2) and Wed(3): step forward to the upcoming Thursday.
  // Thu–Mon: step back to the most recent Thursday (0 steps for Thu itself).
  const daysToThursday =
    dow === 2 || dow === 3
      ? (4 - dow + 7) % 7          // +2 for Tue, +1 for Wed
      : -(((dow - 4) + 7) % 7);   // 0 for Thu, -1 Fri, -2 Sat, -3 Sun, -4 Mon

  const thursday = addDaysToDateStr(todayStr, daysToThursday);
  return [
    thursday,
    addDaysToDateStr(thursday, 1), // Friday
    addDaysToDateStr(thursday, 2), // Saturday
    addDaysToDateStr(thursday, 3), // Sunday
    addDaysToDateStr(thursday, 4), // Monday
  ];
}

// ---------------------------------------------------------------------------
// Score helpers (exported for testing)
// ---------------------------------------------------------------------------

export function hasBothScores(event: Pick<EventsDayEvent, "intHomeScore" | "intAwayScore">): boolean {
  return event.intHomeScore != null && event.intAwayScore != null;
}

export function parseEventScores(
  event: Pick<EventsDayEvent, "intHomeScore" | "intAwayScore">
): { homeScore: number; awayScore: number } | null {
  if (!hasBothScores(event)) return null;
  const homeScore = Number(event.intHomeScore);
  const awayScore = Number(event.intAwayScore);
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
  return { homeScore, awayScore };
}

function parseEventKickoff(event: EventsDayEvent): Date | null {
  if (event.strTimestamp) {
    const d = new Date(event.strTimestamp);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  if (event.dateEvent && event.strTime) {
    const d = new Date(`${event.dateEvent}T${event.strTime}Z`);
    if (!Number.isNaN(d.valueOf())) return d;
  }
  if (event.dateEvent) {
    return new Date(`${event.dateEvent}T00:00:00Z`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Event-to-match matching (exported for testing)
// ---------------------------------------------------------------------------

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Finds the DB match that corresponds to a TheSportsDB event.
 * Matches on (homeTeamId, awayTeamId) + local Sydney date.
 * Falls back to a 12-hour kickoff tolerance when dates can't be compared directly.
 */
export function matchEventToDbMatch(
  event: EventsDayEvent,
  dbMatches: DbMatch[],
  teamLookup: Map<string, TeamInfo>,
  timezone = "Australia/Sydney"
): DbMatch | null {
  const homeInfo = teamLookup.get(normalizeName(event.strHomeTeam));
  const awayInfo = teamLookup.get(normalizeName(event.strAwayTeam));
  if (!homeInfo || !awayInfo) return null;

  const eventDate = event.dateEvent;
  const eventKickoff = parseEventKickoff(event);

  return (
    dbMatches.find((m) => {
      if (m.homeTeamId !== homeInfo.id || m.awayTeamId !== awayInfo.id) return false;

      // Primary: Sydney local date matches the event's dateEvent
      if (eventDate && toSydneyDateStr(m.kickoffAt, timezone) === eventDate) return true;

      // Fallback: kickoff timestamps within 12 hours
      if (eventKickoff) {
        return Math.abs(m.kickoffAt.getTime() - eventKickoff.getTime()) <= TWELVE_HOURS_MS;
      }

      return false;
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Team lookup: normalized alias → { id, name }
// ---------------------------------------------------------------------------

async function buildTeamLookup(): Promise<Map<string, TeamInfo>> {
  const teams = await prisma.team.findMany({ include: { aliases: true } });
  const map = new Map<string, TeamInfo>();
  for (const team of teams) {
    const info: TeamInfo = { id: team.id, name: team.name };
    map.set(normalizeName(team.name), info);
    map.set(normalizeName(team.shortName), info);
    for (const alias of team.aliases) {
      map.set(alias.normalized, info);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Core shared sync: deduplicate dates → one API call per date
// ---------------------------------------------------------------------------

export async function syncSportsDbEventsByDates(
  dates: string[],
  timezone = "Australia/Sydney"
): Promise<SyncSummary> {
  const deduped = [...new Set(dates)].sort();

  if (deduped.length === 0) {
    return {
      success: true,
      datesChecked: [],
      apiCallsMade: 0,
      eventsReturned: 0,
      matchesUpdated: 0,
      resultsCompleted: 0,
      unmatchedEvents: [],
      stillMissingResults: [],
    };
  }

  // Build a generous UTC window covering all the dates plus a day on each side
  const [fy, fm, fd] = deduped[0].split("-").map(Number);
  const [ly, lm, ld] = deduped[deduped.length - 1].split("-").map(Number);
  const rangeFrom = new Date(Date.UTC(fy, fm - 1, fd - 1));
  const rangeTo = new Date(Date.UTC(ly, lm - 1, ld + 2));

  const [dbMatches, teamLookup] = await Promise.all([
    prisma.match.findMany({
      where: { kickoffAt: { gte: rangeFrom, lte: rangeTo } },
      include: { homeTeam: true, awayTeam: true },
    }),
    buildTeamLookup(),
  ]);

  const unmatchedEvents: SyncSummary["unmatchedEvents"] = [];
  let apiCallsMade = 0;
  let eventsReturned = 0;

  // Accumulate updates keyed by match id to avoid double-processing
  const pendingUpdates = new Map<string, { homeScore: number; awayScore: number }>();

  for (const dateStr of deduped) {
    const events = await fetchEventsByDay(dateStr);
    apiCallsMade++;
    eventsReturned += events.length;

    for (const event of events) {
      const dbMatch = matchEventToDbMatch(event, dbMatches, teamLookup, timezone);

      if (!dbMatch) {
        unmatchedEvents.push({
          date: dateStr,
          homeTeam: event.strHomeTeam,
          awayTeam: event.strAwayTeam,
          eventId: event.idEvent,
        });
        continue;
      }

      const scores = parseEventScores(event);
      if (!scores) continue; // No scores yet — leave match unchanged

      // Never overwrite a valid completed result
      if (
        dbMatch.status === MatchStatus.FINISHED &&
        dbMatch.homeScore != null &&
        dbMatch.awayScore != null
      ) {
        continue;
      }

      pendingUpdates.set(dbMatch.id, scores);
    }
  }

  // Apply DB updates
  let matchesUpdated = 0;
  let resultsCompleted = 0;

  for (const [matchId, scores] of pendingUpdates) {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: scores.homeScore,
        awayScore: scores.awayScore,
        status: MatchStatus.FINISHED,
      },
    });
    matchesUpdated++;
    resultsCompleted++;
  }

  // After updates, check which past matches still have missing results
  const now = new Date();
  const stillIncomplete = await prisma.match.findMany({
    where: {
      kickoffAt: { lt: now },
      status: { not: MatchStatus.FINISHED },
      OR: [{ homeScore: null }, { awayScore: null }],
    },
    include: { homeTeam: true, awayTeam: true },
  });

  const stillMissingResults = stillIncomplete.map((m) => ({
    matchId: m.id,
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    kickoffAt: m.kickoffAt.toISOString(),
  }));

  return {
    success: true,
    datesChecked: deduped,
    apiCallsMade,
    eventsReturned,
    matchesUpdated,
    resultsCompleted,
    unmatchedEvents,
    stillMissingResults,
  };
}

// ---------------------------------------------------------------------------
// Helpers: find past incomplete dates / week dates
// ---------------------------------------------------------------------------

export async function getPastIncompleteDates(timezone = "Australia/Sydney"): Promise<string[]> {
  const now = new Date();
  const matches = await prisma.match.findMany({
    where: {
      kickoffAt: { lt: now },
      status: { not: MatchStatus.FINISHED },
      OR: [{ homeScore: null }, { awayScore: null }],
    },
    select: { kickoffAt: true },
  });

  const dateSet = new Set<string>();
  for (const m of matches) {
    dateSet.add(toSydneyDateStr(m.kickoffAt, timezone));
  }
  return [...dateSet].sort();
}

// ---------------------------------------------------------------------------
// High-level named sync functions
// ---------------------------------------------------------------------------

/** Finds past incomplete DB matches and fetches results from TheSportsDB. */
export async function syncMissingPastResults(timezone = "Australia/Sydney"): Promise<SyncSummary> {
  const dates = await getPastIncompleteDates(timezone);
  return syncSportsDbEventsByDates(dates, timezone);
}

/** Calls TheSportsDB for each day in the current/upcoming NRL Thu–Mon window. */
export async function syncCurrentAndUpcomingWeek(timezone = "Australia/Sydney"): Promise<SyncSummary> {
  const dates = getNrlWeekDates(new Date(), timezone);
  return syncSportsDbEventsByDates(dates, timezone);
}

/**
 * Master sync: combines past incomplete match dates with the current NRL week,
 * deduplicates, and calls TheSportsDB once per unique date.
 */
export async function syncResultsAndUpcomingEvents(timezone = "Australia/Sydney"): Promise<SyncSummary> {
  const [pastDates, weekDates] = await Promise.all([
    getPastIncompleteDates(timezone),
    Promise.resolve(getNrlWeekDates(new Date(), timezone)),
  ]);
  const allDates = [...new Set([...pastDates, ...weekDates])];
  return syncSportsDbEventsByDates(allDates, timezone);
}

// ---------------------------------------------------------------------------
// With ImportRun audit logging
// ---------------------------------------------------------------------------

export async function runSyncResults(): Promise<SyncSummary> {
  const timezone = process.env.APP_TIMEZONE || "Australia/Sydney";

  const run = await prisma.importRun.create({
    data: {
      type: ImportRunType.SYNC_RESULTS,
      status: ImportRunStatus.SUCCESS,
      startedAt: new Date(),
    },
  });

  try {
    const summary = await syncResultsAndUpcomingEvents(timezone);

    const hasIssues =
      summary.unmatchedEvents.length > 0 || summary.stillMissingResults.length > 0;

    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: hasIssues ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
        recordsRead: summary.eventsReturned,
        recordsWritten: summary.matchesUpdated,
        message: `Checked ${summary.datesChecked.length} dates, ${summary.apiCallsMade} API calls, ${summary.matchesUpdated} matches updated`,
        metadata: summary as unknown as Prisma.InputJsonValue,
      },
    });

    return summary;
  } catch (error) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: ImportRunStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}
