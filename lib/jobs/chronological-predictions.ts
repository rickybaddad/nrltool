/**
 * Chronological prediction generation for a full season.
 * Processes matches in kickoff order, predicting BEFORE updating ratings —
 * no lookahead bias.
 */
import { MatchStatus, ImportRunStatus, ImportRunType, Prisma } from "@prisma/client";
import { getYear } from "date-fns";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { predictMatch, updateEloRatings } from "@/lib/models/elo";
import {
  computeExpectedScores,
  scoreProbability,
  blendProbabilities,
  type TeamScoreStats,
  type LeagueStats,
} from "@/lib/models/score-model";
import {
  calcEdge,
  confidenceLabel,
} from "@/lib/utils/probability";

export async function generateSeasonPredictionsChronologically(
  season = getYear(new Date())
): Promise<{ read: number; written: number }> {
  const [historicalCompleted, seasonMatches] = await Promise.all([
    // All finished matches from prior seasons — used only for bootstrapping ratings
    prisma.match.findMany({
      where: {
        season: { lt: season },
        status: MatchStatus.FINISHED,
        homeScore: { not: null },
        awayScore: { not: null },
      },
      orderBy: { kickoffAt: "asc" },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    }),
    // Target season — all matches (past + upcoming)
    prisma.match.findMany({
      where: { season },
      orderBy: { kickoffAt: "asc" },
      include: {
        oddsSnapshots: {
          where: { bookmaker: "sportsbet" },
          orderBy: { pulledAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  if (seasonMatches.length === 0) return { read: 0, written: 0 };

  // In-memory state
  const eloRatings = new Map<string, number>();
  const scoreStats = new Map<string, TeamScoreStats>();
  const league: LeagueStats = { totalPoints: 0, totalGames: 0 };

  const getElo = (id: string) => eloRatings.get(id) ?? env.STARTING_ELO;
  const getStat = (id: string): TeamScoreStats =>
    scoreStats.get(id) ?? { pointsFor: 0, pointsAgainst: 0, games: 0 };

  function applyResult(
    homeTeamId: string,
    awayTeamId: string,
    homeScore: number,
    awayScore: number
  ) {
    const { newHome, newAway } = updateEloRatings(
      getElo(homeTeamId),
      getElo(awayTeamId),
      homeScore,
      awayScore,
      env.K_FACTOR,
      env.HOME_ADVANTAGE_ELO
    );
    eloRatings.set(homeTeamId, newHome);
    eloRatings.set(awayTeamId, newAway);

    const hs = getStat(homeTeamId);
    const as_ = getStat(awayTeamId);
    scoreStats.set(homeTeamId, {
      pointsFor: hs.pointsFor + homeScore,
      pointsAgainst: hs.pointsAgainst + awayScore,
      games: hs.games + 1,
    });
    scoreStats.set(awayTeamId, {
      pointsFor: as_.pointsFor + awayScore,
      pointsAgainst: as_.pointsAgainst + homeScore,
      games: as_.games + 1,
    });

    league.totalPoints += homeScore + awayScore;
    league.totalGames++;
  }

  // 1. Bootstrap from all prior-season results
  for (const m of historicalCompleted) {
    applyResult(m.homeTeamId, m.awayTeamId, m.homeScore!, m.awayScore!);
  }

  // 2. Generate predictions for every target-season match in order
  const generatedAt = new Date();
  const eloWeight = env.ELO_MODEL_WEIGHT;
  const scoreAdv = env.SCORE_HOME_ADVANTAGE_FACTOR;
  const scoreScale = env.SCORE_MODEL_SCALE;

  const rows: Prisma.PredictionCreateManyInput[] = [];

  for (const match of seasonMatches) {
    const homeElo = getElo(match.homeTeamId);
    const awayElo = getElo(match.awayTeamId);

    const eloPred = predictMatch(homeElo, awayElo, env.HOME_ADVANTAGE_ELO);

    const { expectedHome, expectedAway } = computeExpectedScores(
      getStat(match.homeTeamId),
      getStat(match.awayTeamId),
      { ...league },
      scoreAdv
    );
    const scoreProb = scoreProbability(expectedHome, expectedAway, scoreScale);

    const finalHome = blendProbabilities(eloPred.homeProbability, scoreProb, eloWeight);
    const finalAway = 1 - finalHome;

    const snap = match.oddsSnapshots[0] ?? null;
    const homeEdge = calcEdge(finalHome, snap?.homeImpliedNormalized ?? undefined);
    const awayEdge = calcEdge(finalAway, snap?.awayImpliedNormalized ?? undefined);
    const maxEdge = Math.max(Math.abs(homeEdge ?? 0), Math.abs(awayEdge ?? 0));
    const confidence = confidenceLabel(
      maxEdge,
      env.CONFIDENCE_MEDIUM_THRESHOLD,
      env.CONFIDENCE_HIGH_THRESHOLD
    );

    rows.push({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      modelVersion: "blend-v1",
      generatedAt,
      lockedAt: match.kickoffAt,
      isLatest: true,
      homeTeamRating: homeElo,
      awayTeamRating: awayElo,
      homeAdvantageApplied: env.HOME_ADVANTAGE_ELO,
      eloDifference: homeElo - awayElo,
      homeWinProbability: finalHome,
      awayWinProbability: finalAway,
      eloHomeProbability: eloPred.homeProbability,
      eloAwayProbability: eloPred.awayProbability,
      scoreModelHomeProbability: scoreProb,
      scoreModelAwayProbability: 1 - scoreProb,
      finalHomeProbability: finalHome,
      finalAwayProbability: finalAway,
      expectedHomeScore: expectedHome,
      expectedAwayScore: expectedAway,
      expectedMargin: expectedHome - expectedAway,
      expectedTotal: expectedHome + expectedAway,
      homeImpliedProbability: snap?.homeImpliedNormalized ?? null,
      awayImpliedProbability: snap?.awayImpliedNormalized ?? null,
      homeEdge,
      awayEdge,
      confidence,
      selectedBookmaker: snap?.bookmakerTitle ?? null,
      predictedWinnerTeamId:
        finalHome > finalAway
          ? match.homeTeamId
          : finalAway > finalHome
          ? match.awayTeamId
          : null,
    });

    // Update state after prediction — preserve temporal order
    if (
      match.status === MatchStatus.FINISHED &&
      match.homeScore != null &&
      match.awayScore != null
    ) {
      applyResult(match.homeTeamId, match.awayTeamId, match.homeScore, match.awayScore);
    }
  }

  const matchIds = seasonMatches.map((m) => m.id);

  // Retire old latest flags, insert all new predictions
  await prisma.prediction.updateMany({
    where: { matchId: { in: matchIds }, isLatest: true },
    data: { isLatest: false },
  });
  const { count } = await prisma.prediction.createMany({ data: rows });

  return { read: seasonMatches.length, written: count };
}

export async function runGenerateSeasonPredictions(
  season = getYear(new Date())
): Promise<{ read: number; written: number }> {
  const run = await prisma.importRun.create({
    data: {
      type: ImportRunType.GENERATE_PREDICTIONS,
      status: ImportRunStatus.SUCCESS,
      startedAt: new Date(),
    },
  });

  try {
    const result = await generateSeasonPredictionsChronologically(season);
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status: ImportRunStatus.SUCCESS,
        message: `Season ${season}: ${result.written} predictions generated (blend-v1, chronological)`,
        recordsRead: result.read,
        recordsWritten: result.written,
        metadata: { season } as Prisma.InputJsonValue,
      },
    });
    return result;
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
