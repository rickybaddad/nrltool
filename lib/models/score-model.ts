// Pure scoring model — no env/DB dependency so tests can run without setup.
// Callers pass env values explicitly.

export const DEFAULT_SCORE_HOME_ADVANTAGE = 1.1;
export const DEFAULT_SCORE_MODEL_SCALE = 10;
export const DEFAULT_LEAGUE_AVG_FALLBACK = 22;

export type TeamScoreStats = {
  pointsFor: number;
  pointsAgainst: number;
  games: number;
};

export type LeagueStats = {
  totalPoints: number;
  totalGames: number;
};

export function leagueAvgPointsPerTeam(
  stats: LeagueStats,
  fallback = DEFAULT_LEAGUE_AVG_FALLBACK
): number {
  if (stats.totalGames === 0) return fallback;
  return stats.totalPoints / (2 * stats.totalGames);
}

/**
 * Dixon-Coles style attack/defence expected scores.
 * expectedHome = leagueAvg * homeAttack * awayDefence * homeAdvantageFactor
 * expectedAway = leagueAvg * awayAttack * homeDefence
 */
export function computeExpectedScores(
  homeStats: TeamScoreStats,
  awayStats: TeamScoreStats,
  league: LeagueStats,
  homeAdvantageFactor = DEFAULT_SCORE_HOME_ADVANTAGE
): { expectedHome: number; expectedAway: number } {
  const avg = leagueAvgPointsPerTeam(league);

  const homeAvgPF = homeStats.games > 0 ? homeStats.pointsFor / homeStats.games : avg;
  const homeAvgPA = homeStats.games > 0 ? homeStats.pointsAgainst / homeStats.games : avg;
  const awayAvgPF = awayStats.games > 0 ? awayStats.pointsFor / awayStats.games : avg;
  const awayAvgPA = awayStats.games > 0 ? awayStats.pointsAgainst / awayStats.games : avg;

  const homeAttack = homeAvgPF / avg;
  const awayAttack = awayAvgPF / avg;
  const homeDefence = homeAvgPA / avg;
  const awayDefence = awayAvgPA / avg;

  return {
    expectedHome: avg * homeAttack * awayDefence * homeAdvantageFactor,
    expectedAway: avg * awayAttack * homeDefence,
  };
}

/** Logistic win probability from expected score margin. */
export function scoreProbability(
  expectedHome: number,
  expectedAway: number,
  scale = DEFAULT_SCORE_MODEL_SCALE
): number {
  const margin = expectedHome - expectedAway;
  return 1 / (1 + Math.exp(-margin / scale));
}

/** Weighted average of Elo and score-model win probabilities. */
export function blendProbabilities(
  eloProb: number,
  scoreProb: number,
  eloWeight = 0.5
): number {
  return eloWeight * eloProb + (1 - eloWeight) * scoreProb;
}
