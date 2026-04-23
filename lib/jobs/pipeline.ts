import {
  ImportRunStatus,
  ImportRunType,
  MatchStatus,
  PredictionResultType,
  PredictionScope,
  PredictionType,
  Prisma
} from "@prisma/client";
import { getYear } from "date-fns";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { fetchOdds } from "@/lib/api/odds-api";
import { updateEloRatings, predictMatch } from "@/lib/models/elo";
import { scrapeRlpSeason } from "@/lib/scrapers/history";
import { scrapeNrlFixtures } from "@/lib/scrapers/fixtures";
import { calcEdge, confidenceLabel, impliedProbability, normalizeProbabilities } from "@/lib/utils/probability";
import { resolveTeamId } from "@/lib/utils/team-resolver";

async function startRun(type: ImportRunType) {
  return prisma.importRun.create({ data: { type, status: ImportRunStatus.SUCCESS } });
}

async function finalizeRun(id: string, data: { status: ImportRunStatus; message?: string; recordsRead?: number; recordsWritten?: number; metadata?: object }) {
  return prisma.importRun.update({ where: { id }, data: { ...data, completedAt: new Date() } });
}

function winnerFromScore(homeScore: number | null, awayScore: number | null, homeTeamId: string, awayTeamId: string) {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore === awayScore) return "DRAW" as const;
  return homeScore > awayScore ? homeTeamId : awayTeamId;
}

export async function runImportHistory(fromSeason = 2018, toSeason = getYear(new Date())) {
  const run = await startRun(ImportRunType.IMPORT_HISTORY);
  let read = 0;
  let written = 0;
  const unmatched: Array<{ season: number; home: string; away: string }> = [];

  try {
    for (let season = fromSeason; season <= toSeason; season++) {
      const rows = await scrapeRlpSeason(season);
      read += rows.length;

      for (const row of rows) {
        const homeTeamId = await resolveTeamId(row.homeTeamName);
        const awayTeamId = await resolveTeamId(row.awayTeamName);
        if (!homeTeamId || !awayTeamId) {
          unmatched.push({ season, home: row.homeTeamName, away: row.awayTeamName });
          continue;
        }

        await prisma.match.upsert({
          where: {
            season_round_homeTeamId_awayTeamId_kickoffAt: {
              season: row.season,
              round: row.round,
              homeTeamId,
              awayTeamId,
              kickoffAt: row.date
            }
          },
          update: {
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            source: "rugbyleagueproject",
            sourceUrl: row.sourceUrl,
            status: MatchStatus.FINISHED
          },
          create: {
            season: row.season,
            round: row.round,
            kickoffAt: row.date,
            homeTeamId,
            awayTeamId,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            source: "rugbyleagueproject",
            sourceUrl: row.sourceUrl,
            status: MatchStatus.FINISHED
          }
        });
        written++;
      }
    }

    await finalizeRun(run.id, {
      status: unmatched.length ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
      message: unmatched.length ? "Some historical teams could not be mapped" : "History imported",
      recordsRead: read,
      recordsWritten: written,
      metadata: { unmatched }
    });

    return { read, written, unmatched };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: read, recordsWritten: written });
    throw error;
  }
}

export async function importFullSeasonSchedule(season: number) {
  const fixtures = await scrapeNrlFixtures(season);
  const unmatched: Array<{ home: string; away: string }> = [];
  let written = 0;

  for (const fixture of fixtures) {
    const homeTeamId = await resolveTeamId(fixture.homeTeamName);
    const awayTeamId = await resolveTeamId(fixture.awayTeamName);
    if (!homeTeamId || !awayTeamId) {
      unmatched.push({ home: fixture.homeTeamName, away: fixture.awayTeamName });
      continue;
    }

    await prisma.match.upsert({
      where: { externalId: fixture.externalId },
      update: {
        season: fixture.season,
        round: fixture.round,
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        source: "nrl.com",
        sourceUrl: fixture.sourceUrl,
        homeTeamId,
        awayTeamId,
        status: fixture.status,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore
      },
      create: {
        externalId: fixture.externalId,
        season: fixture.season,
        round: fixture.round,
        kickoffAt: fixture.kickoffAt,
        venue: fixture.venue,
        source: "nrl.com",
        sourceUrl: fixture.sourceUrl,
        homeTeamId,
        awayTeamId,
        status: fixture.status,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore
      }
    });
    written++;
  }

  return { read: fixtures.length, written, unmatched };
}

