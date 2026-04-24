import { describe, it, expect } from "vitest";
import {
  leagueAvgPointsPerTeam,
  computeExpectedScores,
  scoreProbability,
  blendProbabilities,
  DEFAULT_LEAGUE_AVG_FALLBACK,
  DEFAULT_SCORE_HOME_ADVANTAGE,
  DEFAULT_SCORE_MODEL_SCALE,
} from "@/lib/models/score-model";

describe("leagueAvgPointsPerTeam", () => {
  it("returns fallback when no games played", () => {
    expect(leagueAvgPointsPerTeam({ totalPoints: 0, totalGames: 0 })).toBe(
      DEFAULT_LEAGUE_AVG_FALLBACK
    );
  });

  it("returns custom fallback", () => {
    expect(leagueAvgPointsPerTeam({ totalPoints: 0, totalGames: 0 }, 20)).toBe(20);
  });

  it("calculates correctly: 10 games, 440 total points → 22 per team per game", () => {
    // avg = 440 / (2 * 10) = 22
    expect(leagueAvgPointsPerTeam({ totalPoints: 440, totalGames: 10 })).toBe(22);
  });

  it("handles fractional averages", () => {
    expect(leagueAvgPointsPerTeam({ totalPoints: 100, totalGames: 4 })).toBe(12.5);
  });
});

describe("computeExpectedScores", () => {
  const league = { totalPoints: 440, totalGames: 10 }; // avg = 22

  it("returns symmetric expected scores when teams and league are equal", () => {
    const avgStat = { pointsFor: 22, pointsAgainst: 22, games: 1 };
    const { expectedHome, expectedAway } = computeExpectedScores(
      avgStat,
      avgStat,
      league,
      1.0 // no home advantage
    );
    expect(expectedHome).toBeCloseTo(22);
    expect(expectedAway).toBeCloseTo(22);
  });

  it("home advantage factor multiplies expected home score", () => {
    const avgStat = { pointsFor: 22, pointsAgainst: 22, games: 1 };
    const { expectedHome, expectedAway } = computeExpectedScores(
      avgStat,
      avgStat,
      league,
      1.2
    );
    expect(expectedHome).toBeCloseTo(22 * 1.2);
    expect(expectedAway).toBeCloseTo(22); // away not affected
  });

  it("strong attacking team vs weak defence → higher expected home score", () => {
    const strongAttack = { pointsFor: 33, pointsAgainst: 22, games: 1 }; // 150% attack
    const weakDefence = { pointsFor: 22, pointsAgainst: 33, games: 1 }; // 150% PA (weak defence)
    const avgStat = { pointsFor: 22, pointsAgainst: 22, games: 1 };
    const { expectedHome } = computeExpectedScores(strongAttack, weakDefence, league, 1.0);
    const { expectedHome: baseline } = computeExpectedScores(avgStat, avgStat, league, 1.0);
    expect(expectedHome).toBeGreaterThan(baseline);
  });

  it("uses league average for team with 0 games", () => {
    const noGames = { pointsFor: 0, pointsAgainst: 0, games: 0 };
    const avgStat = { pointsFor: 22, pointsAgainst: 22, games: 1 };
    const { expectedHome, expectedAway } = computeExpectedScores(
      noGames,
      noGames,
      league,
      1.0
    );
    expect(expectedHome).toBeCloseTo(22);
    expect(expectedAway).toBeCloseTo(22);
  });

  it("expected home > expected away when home team is stronger", () => {
    const strong = { pointsFor: 30, pointsAgainst: 15, games: 5 };
    const weak = { pointsFor: 15, pointsAgainst: 30, games: 5 };
    const { expectedHome, expectedAway } = computeExpectedScores(strong, weak, league, 1.0);
    expect(expectedHome).toBeGreaterThan(expectedAway);
  });
});

describe("scoreProbability", () => {
  it("returns 0.5 when expected scores are equal", () => {
    expect(scoreProbability(22, 22)).toBe(0.5);
  });

  it("returns > 0.5 when home expected score is higher", () => {
    expect(scoreProbability(28, 20)).toBeGreaterThan(0.5);
  });

  it("returns < 0.5 when away expected score is higher", () => {
    expect(scoreProbability(15, 25)).toBeLessThan(0.5);
  });

  it("returns ~0.731 for margin = scale (logistic(1))", () => {
    const scale = DEFAULT_SCORE_MODEL_SCALE;
    expect(scoreProbability(30, 20, scale)).toBeCloseTo(1 / (1 + Math.exp(-1)), 5);
  });

  it("respects custom scale — larger scale means more uncertainty", () => {
    const margin = 10;
    const lowScale = scoreProbability(30, 20, 5);
    const highScale = scoreProbability(30, 20, 20);
    expect(lowScale).toBeGreaterThan(highScale);
  });

  it("output is always in (0, 1)", () => {
    expect(scoreProbability(100, 0)).toBeLessThan(1);
    expect(scoreProbability(0, 100)).toBeGreaterThan(0);
  });
});

describe("blendProbabilities", () => {
  it("50/50 blend averages the two probabilities", () => {
    expect(blendProbabilities(0.6, 0.4)).toBeCloseTo(0.5);
  });

  it("eloWeight=1 returns elo probability unchanged", () => {
    expect(blendProbabilities(0.7, 0.4, 1)).toBeCloseTo(0.7);
  });

  it("eloWeight=0 returns score probability unchanged", () => {
    expect(blendProbabilities(0.7, 0.4, 0)).toBeCloseTo(0.4);
  });

  it("blended result is between the two inputs", () => {
    const blended = blendProbabilities(0.8, 0.6, 0.5);
    expect(blended).toBeGreaterThan(0.6);
    expect(blended).toBeLessThan(0.8);
  });

  it("uses default weight of 0.5", () => {
    expect(blendProbabilities(0.8, 0.6)).toBeCloseTo(0.7);
  });
});
