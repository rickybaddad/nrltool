// Pure Elo model — no env dependency so it can be tested without DB vars.
// Callers should pass env values explicitly from lib/config/env.

export const DEFAULT_K_FACTOR = 30;
export const DEFAULT_HOME_ADVANTAGE = 50;

export function expectedProbability(
  teamRating: number,
  opponentRating: number
): number {
  return 1 / (1 + 10 ** ((opponentRating - teamRating) / 400));
}

export function updateEloRatings(
  homeRating: number,
  awayRating: number,
  homeScore: number,
  awayScore: number,
  kFactor = DEFAULT_K_FACTOR,
  homeAdvantage = DEFAULT_HOME_ADVANTAGE
) {
  const adjHome = homeRating + homeAdvantage;
  const expectedHome = expectedProbability(adjHome, awayRating);
  const actualHome = homeScore === awayScore ? 0.5 : homeScore > awayScore ? 1 : 0;

  const newHome = homeRating + kFactor * (actualHome - expectedHome);
  const newAway = awayRating + kFactor * ((1 - actualHome) - (1 - expectedHome));

  return { expectedHome, expectedAway: 1 - expectedHome, newHome, newAway };
}

export function predictMatch(
  homeRating: number,
  awayRating: number,
  homeAdvantage = DEFAULT_HOME_ADVANTAGE
) {
  const homeProbability = expectedProbability(homeRating + homeAdvantage, awayRating);
  return { homeProbability, awayProbability: 1 - homeProbability };
}