export async function refreshMatchResults(season: number) {
  const rows = await scrapeRlpSeason(season);
  const unmatched: Array<{ home: string; away: string }> = [];
  let written = 0;

  for (const row of rows) {
    const homeTeamId = await resolveTeamId(row.homeTeamName);
    const awayTeamId = await resolveTeamId(row.awayTeamName);
    if (!homeTeamId || !awayTeamId) {
      unmatched.push({ home: row.homeTeamName, away: row.awayTeamName });
      continue;
    }

    await prisma.match.upsert({
      where: {
        season_round_homeTeamId_awayTeamId_kickoffAt: {
          season,
          round: row.round,
          homeTeamId,
          awayTeamId,
          kickoffAt: row.date
        }
      },
      update: {
        status: MatchStatus.FINISHED,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        source: "rugbyleagueproject",
        sourceUrl: row.sourceUrl
      },
      create: {
        season,
        round: row.round,
        kickoffAt: row.date,
        homeTeamId,
        awayTeamId,
        status: MatchStatus.FINISHED,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
        source: "rugbyleagueproject",
        sourceUrl: row.sourceUrl
      }
    });
    written++;
  }

  return { read: rows.length, written, unmatched };
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
      metadata: { unmatched: result.unmatched, season }
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure" });
    throw error;
  }
}

export async function runCalculateRatings() {
  const run = await startRun(ImportRunType.CALCULATE_RATINGS);
  const ratings = new Map<string, number>();
  const teams = await prisma.team.findMany();
  teams.forEach((team) => ratings.set(team.id, env.STARTING_ELO));

  let written = 0;

  try {
    const playedMatches = await prisma.match.findMany({ where: { status: MatchStatus.FINISHED, homeScore: { not: null }, awayScore: { not: null } }, orderBy: { kickoffAt: "asc" } });

    await prisma.teamRatingSnapshot.deleteMany({});

    for (const match of playedMatches) {
      const homeBefore = ratings.get(match.homeTeamId) ?? env.STARTING_ELO;
      const awayBefore = ratings.get(match.awayTeamId) ?? env.STARTING_ELO;
      const result = updateEloRatings(homeBefore, awayBefore, match.homeScore!, match.awayScore!);

      ratings.set(match.homeTeamId, result.newHome);
      ratings.set(match.awayTeamId, result.newAway);

      await prisma.teamRatingSnapshot.createMany({
        data: [
          { teamId: match.homeTeamId, matchId: match.id, season: match.season, ratingBefore: homeBefore, ratingAfter: result.newHome },
          { teamId: match.awayTeamId, matchId: match.id, season: match.season, ratingBefore: awayBefore, ratingAfter: result.newAway }
        ]
      });
      written += 2;
    }

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Ratings calculated", recordsRead: playedMatches.length, recordsWritten: written });
    return { read: playedMatches.length, written };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: 0, recordsWritten: written });
    throw error;
  }
}

export async function runImportOdds(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.IMPORT_ODDS);
  let written = 0;

  try {
    const oddsGames = await fetchOdds();
    const matches = await prisma.match.findMany({ where: { season, kickoffAt: { gte: new Date() } }, include: { homeTeam: true, awayTeam: true } });

    for (const game of oddsGames) {
      const match = matches.find((m) =>
        m.homeTeam.fullName.toLowerCase().includes(game.home_team.toLowerCase()) &&
        m.awayTeam.fullName.toLowerCase().includes(game.away_team.toLowerCase())
      );
      if (!match) continue;

      for (const book of game.bookmakers) {
        const market = book.markets.find((m) => m.key === "h2h");
        if (!market) continue;
        const homeOutcome = market.outcomes.find((o) => o.name.toLowerCase().includes(match.homeTeam.shortName.toLowerCase()) || o.name.toLowerCase().includes(match.homeTeam.fullName.toLowerCase()));
        const awayOutcome = market.outcomes.find((o) => o.name.toLowerCase().includes(match.awayTeam.shortName.toLowerCase()) || o.name.toLowerCase().includes(match.awayTeam.fullName.toLowerCase()));
        if (!homeOutcome || !awayOutcome) continue;

        const homeImp = impliedProbability(homeOutcome.price);
        const awayImp = impliedProbability(awayOutcome.price);
        const norm = normalizeProbabilities(homeImp, awayImp);

        await prisma.oddsSnapshot.create({
          data: {
            matchId: match.id,
            bookmakerKey: book.key,
            bookmakerTitle: book.title,
            marketKey: market.key,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homePrice: homeOutcome.price,
            awayPrice: awayOutcome.price,
            homeImpliedProbability: homeImp,
            awayImpliedProbability: awayImp,
            homeNormalizedProb: norm.a,
            awayNormalizedProb: norm.b,
            overround: norm.overround
          }
        });
        written++;
      }
    }

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Odds imported", recordsRead: oddsGames.length, recordsWritten: written, metadata: { season } });
    return { read: oddsGames.length, written };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: 0, recordsWritten: written });
    throw error;
  }
}

