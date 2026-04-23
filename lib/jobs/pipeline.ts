/**
 * Core pipeline: all season-aware import/sync/prediction/evaluation jobs.
 * Every exported `run*` function logs an ImportRun row and is idempotent.
 */
import {
  ImportRunStatus,
  ImportRunType,
  MatchStatus,
  PredictionResultType,
  Prisma,
} from "@prisma/client";
import { getYear } from "date-fns";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { fetchOdds } from "@/lib/api/odds-api";
import { updateEloRatings, predictMatch } from "@/lib/models/elo";
import { scrapeRlpSeason } from "@/lib/scrapers/history";
import { scrapeNrlFixtures } from "@/lib/scrapers/fixtures";
import {
  calcEdge,
  confidenceLabel,
  impliedProbability,
  normalizeProbabilities,
} from "@/lib/utils/probability";
import { resolveTeamId } from "@/lib/utils/team-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startRun(type: ImportRunType) {
  return prisma.importRun.create({
    data: { type, status: ImportRunStatus.SUCCESS, startedAt: new Date() },
  });
}

async function finalizeRun(
  id: string,
  data: {
    status: ImportRunStatus;
    message?: string;
    recordsRead?: number;
    recordsWritten?: number;
    recordsProcessed?: number;
    errorMessage?: string;
    metadata?: object;
  }
) {
  return prisma.importRun.update({
    where: { id },
    data: {
      ...data,
      completedAt: new Date(),
      metadata: data.metadata as Prisma.InputJsonValue,
    },
  });
}

function winnerFromScore(
  homeScore: number | null,
  awayScore: number | null,
  homeTeamId: string,
  awayTeamId: string
): string | "DRAW" | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore === awayScore) return "DRAW";
  return homeScore > awayScore ? homeTeamId : awayTeamId;
}

function generateMatchSlug(
  homeSlug: string,
  awaySlug: string,
  season: number,
  round: number | null
): string {
  const r = round ? `r${round}` : "r0";
  return `${season}-${r}-${homeSlug}-vs-${awaySlug}`;
}

// Upsert a Season record and return its id
async function upsertSeason(year: number): Promise<string> {
  const season = await prisma.season.upsert({
    where: { year },
    update: {},
    create: { year, isActive: year === getYear(new Date()) },
  });
  return season.id;
}

// Upsert a Round record and return its id
async function upsertRound(seasonId: string, roundNumber: number): Promise<string> {
  const round = await prisma.round.upsert({
    where: { seasonId_roundNumber: { seasonId, roundNumber } },
    update: {},
    create: { seasonId, roundNumber, name: `Round ${roundNumber}` },
  });
  return round.id;
}

// ---------------------------------------------------------------------------
// Seed teams (delegates to seed.ts export)
// ---------------------------------------------------------------------------

