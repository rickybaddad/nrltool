export function impliedProbability(decimalOdds: number): number {
  return decimalOdds > 0 ? 1 / decimalOdds : 0;
}

export function normalizeProbabilities(a: number, b: number) {
  const sum = a + b;
  if (sum === 0) return { a: 0, b: 0, overround: 0 };
  return { a: a / sum, b: b / sum, overround: sum - 1 };
}

export function calcEdge(modelProbability: number, marketProbability?: number | null): number | null {
  if (marketProbability == null) return null;
  return modelProbability - marketProbability;
}

export function confidenceLabel(absEdge: number, medium: number, high: number): "Low" | "Medium" | "High" {
  if (absEdge >= high) return "High";
  if (absEdge >= medium) return "Medium";
  return "Low";
}