type PredictionOptions = {
  season?: number;
  round?: number;
  upcomingOnly?: boolean;
  scope?: PredictionScope;
};

export async function generatePredictions(options: PredictionOptions = {}) {
  const { season, round, upcomingOnly = false, scope = PredictionScope.SCHEDULED_RUN } = options;
  const where: Prisma.MatchWhereInput = {
    status: { in: [MatchStatus.SCHEDULED, MatchStatus.LIVE] }
  };

  if (season != null) where.season = season;
  if (round != null) where.round = round;
  if (upcomingOnly) where.kickoffAt = { gte: new Date() };

  const matches = await prisma.match.findMany({
    where,
    orderBy: { kickoffAt: "asc" },
    include: {
      oddsSnapshots: { orderBy: { fetchedAt: "desc" }, take: 1 }
    }
  });

  let written = 0;

  for (const match of matches) {
    const latestPreMatch = await prisma.prediction.findFirst({
      where: {
        matchId: match.id,
        predictionType: PredictionType.PRE_MATCH,
        generatedAt: { lte: match.kickoffAt }
      },
      orderBy: { generatedAt: "desc" }
    });

    if (latestPreMatch) continue;

    const homeRating = await prisma.teamRatingSnapshot.findFirst({ where: { teamId: match.homeTeamId }, orderBy: { createdAt: "desc" } });
    const awayRating = await prisma.teamRatingSnapshot.findFirst({ where: { teamId: match.awayTeamId }, orderBy: { createdAt: "desc" } });
    const pred = predictMatch(homeRating?.ratingAfter ?? env.STARTING_ELO, awayRating?.ratingAfter ?? env.STARTING_ELO);

    const bestOdds = match.oddsSnapshots[0];
    const homeEdge = calcEdge(pred.homeProbability, bestOdds?.homeNormalizedProb);
    const awayEdge = calcEdge(pred.awayProbability, bestOdds?.awayNormalizedProb);
    const maxEdge = Math.max(Math.abs(homeEdge ?? 0), Math.abs(awayEdge ?? 0));
    const confidence = confidenceLabel(maxEdge, env.CONFIDENCE_MEDIUM_THRESHOLD, env.CONFIDENCE_HIGH_THRESHOLD);

    let predictedWinnerTeamId: string | null = null;
    if (pred.homeProbability > pred.awayProbability) predictedWinnerTeamId = match.homeTeamId;
    if (pred.awayProbability > pred.homeProbability) predictedWinnerTeamId = match.awayTeamId;

    await prisma.prediction.create({
      data: {
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        modelHomeProbability: pred.homeProbability,
        modelAwayProbability: pred.awayProbability,
        predictedWinnerTeamId,
        selectedBookmaker: bestOdds?.bookmakerTitle,
        marketHomeProbability: bestOdds?.homeNormalizedProb,
        marketAwayProbability: bestOdds?.awayNormalizedProb,
        homeEdge,
        awayEdge,
        confidence,
        predictionType: PredictionType.PRE_MATCH,
        predictionScope: scope,
        modelVersion: "elo-v1",
        lockedAt: match.kickoffAt
      }
    });
    written++;
  }

  return { read: matches.length, written };
}