export async function runSeedTeams() {
  const run = await startRun(ImportRunType.SEED_TEAMS);
  try {
    const { seedTeams } = await import("@/prisma/seed");
    await seedTeams();
    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Teams seeded" });
    return { ok: true };
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Import full season schedule (NRL draw scraper)
// ---------------------------------------------------------------------------

export async function importFullSeasonSchedule(season: number) {
  const fixtures = await scrapeNrlFixtures(season);
  const seasonId = await upsertSeason(season);

  const unmatched: Array<{ home: string; away: string }> = [];
  let written = 0;

  for (const fixture of fixtures) {
    const homeTeamId = await resolveTeamId(fixture.homeTeamName);
    const awayTeamId = await resolveTeamId(fixture.awayTeamName);
    if (!homeTeamId || !awayTeamId) {
      unmatched.push({ home: fixture.homeTeamName, away: fixture.awayTeamName });
      continue;
    }

    const homeTeam = await prisma.team.findUnique({ where: { id: homeTeamId } });
    const awayTeam = await prisma.team.findUnique({ where: { id: awayTeamId } });

    const roundId =
      fixture.round && fixture.round > 0
        ? await upsertRound(seasonId, fixture.round)
        : undefined;

    const slug = homeTeam && awayTeam
      ? generateMatchSlug(homeTeam.slug, awayTeam.slug, fixture.season, fixture.round)
      : undefined;

    const externalId = fixture.externalId;

    await prisma.match.upsert({
      where: { externalId },
      update: {
        season: fixture.season,
        round: fixture.round,
        seasonId,
        roundId,
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        source: "nrl.com",
        sourceUrl: fixture.sourceUrl,
        homeTeamId,
        awayTeamId,
        status: fixture.status,
        homeScore: fixture.homeScore ?? null,
        awayScore: fixture.awayScore ?? null,
        ...(slug ? { slug } : {}),
      },
      create: {
        externalId,
        slug,
        season: fixture.season,
        round: fixture.round,
        seasonId,
        roundId,
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        source: "nrl.com",
        sourceUrl: fixture.sourceUrl,
        homeTeamId,
        awayTeamId,
        status: fixture.status,
        homeScore: fixture.homeScore ?? null,
        awayScore: fixture.awayScore ?? null,
      },
    });
    written++;
  }

  return { read: fixtures.length, written, unmatched };
}

export async function runImportFixtures(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.IMPORT_FIXTURES);
  try {
    const result = await importFullSeasonSchedule(season);
    await finalizeRun(run.id, {
      status: result.unmatched.length ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
      message: `Season ${season} fixtures import completed`,
      recordsRead: result.read,
      recordsWritten: result.written,
      metadata: { unmatched: result.unmatched, season },
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Import historical results (Rugby League Project)
// ---------------------------------------------------------------------------

export async function runImportHistory(
  fromSeason = 2018,
  toSeason = getYear(new Date())
) {
  const run = await startRun(ImportRunType.IMPORT_HISTORY);
  let read = 0;
  let written = 0;
  const unmatched: Array<{ season: number; home: string; away: string }> = [];

  try {
    for (let year = fromSeason; year <= toSeason; year++) {
      const rows = await scrapeRlpSeason(year);
      read += rows.length;

      const seasonId = await upsertSeason(year);

      for (const row of rows) {
        const homeTeamId = await resolveTeamId(row.homeTeamName);
        const awayTeamId = await resolveTeamId(row.awayTeamName);
        if (!homeTeamId || !awayTeamId) {
          unmatched.push({ season: year, home: row.homeTeamName, away: row.awayTeamName });
          continue;
        }

        const roundId =
          row.round && row.round > 0
            ? await upsertRound(seasonId, row.round)
            : undefined;

        await prisma.match.upsert({
          where: {
            season_round_homeTeamId_awayTeamId_kickoffAt: {
              season: row.season,
              round: row.round,
              homeTeamId,
              awayTeamId,
              kickoffAt: row.date,
            },
          },
          update: {
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            source: "rugbyleagueproject",
            sourceUrl: row.sourceUrl,
            status: MatchStatus.FINISHED,
            seasonId,
            roundId,
          },
          create: {
            season: row.season,
            round: row.round,
            seasonId,
            roundId,
            kickoffAt: row.date,
            homeTeamId,
            awayTeamId,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            source: "rugbyleagueproject",
            sourceUrl: row.sourceUrl,
            status: MatchStatus.FINISHED,
          },
        });
        written++;
      }
    }

    await finalizeRun(run.id, {
      status: unmatched.length ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
      message: unmatched.length
        ? "History imported with some unmatched teams"
        : "History imported",
      recordsRead: read,
      recordsWritten: written,
      metadata: { unmatched },
    });

    return { read, written, unmatched };
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      recordsRead: read,
      recordsWritten: written,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Refresh completed match results
// ---------------------------------------------------------------------------

export async function refreshMatchResults(season: number) {
  const fixtures = await scrapeNrlFixtures(season);
  const finished = fixtures.filter((f) => f.status === MatchStatus.FINISHED);
  let written = 0;

  for (const fixture of finished) {
    const updated = await prisma.match.updateMany({
      where: { externalId: fixture.externalId },
      data: {
        status: MatchStatus.FINISHED,
        homeScore: fixture.homeScore ?? null,
        awayScore: fixture.awayScore ?? null,
      },
    });
    written += updated.count;
  }

  return { read: finished.length, written };
}

export async function runRefreshResults(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.REFRESH_RESULTS);
  try {
    const result = await refreshMatchResults(season);
    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: `Results refreshed for ${season}`,
      recordsRead: result.read,
      recordsWritten: result.written,
      metadata: { season },
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Calculate Elo ratings from completed matches
// ---------------------------------------------------------------------------

export async function runCalculateRatings() {
  const run = await startRun(ImportRunType.CALCULATE_RATINGS);
  const ratings = new Map<string, number>();
  const teams = await prisma.team.findMany();
  teams.forEach((t) => ratings.set(t.id, env.STARTING_ELO));

  let written = 0;

  try {
    const playedMatches = await prisma.match.findMany({
      where: {
        status: MatchStatus.FINISHED,
        homeScore: { not: null },
        awayScore: { not: null },
      },
      orderBy: { kickoffAt: "asc" },
    });

    // Full recalculate — clear and rebuild
    await prisma.teamRatingSnapshot.deleteMany({});

    for (const match of playedMatches) {
      const homeBefore = ratings.get(match.homeTeamId) ?? env.STARTING_ELO;
      const awayBefore = ratings.get(match.awayTeamId) ?? env.STARTING_ELO;
      const result = updateEloRatings(
        homeBefore,
        awayBefore,
        match.homeScore!,
        match.awayScore!
      );

      ratings.set(match.homeTeamId, result.newHome);
      ratings.set(match.awayTeamId, result.newAway);

      await prisma.teamRatingSnapshot.createMany({
        data: [
          {
            teamId: match.homeTeamId,
            sourceMatchId: match.id,
            seasonId: match.seasonId,
            season: match.season,
            ratingBefore: homeBefore,
            ratingAfter: result.newHome,
            ratingSystem: "elo-v1",
            asOfDate: match.kickoffAt,
          },
          {
            teamId: match.awayTeamId,
            sourceMatchId: match.id,
            seasonId: match.seasonId,
            season: match.season,
            ratingBefore: awayBefore,
            ratingAfter: result.newAway,
            ratingSystem: "elo-v1",
            asOfDate: match.kickoffAt,
          },
        ],
      });
      written += 2;
    }

    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: "Ratings calculated",
      recordsRead: playedMatches.length,
      recordsWritten: written,
    });
    return { read: playedMatches.length, written };
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      recordsWritten: written,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Import odds from The Odds API
// ---------------------------------------------------------------------------

export async function runImportOdds(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.IMPORT_ODDS);
  let written = 0;

  try {
    const oddsGames = await fetchOdds();
    const matches = await prisma.match.findMany({
      where: { season, kickoffAt: { gte: new Date() } },
      include: { homeTeam: true, awayTeam: true },
    });

    for (const game of oddsGames) {
      const match = matches.find(
        (m) =>
          m.homeTeam.name.toLowerCase().includes(game.home_team.toLowerCase()) ||
          game.home_team.toLowerCase().includes(m.homeTeam.shortName.toLowerCase())
      );
      if (!match) continue;

      for (const book of game.bookmakers) {
        const market = book.markets.find((mk) => mk.key === "h2h");
        if (!market) continue;

        const homeOutcome = market.outcomes.find(
          (o) =>
            o.name.toLowerCase().includes(match.homeTeam.shortName.toLowerCase()) ||
            o.name.toLowerCase().includes(match.homeTeam.name.toLowerCase())
        );
        const awayOutcome = market.outcomes.find(
          (o) =>
            o.name.toLowerCase().includes(match.awayTeam.shortName.toLowerCase()) ||
            o.name.toLowerCase().includes(match.awayTeam.name.toLowerCase())
        );
        if (!homeOutcome || !awayOutcome) continue;

        const homeImp = impliedProbability(homeOutcome.price);
        const awayImp = impliedProbability(awayOutcome.price);
        const norm = normalizeProbabilities(homeImp, awayImp);

        await prisma.oddsSnapshot.create({
          data: {
            matchId: match.id,
            source: "the-odds-api",
            bookmaker: book.key,
            bookmakerTitle: book.title,
            marketType: market.key,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeOdds: homeOutcome.price,
            awayOdds: awayOutcome.price,
            homeImpliedRaw: homeImp,
            awayImpliedRaw: awayImp,
            homeImpliedNormalized: norm.a,
            awayImpliedNormalized: norm.b,
            overround: norm.overround,
            pulledAt: new Date(),
          },
        });
        written++;
      }
    }

    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: "Odds imported",
      recordsRead: oddsGames.length,
      recordsWritten: written,
      metadata: { season },
    });
    return { read: oddsGames.length, written };
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      recordsWritten: written,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Generate predictions
// ---------------------------------------------------------------------------

type PredictionOptions = {
  season?: number;
  round?: number;
  upcomingOnly?: boolean;
};

export async function generatePredictions(options: PredictionOptions = {}) {
  const { season, round, upcomingOnly = false } = options;
  const where: Prisma.MatchWhereInput = {
    status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] },
  };

  if (season != null) where.season = season;
  if (round != null) where.round = round;
  if (upcomingOnly) where.kickoffAt = { gte: new Date() };

  const matches = await prisma.match.findMany({
    where,
    orderBy: { kickoffAt: "asc" },
    include: {
      oddsSnapshots: { orderBy: { pulledAt: "desc" }, take: 1 },
    },
  });

  let written = 0;

  for (const match of matches) {
    // Skip if a valid pre-match prediction already exists for this match
    const existing = await prisma.prediction.findFirst({
      where: {
        matchId: match.id,
        generatedAt: { lte: match.kickoffAt },
        isLatest: true,
      },
    });
    if (existing) continue;

    // Get latest ratings for each team
    const homeSnap = await prisma.teamRatingSnapshot.findFirst({
      where: { teamId: match.homeTeamId },
      orderBy: { asOfDate: "desc" },
    });
    const awaySnap = await prisma.teamRatingSnapshot.findFirst({
      where: { teamId: match.awayTeamId },
      orderBy: { asOfDate: "desc" },
    });

    const homeRating = homeSnap?.ratingAfter ?? env.STARTING_ELO;
    const awayRating = awaySnap?.ratingAfter ?? env.STARTING_ELO;
    const pred = predictMatch(homeRating, awayRating, env.HOME_ADVANTAGE_ELO);

    const bestOdds = match.oddsSnapshots[0] ?? null;
    const homeEdge = calcEdge(pred.homeProbability, bestOdds?.homeImpliedNormalized);
    const awayEdge = calcEdge(pred.awayProbability, bestOdds?.awayImpliedNormalized);
    const maxEdge = Math.max(Math.abs(homeEdge ?? 0), Math.abs(awayEdge ?? 0));
    const confidence = confidenceLabel(
      maxEdge,
      env.CONFIDENCE_MEDIUM_THRESHOLD,
      env.CONFIDENCE_HIGH_THRESHOLD
    );

    let predictedWinnerTeamId: string | null = null;
    if (pred.homeProbability > pred.awayProbability) predictedWinnerTeamId = match.homeTeamId;
    else if (pred.awayProbability > pred.homeProbability) predictedWinnerTeamId = match.awayTeamId;

    // Mark any previous latest for this match as not-latest
    await prisma.prediction.updateMany({
      where: { matchId: match.id, isLatest: true },
      data: { isLatest: false },
    });

    await prisma.prediction.create({
      data: {
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        modelVersion: "elo-v1",
        generatedAt: new Date(),
        lockedAt: match.kickoffAt,
        isLatest: true,
        homeTeamRating: homeRating,
        awayTeamRating: awayRating,
        homeAdvantageApplied: env.HOME_ADVANTAGE_ELO,
        eloDifference: homeRating - awayRating,
        homeWinProbability: pred.homeProbability,
        awayWinProbability: pred.awayProbability,
        homeImpliedProbability: bestOdds?.homeImpliedNormalized ?? null,
        awayImpliedProbability: bestOdds?.awayImpliedNormalized ?? null,
        homeEdge,
        awayEdge,
        confidence,
        selectedBookmaker: bestOdds?.bookmakerTitle ?? null,
        predictedWinnerTeamId,
      },
    });
    written++;
  }

  return { read: matches.length, written };
}

export async function runGeneratePredictions(options: PredictionOptions = {}) {
  const run = await startRun(ImportRunType.GENERATE_PREDICTIONS);
  try {
    const result = await generatePredictions(options);
    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: "Predictions generated",
      recordsRead: result.read,
      recordsWritten: result.written,
      metadata: options,
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      metadata: options,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Evaluate completed predictions
// ---------------------------------------------------------------------------

export async function evaluatePredictions(
  options: { season?: number; round?: number } = {}
) {
  const where: Prisma.MatchWhereInput = {
    status: MatchStatus.FINISHED,
    homeScore: { not: null },
    awayScore: { not: null },
  };

  if (options.season != null) where.season = options.season;
  if (options.round != null) where.round = options.round;

  const matches = await prisma.match.findMany({
    where,
    orderBy: { kickoffAt: "asc" },
  });

  let written = 0;
  let noPrediction = 0;

  for (const match of matches) {
    // Best pre-match prediction: generated before kickoff, latest by time
    const candidate = await prisma.prediction.findFirst({
      where: {
        matchId: match.id,
        generatedAt: { lte: match.kickoffAt },
      },
      orderBy: { generatedAt: "desc" },
    });

    const actualWinner = winnerFromScore(
      match.homeScore,
      match.awayScore,
      match.homeTeamId,
      match.awayTeamId
    );

    if (!candidate) {
      noPrediction++;
      continue;
    }

    const resultType: PredictionResultType = (() => {
      if (actualWinner === null) return PredictionResultType.NO_RESULT;
      if (actualWinner === "DRAW") return PredictionResultType.DRAW;
      if (!candidate.predictedWinnerTeamId) return PredictionResultType.NO_PREDICTION;
      return candidate.predictedWinnerTeamId === actualWinner
        ? PredictionResultType.WIN
        : PredictionResultType.LOSS;
    })();

    await prisma.$transaction([
      prisma.prediction.updateMany({
        where: { matchId: match.id },
        data: { usedForEvaluation: false },
      }),
      prisma.prediction.update({
        where: { id: candidate.id },
        data: {
          actualWinnerTeamId:
            typeof actualWinner === "string" && actualWinner !== "DRAW"
              ? actualWinner
              : null,
          wasCorrect:
            resultType === PredictionResultType.WIN
              ? true
              : resultType === PredictionResultType.LOSS
              ? false
              : null,
          resultType,
          usedForEvaluation: true,
          evaluatedAt: new Date(),
        },
      }),
    ]);

    written++;
  }

  return { read: matches.length, written, noPrediction };
}

export async function runEvaluatePredictions(
  options: { season?: number; round?: number } = {}
) {
  const run = await startRun(ImportRunType.EVALUATE_PREDICTIONS);
  try {
    const result = await evaluatePredictions(options);
    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: "Predictions evaluated",
      recordsRead: result.read,
      recordsWritten: result.written,
      metadata: options,
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
      metadata: options,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Season sync orchestration
// ---------------------------------------------------------------------------

export async function runSyncSeason(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.SYNC_SEASON);
  try {
    const fixtures = await importFullSeasonSchedule(season);
    const results = await refreshMatchResults(season);

    let odds: { read: number; written: number } | { skipped: true; reason: string };
    try {
      odds = await runImportOdds(season);
    } catch (error) {
      odds = {
        skipped: true,
        reason: error instanceof Error ? error.message : "Odds import failed",
      };
    }

    await runCalculateRatings();

    const predictions = await generatePredictions({ season, upcomingOnly: true });
    const evaluation = await evaluatePredictions({ season });

    const result = { fixtures, results, odds, predictions, evaluation };
    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: `Season ${season} sync completed`,
      metadata: result,
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap: seed teams → import history → sync current season
// ---------------------------------------------------------------------------

export async function runBootstrap(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.BOOTSTRAP);
  try {
    await runSeedTeams();

    let history: Awaited<ReturnType<typeof runImportHistory>> | { skipped: true; reason: string };
    try {
      history = await runImportHistory(2018, season - 1);
    } catch (error) {
      history = {
        skipped: true,
        reason: error instanceof Error ? error.message : "History import failed",
      };
    }

    const sync = await runSyncSeason(season);

    const result = { history, sync };
    await finalizeRun(run.id, {
      status: ImportRunStatus.SUCCESS,
      message: "Bootstrap completed",
      metadata: result,
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, {
      status: ImportRunStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}
