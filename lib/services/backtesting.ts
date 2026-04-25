/**
 * Backtesting service: loads completed matches + their best pre-kickoff
 * predictions and computes multi-dimensional performance analytics.
 *
 * Profit/loss assumes 1 unit stake at fair-value odds (1 / implied_prob).
 * Where odds are unavailable, flat ±1 unit is used.
 */
import { MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ModelType = "elo" | "score" | "blended";
export type ConfidenceFilter = "all" | "Low" | "Medium" | "High";

export type BacktestOptions = {
  season: number;
  modelType: ModelType;
  confidence: ConfidenceFilter;
  minEdge: number;
};

export type ModelComparisonRow = {
  model: ModelType;
  label: string;
  graded: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgEdge: number | null;
};

export type EdgeBucketRow = {
  label: string;
  minEdge: number | null;
  maxEdge: number | null;
  predictions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgOdds: number | null;
  theoreticalPL: number | null;
  roi: number | null;
};

export type ConfidenceBucketRow = {
  label: string;
  predictions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgEdge: number | null;
  theoreticalPL: number | null;
  roi: number | null;
};

export type RoundRow = {
  round: number | null;
  predictions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgEdge: number | null;
  theoreticalPL: number | null;
  roi: number | null;
};

export type FavUnderdogRow = {
  type: "favourite" | "underdog" | "unknown";
  label: string;
  predictions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  theoreticalPL: number | null;
  roi: number | null;
};

export type PredictionRow = {
  matchId: string;
  round: number | null;
  homeTeam: string;
  awayTeam: string;
  predictedTeam: string;
  actualWinner: string | null;
  isCorrect: boolean | null;
  resultType: "WIN" | "LOSS" | "DRAW" | "NO_RESULT";
  modelProbability: number;
  edge: number | null;
  confidence: string;
  odds: number | null;
  profit: number | null;
};

export type BacktestSummary = {
  totalGraded: number;
  correct: number;
  incorrect: number;
  draws: number;
  accuracy: number;
  avgModelProb: number | null;
  avgEdge: number | null;
  theoreticalPL: number | null;
  roi: number | null;
  avgOdds: number | null;
  bestRound: number | null;
  worstRound: number | null;
  hasOdds: boolean;
};

export type BacktestData = {
  summary: BacktestSummary;
  modelComparison: ModelComparisonRow[];
  edgeBuckets: EdgeBucketRow[];
  confidenceBuckets: ConfidenceBucketRow[];
  roundBreakdown: RoundRow[];
  favouriteUnderdog: FavUnderdogRow[];
  predictions: PredictionRow[];
};

// ---------------------------------------------------------------------------
// Internal raw types (shape from DB query)
// ---------------------------------------------------------------------------

type RawPred = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  confidence: string;
  homeWinProbability: number;
  awayWinProbability: number;
  eloHomeProbability: number | null;
  eloAwayProbability: number | null;
  scoreModelHomeProbability: number | null;
  scoreModelAwayProbability: number | null;
  finalHomeProbability: number | null;
  finalAwayProbability: number | null;
  homeEdge: number | null;
  awayEdge: number | null;
  homeImpliedProbability: number | null;
  awayImpliedProbability: number | null;
  modelVersion: string;
  usedForEvaluation: boolean;
  isLatest: boolean;
};

// ---------------------------------------------------------------------------
// Pure helper functions (exported for tests)
// ---------------------------------------------------------------------------

export function getHomeProb(pred: RawPred, model: ModelType): number | null {
  switch (model) {
    case "elo":
      return pred.eloHomeProbability;
    case "score":
      return pred.scoreModelHomeProbability;
    case "blended":
      return pred.finalHomeProbability ?? pred.homeWinProbability;
  }
}

export function getPredictedSide(
  pred: RawPred,
  model: ModelType
): "home" | "away" | null {
  const hp = getHomeProb(pred, model);
  if (hp === null) return null;
  if (Math.abs(hp - 0.5) < 0.0001) return null; // too close to call
  return hp > 0.5 ? "home" : "away";
}