export async function runGeneratePredictions(options: PredictionOptions = {}) {
  const run = await startRun(ImportRunType.GENERATE_PREDICTIONS);
  try {
    const result = await generatePredictions(options);
    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Predictions generated", recordsRead: result.read, recordsWritten: result.written, metadata: options });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", metadata: options });
    throw error;
  }
}

export async function evaluatePredictions(options: { season?: number; round?: number } = {}) {
  const where: Prisma.MatchWhereInput = {
    status: MatchStatus.FINISHED,
    homeScore: { not: null },
    awayScore: { not: null }
  };

  if (options.season != null) where.season = options.season;
  if (options.round != null) where.round = options.round;

  const matches = await prisma.match.findMany({ where, orderBy: { kickoffAt: "asc" } });

  let written = 0;
  let noPrediction = 0;

  for (const match of matches) {
    const candidate = await prisma.prediction.findFirst({
      where: {
        matchId: match.id,
        predictionType: PredictionType.PRE_MATCH,
        generatedAt: { lte: match.kickoffAt }
      },
      orderBy: { generatedAt: "desc" }
    });

    const actualWinner = winnerFromScore(match.homeScore, match.awayScore, match.homeTeamId, match.awayTeamId);

    if (!candidate) {
      noPrediction++;
      continue;
    }

    const resultType = (() => {
      if (actualWinner === null) return PredictionResultType.NO_RESULT;
      if (actualWinner === "DRAW") return PredictionResultType.DRAW;
      if (!candidate.predictedWinnerTeamId) return PredictionResultType.NO_PREDICTION;
      return candidate.predictedWinnerTeamId === actualWinner ? PredictionResultType.WIN : PredictionResultType.LOSS;
    })();

    await prisma.$transaction([
      prisma.prediction.updateMany({ where: { matchId: match.id }, data: { usedForEvaluation: false } }),
      prisma.prediction.update({
        where: { id: candidate.id },
        data: {
          actualWinnerTeamId: typeof actualWinner === "string" && actualWinner !== "DRAW" ? actualWinner : null,
          wasCorrect: resultType === PredictionResultType.WIN ? true : resultType === PredictionResultType.LOSS ? false : null,
          resultType,
          usedForEvaluation: true,
          evaluatedAt: new Date()
        }
      })
    ]);

    written++;
  }

  return { read: matches.length, written, noPrediction };
}

export async function runEvaluatePredictions(options: { season?: number; round?: number } = {}) {
  const run = await startRun(ImportRunType.EVALUATE_PREDICTIONS);
  try {
    const result = await evaluatePredictions(options);
    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Predictions evaluated", recordsRead: result.read, recordsWritten: result.written, metadata: options });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", metadata: options });
    throw error;
  }
}

export async function runRefreshResults(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.REFRESH_RESULTS);
  try {
    const result = await refreshMatchResults(season);
    await finalizeRun(run.id, {
      status: result.unmatched.length ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
      message: `Results refreshed for ${season}`,
      recordsRead: result.read,
      recordsWritten: result.written,
      metadata: { unmatched: result.unmatched, season }
    });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure" });
    throw error;
  }
}

export async function runSyncSeason(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.SYNC_SEASON);
  try {
    const fixtures = await importFullSeasonSchedule(season);
    const results = await refreshMatchResults(season);
    let odds: { read: number; written: number } | { skipped: true; reason: string };

    try {
      odds = await runImportOdds(season);
    } catch (error) {
      odds = { skipped: true, reason: error instanceof Error ? error.message : "Odds import failed" };
    }

    const predictions = await generatePredictions({ season, upcomingOnly: true, scope: PredictionScope.SEASON_SYNC });
    await runCalculateRatings();
    const evaluation = await evaluatePredictions({ season });

    const result = { fixtures, results, odds, predictions, evaluation };
    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: `Season ${season} sync completed`, metadata: result });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure" });
    throw error;
  }
}

export async function runBootstrap(season = getYear(new Date())) {
  const run = await startRun(ImportRunType.BOOTSTRAP);
  try {
    const result = {
      history: await runImportHistory(),
      sync: await runSyncSeason(season)
    };

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Bootstrap completed", metadata: result });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure" });
    throw error;
  }
}
