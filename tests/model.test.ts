import { describe, expect, it } from "vitest";
import { expectedProbability, updateEloRatings } from "@/lib/models/elo";
import { calcEdge, impliedProbability, normalizeProbabilities } from "@/lib/utils/probability";

describe("probability", () => {
  it("computes implied probability", () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5, 5);
  });

  it("normalizes market probabilities", () => {
    const result = normalizeProbabilities(0.55, 0.55);
    expect(result.a).toBeCloseTo(0.5, 5);
    expect(result.overround).toBeCloseTo(0.1, 5);
  });

  it("computes edge", () => {
    expect(calcEdge(0.56, 0.5)).toBeCloseTo(0.06, 5);
  });
});

describe("elo", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(expectedProbability(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it("updates ratings", () => {
    const result = updateEloRatings(1500, 1500, 20, 10, 30, 0);
    expect(result.newHome).toBeGreaterThan(1500);
    expect(result.newAway).toBeLessThan(1500);
  });
});