export function getModelProbability(
  pred: RawPred,
  model: ModelType,
  side: "home" | "away"
): number {
  const hp = getHomeProb(pred, model) ?? pred.homeWinProbability;
  return side === "home" ? hp : 1 - hp;
}

export function computeModelEdge(
  pred: RawPred,
  model: ModelType,
  side: "home" | "away"
): number | null {
  const implied =
    side === "home" ? pred.homeImpliedProbability : pred.awayImpliedProbability;
  if (implied == null) return null;
  const modelProb = getModelProbability(pred, model, side);
  return modelProb - implied;
}

export function getFairOdds(pred: RawPred, side: "home" | "away"): number | null {
  const implied =
    side === "home" ? pred.homeImpliedProbability : pred.awayImpliedProbability;
  if (!implied || implied <= 0) return null;
  return 1 / implied;
}

export function calcProfit(correct: boolean | null, odds: number | null): number | null {
  if (correct === null) return null;
  if (!odds) return correct ? 1 : -1;
  return correct ? odds - 1 : -1;
}

// ---------------------------------------------------------------------------
// Best prediction picker
// ---------------------------------------------------------------------------

function pickBestPrediction(preds: RawPred[]): RawPred | null {
  if (!preds.length) return null;
  return (
    preds.find((p) => p.usedForEvaluation) ??
    preds.find((p) => p.modelVersion === "blend-v1") ??
    preds.find((p) => p.isLatest) ??
    preds[0]
  );
}

// ---------------------------------------------------------------------------
// Internal enriched row (one per match, for selected model)
// ---------------------------------------------------------------------------

type EnrichedRow = {
  matchId: string;
  round: number | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: string;
  awayTeam: string;
  actualWinnerId: string | null; // null = draw
  pred: RawPred;
  // derived for selected modelType
  side: "home" | "away" | null;
  predictedTeamId: string | null;
  predictedTeam: string | null;
  actualWinner: string | null;
  isCorrect: boolean | null;
  resultType: "WIN" | "LOSS" | "DRAW" | "NO_RESULT";
  modelProb: number;
  modelEdge: number | null;
  odds: number | null;
  profit: number | null;
};

function buildEnrichedRow(
  match: {
    id: string;
    round: number | null;
    homeTeamId: string;
    awayTeamId: string;
    homeTeam: { shortName: string };
    awayTeam: { shortName: string };
    homeScore: number;
    awayScore: number;
  },
  pred: RawPred,
  model: ModelType
): EnrichedRow {
  const actualWinnerId =
    match.homeScore === match.awayScore
      ? null
      : match.homeScore > match.awayScore
      ? match.homeTeamId
      : match.awayTeamId;

  const isDraw = match.homeScore === match.awayScore;

  const side = getPredictedSide(pred, model);
  const predictedTeamId = side
    ? side === "home"
      ? match.homeTeamId
      : match.awayTeamId
    : null;
  const predictedTeam = side
    ? side === "home"
      ? match.homeTeam.shortName
      : match.awayTeam.shortName
    : null;

  const actualWinner =
    actualWinnerId === match.homeTeamId
      ? match.homeTeam.shortName
      : actualWinnerId === match.awayTeamId
      ? match.awayTeam.shortName
      : isDraw
      ? "Draw"
      : null;

  const isCorrect =
    !side || !predictedTeamId
      ? null
      : isDraw
      ? null
      : actualWinnerId === predictedTeamId;

  const resultType: EnrichedRow["resultType"] =
    isDraw
      ? "DRAW"
      : isCorrect === true
      ? "WIN"
      : isCorrect === false
      ? "LOSS"
      : "NO_RESULT";

  const modelProb = side ? getModelProbability(pred, model, side) : 0.5;
  const modelEdge = side ? computeModelEdge(pred, model, side) : null;
  const odds = side ? getFairOdds(pred, side) : null;
  const profit = calcProfit(isCorrect, odds);

  return {
    matchId: match.id,
    round: match.round,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeam: match.homeTeam.shortName,
    awayTeam: match.awayTeam.shortName,
    actualWinnerId,
    pred,
    side,
    predictedTeamId,
    predictedTeam,
    actualWinner,
    isCorrect,
    resultType,
    modelProb,
    modelEdge,
    odds,
    profit,
  };
}

