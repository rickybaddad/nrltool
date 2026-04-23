import { describe, expect, it } from "vitest";
import { expectedProbability, predictMatch, updateEloRatings } from "@/lib/models/elo";
import {
  calcEdge,
  confidenceLabel,
  impliedProbability,
  normalizeProbabilities,
} from "@/lib/utils/probability";
import { normalizeName } from "@/lib/utils/team-resolver";

// ---------------------------------------------------------------------------
// Implied probability
// ---------------------------------------------------------------------------
describe("impliedProbability", () => {
  it("$2 decimal odds → 50%", () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5, 5);
  });

  it("$1.50 decimal odds → 66.67%", () => {
    expect(impliedProbability(1.5)).toBeCloseTo(0.6667, 3);
  });

  it("0 or negative odds → 0", () => {
    expect(impliedProbability(0)).toBe(0);
    expect(impliedProbability(-1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Normalize probabilities
// ---------------------------------------------------------------------------
describe("normalizeProbabilities", () => {
  it("normalizes symmetric overround", () => {
    const result = normalizeProbabilities(0.55, 0.55);
    expect(result.a).toBeCloseTo(0.5, 5);
    expect(result.b).toBeCloseTo(0.5, 5);
    expect(result.overround).toBeCloseTo(0.1, 5);
  });

  it("normalizes asymmetric odds", () => {
    // home favoured: raw 0.6 and 0.45 → sum = 1.05
    const result = normalizeProbabilities(0.6, 0.45);
    expect(result.a + result.b).toBeCloseTo(1, 5);
    expect(result.a).toBeGreaterThan(result.b);
  });

  it("handles zero-sum gracefully", () => {
    const result = normalizeProbabilities(0, 0);
    expect(result.a).toBe(0);
    expect(result.b).toBe(0);
    expect(result.overround).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge calculation
// ---------------------------------------------------------------------------
describe("calcEdge", () => {
  it("positive edge when model beats market", () => {
    expect(calcEdge(0.56, 0.5)).toBeCloseTo(0.06, 5);
  });

  it("negative edge when model is behind market", () => {
    expect(calcEdge(0.44, 0.5)).toBeCloseTo(-0.06, 5);
  });

  it("returns null when market probability is null", () => {
    expect(calcEdge(0.6, null)).toBeNull();
  });

  it("returns null when market probability is undefined", () => {
    expect(calcEdge(0.6, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Confidence labels
// ---------------------------------------------------------------------------
describe("confidenceLabel", () => {
  it("Low when edge < medium threshold", () => {
    expect(confidenceLabel(0.02, 0.03, 0.06)).toBe("Low");
  });

  it("Medium when edge >= medium but < high", () => {
    expect(confidenceLabel(0.04, 0.03, 0.06)).toBe("Medium");
  });

  it("High when edge >= high threshold", () => {
    expect(confidenceLabel(0.07, 0.03, 0.06)).toBe("High");
  });

  it("Medium at exact medium threshold", () => {
    expect(confidenceLabel(0.03, 0.03, 0.06)).toBe("Medium");
  });

  it("High at exact high threshold", () => {
    expect(confidenceLabel(0.06, 0.03, 0.06)).toBe("High");
  });
});

// ---------------------------------------------------------------------------
// Elo — expected probability
// ---------------------------------------------------------------------------
describe("expectedProbability", () => {
  it("returns 0.5 for equal ratings", () => {
    expect(expectedProbability(1500, 1500)).toBeCloseTo(0.5, 5);
  });

  it("higher rating → higher probability", () => {
    expect(expectedProbability(1600, 1500)).toBeGreaterThan(0.5);
  });

  it("lower rating → lower probability", () => {
    expect(expectedProbability(1400, 1500)).toBeLessThan(0.5);
  });

  it("probabilities are symmetric", () => {
    const p = expectedProbability(1600, 1400);
    const q = expectedProbability(1400, 1600);
    expect(p + q).toBeCloseTo(1, 5);
  });

  it("extreme difference → probability near 1", () => {
    expect(expectedProbability(2000, 1000)).toBeGreaterThan(0.99);
  });
});

// ---------------------------------------------------------------------------
// Elo — rating updates
// ---------------------------------------------------------------------------
describe("updateEloRatings", () => {
  it("home win increases home rating, decreases away rating", () => {
    const result = updateEloRatings(1500, 1500, 20, 10, 30, 0);
    expect(result.newHome).toBeGreaterThan(1500);
    expect(result.newAway).toBeLessThan(1500);
  });

  it("draw moves both ratings toward 0.5 expected", () => {
    // Equal teams, draw → no change expected (expected outcome ≈ 0.5)
    const result = updateEloRatings(1500, 1500, 10, 10, 30, 0);
    expect(result.newHome).toBeCloseTo(1500, 1);
    expect(result.newAway).toBeCloseTo(1500, 1);
  });

  it("upset win gives bigger rating boost", () => {
    const expected = updateEloRatings(1400, 1600, 20, 10, 30, 0); // upset
    const normal = updateEloRatings(1600, 1400, 20, 10, 30, 0);    // expected
    expect(expected.newHome - 1400).toBeGreaterThan(normal.newHome - 1600);
  });

  it("home advantage shifts probabilities in favour of home", () => {
    const withAdv = predictMatch(1500, 1500, 50);
    const noAdv = predictMatch(1500, 1500, 0);
    expect(withAdv.homeProbability).toBeGreaterThan(noAdv.homeProbability);
  });

  it("rating changes sum to zero (zero-sum property)", () => {
    const result = updateEloRatings(1500, 1500, 30, 10, 30, 0);
    const delta = (result.newHome - 1500) + (result.newAway - 1500);
    expect(Math.abs(delta)).toBeCloseTo(0, 5);
  });
});

// ---------------------------------------------------------------------------
// predictMatch
// ---------------------------------------------------------------------------
describe("predictMatch", () => {
  it("probabilities sum to 1", () => {
    const { homeProbability, awayProbability } = predictMatch(1550, 1450, 50);
    expect(homeProbability + awayProbability).toBeCloseTo(1, 5);
  });

  it("home team favoured when ratings are equal and advantage applied", () => {
    const { homeProbability } = predictMatch(1500, 1500, 50);
    expect(homeProbability).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Team name normalisation
// ---------------------------------------------------------------------------
describe("normalizeName", () => {
  it("lowercases and strips non-alphanumeric", () => {
    expect(normalizeName("St George-Illawarra")).toBe("stgeorgeillawarra");
  });

  it("handles spaces and hyphens", () => {
    expect(normalizeName("North Queensland Cowboys")).toBe("northqueenslandcowboys");
  });

  it("handles already clean strings", () => {
    expect(normalizeName("broncos")).toBe("broncos");
  });
});
