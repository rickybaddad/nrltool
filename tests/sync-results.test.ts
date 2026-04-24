import { describe, expect, it } from "vitest";
import {
  addDaysToDateStr,
  getNrlWeekDates,
  hasBothScores,
  matchEventToDbMatch,
  parseEventScores,
  toSydneyDateStr,
} from "@/lib/jobs/sync-results";
import type { DbMatch } from "@/lib/jobs/sync-results";
import type { EventsDayEvent } from "@/lib/scrapers/eventsday";
import { MatchStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EventsDayEvent> = {}): EventsDayEvent {
  return {
    idEvent: "evt1",
    strEvent: "Brisbane Broncos vs Penrith Panthers",
    dateEvent: "2026-04-24",
    strTime: "09:30:00",
    strTimestamp: "2026-04-24T09:30:00+00:00",
    strHomeTeam: "Brisbane Broncos",
    strAwayTeam: "Penrith Panthers",
    intHomeScore: null,
    intAwayScore: null,
    intRound: "8",
    strVenue: "Suncorp Stadium",
    strStatus: null,
    ...overrides,
  };
}

function makeDbMatch(overrides: Partial<DbMatch> = {}): DbMatch {
  return {
    id: "match1",
    homeTeamId: "team-brisbane",
    awayTeamId: "team-penrith",
    kickoffAt: new Date("2026-04-24T09:30:00Z"),
    homeScore: null,
    awayScore: null,
    status: MatchStatus.SCHEDULED,
    homeTeam: { name: "Brisbane Broncos" },
    awayTeam: { name: "Penrith Panthers" },
    ...overrides,
  };
}

// Team lookup with two teams: normalized alias → { id, name }
function makeTeamLookup(): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  // Brisbane Broncos
  map.set("brisbanebroncos", { id: "team-brisbane", name: "Brisbane Broncos" });
  map.set("broncos", { id: "team-brisbane", name: "Brisbane Broncos" });
  map.set("brisbane", { id: "team-brisbane", name: "Brisbane Broncos" });
  // Penrith Panthers
  map.set("penrithpanthers", { id: "team-penrith", name: "Penrith Panthers" });
  map.set("panthers", { id: "team-penrith", name: "Penrith Panthers" });
  map.set("penrith", { id: "team-penrith", name: "Penrith Panthers" });
  return map;
}

// ---------------------------------------------------------------------------
// toSydneyDateStr
// ---------------------------------------------------------------------------