// ---------------------------------------------------------------------------
// Bucket helper
// ---------------------------------------------------------------------------

function summariseBucket(rows: EnrichedRow[]): {
  predictions: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  theoreticalPL: number | null;
  roi: number | null;
} {
  const gradable = rows.filter((r) => r.isCorrect !== null);
  const correct = gradable.filter((r) => r.isCorrect === true).length;
  const incorrect = gradable.filter((r) => r.isCorrect === false).length;
  const withOdds = gradable.filter((r) => r.odds != null);
  const pl = gradable.reduce((s, r) => s + (r.profit ?? 0), 0);
  return {
    predictions: gradable.length,
    correct,
    incorrect,
    accuracy: gradable.length > 0 ? correct / gradable.length : 0,
    theoreticalPL: gradable.length > 0 ? pl : null,
    roi: gradable.length > 0 ? pl / gradable.length : null,
  };
}

function avgOrNull(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function getBacktestData(opts: BacktestOptions): Promise<BacktestData> {
  const { season, modelType, confidence, minEdge } = opts;

  // Two DB queries: finished matches + all their predictions
  const [matches, allPredictions] = await Promise.all([
    prisma.match.findMany({
      where: {
        season,
        status: MatchStatus.FINISHED,
        homeScore: { not: null },
        awayScore: { not: null },
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ round: "asc" }, { kickoffAt: "asc" }],
    }),
    prisma.prediction.findMany({
      where: { match: { season, status: MatchStatus.FINISHED } },
      orderBy: { generatedAt: "desc" },
    }),
  ]);

  // Group predictions by matchId
  const predsByMatch = new Map<string, RawPred[]>();
  for (const p of allPredictions) {
    const arr = predsByMatch.get(p.matchId) ?? [];
    arr.push(p as RawPred);
    predsByMatch.set(p.matchId, arr);
  }

  // Build raw base rows (all matches that have a prediction with a clear winner)
  const baseRows: EnrichedRow[] = [];
  for (const match of matches) {
    const preds = predsByMatch.get(match.id) ?? [];
    const pred = pickBestPrediction(preds);
    if (!pred) continue;
    if (match.homeScore == null || match.awayScore == null) continue;
    const row = buildEnrichedRow(
      { ...match, homeScore: match.homeScore, awayScore: match.awayScore },
      pred,
      modelType
    );
    if (!row.side) continue;
    baseRows.push(row);
  }

  // Apply filters
  const filtered = baseRows.filter((r) => {
    if (confidence !== "all" && r.pred.confidence !== confidence) return false;
    if (minEdge > 0 && (r.modelEdge == null || r.modelEdge < minEdge)) return false;
    return true;
  });

  // Gradable = isCorrect is not null (excludes draws)
  const gradable = filtered.filter((r) => r.isCorrect !== null);
  const correct = gradable.filter((r) => r.isCorrect === true);
  const incorrect = gradable.filter((r) => r.isCorrect === false);
  const draws = filtered.filter((r) => r.resultType === "DRAW");
  const withOdds = gradable.filter((r) => r.odds != null);
  const withEdge = gradable.filter((r) => r.modelEdge != null);
  const pl = gradable.reduce((s, r) => s + (r.profit ?? 0), 0);

  // Best / worst round
  const roundAcc = new Map<number, { c: number; t: number }>();
  for (const r of gradable) {
    if (r.round == null) continue;
    const e = roundAcc.get(r.round) ?? { c: 0, t: 0 };
    e.t++;
    if (r.isCorrect) e.c++;
    roundAcc.set(r.round, e);
  }
  let bestRound: number | null = null;
  let worstRound: number | null = null;
  let bestAcc = -1;
  let worstAcc = 2;
  for (const [rnd, { c, t }] of roundAcc) {
    if (t === 0) continue;
    const acc = c / t;
    if (acc > bestAcc) { bestAcc = acc; bestRound = rnd; }
    if (acc < worstAcc) { worstAcc = acc; worstRound = rnd; }
  }

  const summary: BacktestSummary = {
    totalGraded: gradable.length,
    correct: correct.length,
    incorrect: incorrect.length,
    draws: draws.length,
    accuracy: gradable.length > 0 ? correct.length / gradable.length : 0,
    avgModelProb: avgOrNull(gradable.map((r) => r.modelProb)),
    avgEdge: avgOrNull(withEdge.map((r) => r.modelEdge)),
    theoreticalPL: gradable.length > 0 ? pl : null,
    roi: gradable.length > 0 ? pl / gradable.length : null,
    avgOdds: avgOrNull(withOdds.map((r) => r.odds)),
    bestRound,
    worstRound,
    hasOdds: withOdds.length > 0,
  };

  // ---------------------------------------------------------------------------
  // Model comparison (same filtered dataset, all 3 model types)
  // ---------------------------------------------------------------------------

  const modelComparison: ModelComparisonRow[] = (
    [
      { model: "elo" as ModelType, label: "Elo model" },
      { model: "score" as ModelType, label: "Score model" },
      { model: "blended" as ModelType, label: "Final blended" },
    ]
  ).map(({ model, label }) => {
    // Re-process each filtered row under this model
    const mRows = filtered.map((r) => {
      const side = getPredictedSide(r.pred, model);
      if (!side) return null;
      const predictedId = side === "home" ? r.homeTeamId : r.awayTeamId;
      const isDraw = r.resultType === "DRAW";
      const correct =
        !isDraw && r.actualWinnerId != null
          ? r.actualWinnerId === predictedId
          : null;
      const edge = computeModelEdge(r.pred, model, side);
      return { correct, edge };
    }).filter(Boolean) as Array<{ correct: boolean | null; edge: number | null }>;

    const gradedM = mRows.filter((r) => r.correct !== null);
    const correctM = gradedM.filter((r) => r.correct === true).length;
    return {
      model,
      label,
      graded: gradedM.length,
      correct: correctM,
      incorrect: gradedM.length - correctM,
      accuracy: gradedM.length > 0 ? correctM / gradedM.length : 0,
      avgEdge: avgOrNull(gradedM.map((r) => r.edge)),
    };
  });

  // ---------------------------------------------------------------------------
  // Edge buckets
  // ---------------------------------------------------------------------------

  const edgeBucketDefs = [
    { label: "Negative", minEdge: null, maxEdge: 0 },
    { label: "0% – 3%", minEdge: 0, maxEdge: 0.03 },
    { label: "3% – 5%", minEdge: 0.03, maxEdge: 0.05 },
    { label: "5% – 7%", minEdge: 0.05, maxEdge: 0.07 },
    { label: "7%+", minEdge: 0.07, maxEdge: null },
  ];

  const edgeBuckets: EdgeBucketRow[] = edgeBucketDefs.map(({ label, minEdge: lo, maxEdge: hi }) => {
    const bucket = gradable.filter((r) => {
      const e = r.modelEdge;
      if (e == null) return false;
      if (lo !== null && e < lo) return false;
      if (hi !== null && e >= hi) return false;
      return true;
    });
    const { predictions, correct: c, incorrect, accuracy, theoreticalPL, roi } = summariseBucket(bucket);
    return {
      label,
      minEdge: lo,
      maxEdge: hi,
      predictions,
      correct: c,
      incorrect,
      accuracy,
      avgOdds: avgOrNull(bucket.map((r) => r.odds)),
      theoreticalPL,
      roi,
    };
  });

  // ---------------------------------------------------------------------------
  // Confidence buckets
  // ---------------------------------------------------------------------------

  const confidenceBuckets: ConfidenceBucketRow[] = (
    ["Low", "Medium", "High"] as const
  ).map((conf) => {
    const bucket = gradable.filter((r) => r.pred.confidence === conf);
    const { predictions, correct: c, incorrect, accuracy, theoreticalPL, roi } = summariseBucket(bucket);
    return {
      label: conf,
      predictions,
      correct: c,
      incorrect,
      accuracy,
      avgEdge: avgOrNull(bucket.map((r) => r.modelEdge)),
      theoreticalPL,
      roi,
    };
  });

  // ---------------------------------------------------------------------------
  // Round breakdown
  // ---------------------------------------------------------------------------

  const roundMap = new Map<number | null, EnrichedRow[]>();
  for (const r of gradable) {
    const key = r.round;
    const arr = roundMap.get(key) ?? [];
    arr.push(r);
    roundMap.set(key, arr);
  }

  const roundBreakdown: RoundRow[] = [...roundMap.entries()]
    .sort(([a], [b]) => (a ?? 999) - (b ?? 999))
    .map(([round, rows]) => {
      const { predictions, correct: c, incorrect, accuracy, theoreticalPL, roi } = summariseBucket(rows);
      return {
        round,
        predictions,
        correct: c,
        incorrect,
        accuracy,
        avgEdge: avgOrNull(rows.map((r) => r.modelEdge)),
        theoreticalPL,
        roi,
      };
    });

  // ---------------------------------------------------------------------------
  // Favourite vs underdog
  // ---------------------------------------------------------------------------

  const favMap = new Map<"favourite" | "underdog" | "unknown", EnrichedRow[]>();
  for (const r of gradable) {
    const predImplied =
      r.side === "home"
        ? r.pred.homeImpliedProbability
        : r.pred.awayImpliedProbability;
    const oppImplied =
      r.side === "home"
        ? r.pred.awayImpliedProbability
        : r.pred.homeImpliedProbability;

    let favType: "favourite" | "underdog" | "unknown";
    if (!predImplied || !oppImplied) {
      favType = "unknown";
    } else {
      favType = predImplied >= oppImplied ? "favourite" : "underdog";
    }
    const arr = favMap.get(favType) ?? [];
    arr.push(r);
    favMap.set(favType, arr);
  }

  const favouriteUnderdog: FavUnderdogRow[] = (
    [
      { type: "favourite" as const, label: "Favourite" },
      { type: "underdog" as const, label: "Underdog" },
      { type: "unknown" as const, label: "No odds" },
    ]
  ).map(({ type, label }) => {
    const rows = favMap.get(type) ?? [];
    const { predictions, correct: c, incorrect, accuracy, theoreticalPL, roi } = summariseBucket(rows);
    return { type, label, predictions, correct: c, incorrect, accuracy, theoreticalPL, roi };
  });

  // ---------------------------------------------------------------------------
  // Prediction list (filtered, sorted by round)
  // ---------------------------------------------------------------------------

  const predictions: PredictionRow[] = filtered
    .sort((a, b) => ((a.round ?? 999) - (b.round ?? 999)))
    .map((r) => ({
      matchId: r.matchId,
      round: r.round,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      predictedTeam: r.predictedTeam ?? "—",
      actualWinner: r.actualWinner,
      isCorrect: r.isCorrect,
      resultType: r.resultType,
      modelProbability: r.modelProb,
      edge: r.modelEdge,
      confidence: r.pred.confidence,
      odds: r.odds,
      profit: r.profit,
    }));

  return {
    summary,
    modelComparison,
    edgeBuckets,
    confidenceBuckets,
    roundBreakdown,
    favouriteUnderdog,
    predictions,
  };
}
