import { ImportRunStatus, ImportRunType, MatchStatus } from "@prisma/client";
import { endOfWeek, getYear, startOfWeek } from "date-fns";
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

export async function runImportFixtures() {
  const run = await startRun(ImportRunType.IMPORT_FIXTURES);
  const fixtures = await scrapeNrlFixtures();
  const unmatched: Array<{ home: string; away: string }> = [];
  let written = 0;

  try {
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
          season: getYear(fixture.kickoffAt),
          round: fixture.round,
          kickoffAt: fixture.kickoffAt,
          venue: fixture.venue,
          source: "nrl.com",
          sourceUrl: fixture.sourceUrl,
          homeTeamId,
          awayTeamId,
          status: MatchStatus.SCHEDULED
        },
        create: {
          externalId: fixture.externalId,
          season: getYear(fixture.kickoffAt),
          round: fixture.round,
          kickoffAt: fixture.kickoffAt,
          venue: fixture.venue,
          source: "nrl.com",
          sourceUrl: fixture.sourceUrl,
          homeTeamId,
          awayTeamId,
          status: MatchStatus.SCHEDULED
        }
      });
      written++;
    }

    await finalizeRun(run.id, {
      status: unmatched.length ? ImportRunStatus.PARTIAL : ImportRunStatus.SUCCESS,
      message: "Fixtures import completed",
      recordsRead: fixtures.length,
      recordsWritten: written,
      metadata: { unmatched }
    });

    return { read: fixtures.length, written, unmatched };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: fixtures.length, recordsWritten: written });
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

export async function runImportOdds() {
  const run = await startRun(ImportRunType.IMPORT_ODDS);
  let written = 0;

  try {
    const oddsGames = await fetchOdds();
    const now = new Date();
    const from = startOfWeek(now, { weekStartsOn: 1 });
    const to = endOfWeek(now, { weekStartsOn: 1 });
    const matches = await prisma.match.findMany({ where: { kickoffAt: { gte: from, lte: to } }, include: { homeTeam: true, awayTeam: true } });

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

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Odds imported", recordsRead: oddsGames.length, recordsWritten: written });
    return { read: oddsGames.length, written };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: 0, recordsWritten: written });
    throw error;
  }
}

export async function runGeneratePredictions() {
  const run = await startRun(ImportRunType.GENERATE_PREDICTIONS);
  const now = new Date();
  const upcoming = await prisma.match.findMany({
    where: { kickoffAt: { gte: now } },
    orderBy: { kickoffAt: "asc" },
    include: {
      homeTeam: true,
      awayTeam: true,
      oddsSnapshots: { orderBy: { fetchedAt: "desc" } }
    }
  });

  let written = 0;

  try {
    for (const match of upcoming) {
      const homeRating = await prisma.teamRatingSnapshot.findFirst({ where: { teamId: match.homeTeamId }, orderBy: { createdAt: "desc" } });
      const awayRating = await prisma.teamRatingSnapshot.findFirst({ where: { teamId: match.awayTeamId }, orderBy: { createdAt: "desc" } });
      const pred = predictMatch(homeRating?.ratingAfter ?? env.STARTING_ELO, awayRating?.ratingAfter ?? env.STARTING_ELO);

      const bestOdds = match.oddsSnapshots[0];
      const homeEdge = calcEdge(pred.homeProbability, bestOdds?.homeNormalizedProb);
      const awayEdge = calcEdge(pred.awayProbability, bestOdds?.awayNormalizedProb);
      const maxEdge = Math.max(Math.abs(homeEdge ?? 0), Math.abs(awayEdge ?? 0));
      const confidence = confidenceLabel(maxEdge, env.CONFIDENCE_MEDIUM_THRESHOLD, env.CONFIDENCE_HIGH_THRESHOLD);

      await prisma.prediction.create({
        data: {
          matchId: match.id,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          modelHomeProbability: pred.homeProbability,
          modelAwayProbability: pred.awayProbability,
          selectedBookmaker: bestOdds?.bookmakerTitle,
          marketHomeProbability: bestOdds?.homeNormalizedProb,
          marketAwayProbability: bestOdds?.awayNormalizedProb,
          homeEdge,
          awayEdge,
          confidence
        }
      });
      written++;
    }

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Predictions generated", recordsRead: upcoming.length, recordsWritten: written });
    return { read: upcoming.length, written };
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure", recordsRead: upcoming.length, recordsWritten: written });
    throw error;
  }
}

export async function runBootstrap() {
  const run = await startRun(ImportRunType.BOOTSTRAP);
  try {
    const result = {
      history: await runImportHistory(),
      ratings: await runCalculateRatings(),
      fixtures: await runImportFixtures(),
      odds: await runImportOdds(),
      predictions: await runGeneratePredictions()
    };

    await finalizeRun(run.id, { status: ImportRunStatus.SUCCESS, message: "Bootstrap completed", metadata: result });
    return result;
  } catch (error) {
    await finalizeRun(run.id, { status: ImportRunStatus.FAILED, message: error instanceof Error ? error.message : "Unknown failure" });
    throw error;
  }
}