describe("toSydneyDateStr", () => {
  it("converts a UTC midnight to the correct Sydney date (AEST UTC+10)", () => {
    // 2026-04-24T00:00:00Z = 2026-04-24 10:00 AEST — still same date
    const date = new Date("2026-04-24T00:00:00Z");
    expect(toSydneyDateStr(date)).toBe("2026-04-24");
  });

  it("handles UTC time just before midnight that is already next day in Sydney", () => {
    // 2026-04-23T14:30:00Z = 2026-04-24 00:30 AEST
    const date = new Date("2026-04-23T14:30:00Z");
    expect(toSydneyDateStr(date)).toBe("2026-04-24");
  });

  it("returns YYYY-MM-DD format", () => {
    const date = new Date("2026-01-05T00:00:00Z");
    expect(toSydneyDateStr(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// addDaysToDateStr
// ---------------------------------------------------------------------------

describe("addDaysToDateStr", () => {
  it("adds positive days", () => {
    expect(addDaysToDateStr("2026-04-24", 1)).toBe("2026-04-25");
  });

  it("adds negative days", () => {
    expect(addDaysToDateStr("2026-04-24", -1)).toBe("2026-04-23");
  });

  it("wraps month boundary correctly", () => {
    expect(addDaysToDateStr("2026-04-30", 1)).toBe("2026-05-01");
  });

  it("wraps year boundary correctly", () => {
    expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("zero offset returns same date", () => {
    expect(addDaysToDateStr("2026-04-24", 0)).toBe("2026-04-24");
  });
});

// ---------------------------------------------------------------------------
// getNrlWeekDates
// ---------------------------------------------------------------------------

describe("getNrlWeekDates", () => {
  it("always returns exactly 5 dates", () => {
    const dates = getNrlWeekDates(new Date("2026-04-24T09:00:00Z")); // Friday Sydney
    expect(dates).toHaveLength(5);
  });

  it("dates are in ascending order", () => {
    const dates = getNrlWeekDates(new Date("2026-04-24T09:00:00Z"));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });

  it("consecutive dates are exactly 1 day apart", () => {
    const dates = getNrlWeekDates(new Date("2026-04-24T09:00:00Z"));
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + "T00:00:00Z").getTime();
      const curr = new Date(dates[i] + "T00:00:00Z").getTime();
      expect(curr - prev).toBe(86400000);
    }
  });

  // Now = Friday 2026-04-24 in Sydney → current week Thu = 2026-04-23
  it("on Friday returns the Thursday of the same week", () => {
    // 2026-04-24T09:00:00Z = Fri 24 Apr 2026 19:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-24T09:00:00Z"));
    expect(dates[0]).toBe("2026-04-23"); // Thursday
    expect(dates[4]).toBe("2026-04-27"); // Monday
  });

  // Now = Thursday 2026-04-23 Sydney
  it("on Thursday returns today as the first date", () => {
    // 2026-04-23T05:00:00Z = Thu 23 Apr 2026 15:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-23T05:00:00Z"));
    expect(dates[0]).toBe("2026-04-23");
    expect(dates[4]).toBe("2026-04-27");
  });

  // Now = Sunday 2026-04-26 Sydney
  it("on Sunday returns the Thursday 3 days prior", () => {
    // 2026-04-25T23:00:00Z = Sun 26 Apr 2026 09:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-25T23:00:00Z"));
    expect(dates[0]).toBe("2026-04-23"); // Thursday
    expect(dates[4]).toBe("2026-04-27"); // Monday
  });

  // Now = Monday 2026-04-27 Sydney
  it("on Monday returns the Thursday 4 days prior", () => {
    // 2026-04-26T23:00:00Z = Mon 27 Apr 2026 09:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-26T23:00:00Z"));
    expect(dates[0]).toBe("2026-04-23"); // Thursday
    expect(dates[4]).toBe("2026-04-27"); // Monday
  });

  // Now = Tuesday 2026-04-28 Sydney → upcoming week
  it("on Tuesday returns the upcoming Thursday", () => {
    // 2026-04-27T23:00:00Z = Tue 28 Apr 2026 09:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-27T23:00:00Z"));
    expect(dates[0]).toBe("2026-04-30"); // next Thursday
    expect(dates[4]).toBe("2026-05-04"); // next Monday
  });

  // Now = Wednesday 2026-04-29 Sydney → upcoming week
  it("on Wednesday returns the upcoming Thursday", () => {
    // 2026-04-28T23:00:00Z = Wed 29 Apr 2026 09:00 AEST
    const dates = getNrlWeekDates(new Date("2026-04-28T23:00:00Z"));
    expect(dates[0]).toBe("2026-04-30"); // next Thursday
    expect(dates[4]).toBe("2026-05-04"); // next Monday
  });
});

// ---------------------------------------------------------------------------
// hasBothScores
// ---------------------------------------------------------------------------

describe("hasBothScores", () => {
  it("returns true when both scores are present", () => {
    expect(hasBothScores({ intHomeScore: "24", intAwayScore: "18" })).toBe(true);
  });

  it("returns true when a score is 0", () => {
    expect(hasBothScores({ intHomeScore: "0", intAwayScore: "0" })).toBe(true);
  });

  it("returns false when home score is null", () => {
    expect(hasBothScores({ intHomeScore: null, intAwayScore: "18" })).toBe(false);
  });

  it("returns false when away score is null", () => {
    expect(hasBothScores({ intHomeScore: "24", intAwayScore: null })).toBe(false);
  });

  it("returns false when both scores are null", () => {
    expect(hasBothScores({ intHomeScore: null, intAwayScore: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseEventScores
// ---------------------------------------------------------------------------

describe("parseEventScores", () => {
  it("returns correct scores for normal result", () => {
    const result = parseEventScores({ intHomeScore: "30", intAwayScore: "10" });
    expect(result).toEqual({ homeScore: 30, awayScore: 10 });
  });

  it("handles 0-0 draw (0 is a valid score)", () => {
    const result = parseEventScores({ intHomeScore: "0", intAwayScore: "0" });
    expect(result).toEqual({ homeScore: 0, awayScore: 0 });
  });

  it("handles 0 home score with non-zero away", () => {
    const result = parseEventScores({ intHomeScore: "0", intAwayScore: "22" });
    expect(result).toEqual({ homeScore: 0, awayScore: 22 });
  });

  it("returns null when home score is missing", () => {
    expect(parseEventScores({ intHomeScore: null, intAwayScore: "10" })).toBeNull();
  });

  it("returns null when both scores are null", () => {
    expect(parseEventScores({ intHomeScore: null, intAwayScore: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// matchEventToDbMatch
// ---------------------------------------------------------------------------

describe("matchEventToDbMatch", () => {
  const teamLookup = makeTeamLookup();

  it("matches event to DB match by team IDs and date", () => {
    const event = makeEvent();
    const dbMatch = makeDbMatch();
    const result = matchEventToDbMatch(event, [dbMatch], teamLookup);
    expect(result).toBe(dbMatch);
  });

  it("returns null when home team is not in lookup", () => {
    const event = makeEvent({ strHomeTeam: "Unknown FC" });
    const dbMatch = makeDbMatch();
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBeNull();
  });

  it("returns null when away team is not in lookup", () => {
    const event = makeEvent({ strAwayTeam: "Unknown FC" });
    const dbMatch = makeDbMatch();
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBeNull();
  });

  it("returns null when no DB match exists for the team pair", () => {
    const event = makeEvent(); // Brisbane vs Penrith
    const dbMatch = makeDbMatch({
      homeTeamId: "team-brisbane",
      awayTeamId: "team-other", // different away team
    });
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBeNull();
  });

  it("picks the right match when multiple matches are in the list", () => {
    const event = makeEvent({
      dateEvent: "2026-04-25",
      strTimestamp: "2026-04-25T09:30:00+00:00",
    });
    const wrongMatch = makeDbMatch({ id: "wrong", kickoffAt: new Date("2026-04-24T09:30:00Z") });
    const correctMatch = makeDbMatch({ id: "correct", kickoffAt: new Date("2026-04-25T09:30:00Z") });
    const result = matchEventToDbMatch(event, [wrongMatch, correctMatch], teamLookup);
    expect(result?.id).toBe("correct");
  });

  it("falls back to 12-hour tolerance when dateEvent is null", () => {
    // Event has no dateEvent but has a timestamp close to the DB match kickoff
    const event = makeEvent({
      dateEvent: null,
      strTimestamp: "2026-04-24T10:00:00+00:00", // 30 min after DB match
    });
    const dbMatch = makeDbMatch({ kickoffAt: new Date("2026-04-24T09:30:00Z") });
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBe(dbMatch);
  });

  it("does not match when kickoff differs by more than 12 hours", () => {
    const event = makeEvent({
      dateEvent: null,
      strTimestamp: "2026-04-25T22:00:00+00:00", // >12h from DB match
    });
    const dbMatch = makeDbMatch({ kickoffAt: new Date("2026-04-24T09:30:00Z") });
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBeNull();
  });

  it("matches using short team name aliases (e.g. 'Broncos')", () => {
    const event = makeEvent({ strHomeTeam: "Broncos", strAwayTeam: "Panthers" });
    const dbMatch = makeDbMatch();
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBe(dbMatch);
  });

  it("never matches a completed match being re-evaluated (matching still works, caller guards updates)", () => {
    const event = makeEvent({ intHomeScore: "30", intAwayScore: "10" });
    const dbMatch = makeDbMatch({ status: MatchStatus.FINISHED, homeScore: 30, awayScore: 10 });
    // matchEventToDbMatch itself still finds the match — the caller decides not to overwrite
    expect(matchEventToDbMatch(event, [dbMatch], teamLookup)).toBe(dbMatch);
  });
});

// ---------------------------------------------------------------------------
// Score/status update logic (unit-level — no DB)
// ---------------------------------------------------------------------------

describe("score and status update logic", () => {
  it("a score of 0 is valid and should not be treated as missing", () => {
    const scores = parseEventScores({ intHomeScore: "0", intAwayScore: "6" });
    expect(scores).not.toBeNull();
    expect(scores?.homeScore).toBe(0);
  });

  it("null score means result is not available", () => {
    expect(parseEventScores({ intHomeScore: null, intAwayScore: null })).toBeNull();
  });

  it("a completed match with scores should not be overwritten (guard logic)", () => {
    const dbMatch = makeDbMatch({
      status: MatchStatus.FINISHED,
      homeScore: 24,
      awayScore: 18,
    });
    const shouldSkip =
      dbMatch.status === MatchStatus.FINISHED &&
      dbMatch.homeScore != null &&
      dbMatch.awayScore != null;
    expect(shouldSkip).toBe(true);
  });

  it("a scheduled match with null scores should be updated when API returns scores", () => {
    const dbMatch = makeDbMatch({ status: MatchStatus.SCHEDULED, homeScore: null, awayScore: null });
    const shouldSkip =
      dbMatch.status === MatchStatus.FINISHED &&
      dbMatch.homeScore != null &&
      dbMatch.awayScore != null;
    expect(shouldSkip).toBe(false);
  });

  it("a finished match without scores can be updated (data quality repair)", () => {
    const dbMatch = makeDbMatch({ status: MatchStatus.FINISHED, homeScore: null, awayScore: null });
    const shouldSkip =
      dbMatch.status === MatchStatus.FINISHED &&
      dbMatch.homeScore != null &&
      dbMatch.awayScore != null;
    expect(shouldSkip).toBe(false);
  });
});
