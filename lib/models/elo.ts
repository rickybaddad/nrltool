import { env } from "@/lib/config/env";

export function expectedProbability(teamRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / 400));
}

export function updateEloRatings(
  homeRating: number,
  awayRating: number,
  homeScore: number,
  awayScore: number,
  kFactor = env.K_FACTOR,
  homeAdvantage = env.HOME_ADVANTAGE_ELO
) {
  const adjHome = homeRating + homeAdvantage;
  const expectedHome = expectedProbability(adjHome, awayRating);
  const actualHome = homeScore === awayScore ? 0.5 : homeScore > awayScore ? 1 : 0;

  const newHome = homeRating + kFactor * (actualHome - expectedHome);
  const newAway = awayRating + kFactor * ((1 - actualHome) - (1 - expectedHome));

  return { expectedHome, expectedAway: 1 - expectedHome, newHome, newAway };
}

export function predictMatch(homeRating: number, awayRating: number, homeAdvantage = env.HOME_ADVANTAGE_ELO) {
  const homeProbability = expectedProbability(homeRating + homeAdvantage, awayRating);
  return { homeProbability, awayProbability: 1 - homeProbability };
}
