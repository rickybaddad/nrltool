-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'LIVE';

-- AlterEnum
ALTER TYPE "ImportRunType" ADD VALUE IF NOT EXISTS 'SYNC_SEASON';
ALTER TYPE "ImportRunType" ADD VALUE IF NOT EXISTS 'REFRESH_RESULTS';
ALTER TYPE "ImportRunType" ADD VALUE IF NOT EXISTS 'EVALUATE_PREDICTIONS';

-- CreateEnum
CREATE TYPE "PredictionType" AS ENUM ('PRE_MATCH');

-- CreateEnum
CREATE TYPE "PredictionScope" AS ENUM ('ROUND_VIEW', 'SCHEDULED_RUN', 'SEASON_SYNC');

-- CreateEnum
CREATE TYPE "PredictionResultType" AS ENUM ('WIN', 'LOSS', 'DRAW', 'NO_RESULT', 'NO_PREDICTION');

-- AlterTable
ALTER TABLE "Prediction"
  ADD COLUMN "predictedWinnerTeamId" TEXT,
  ADD COLUMN "actualWinnerTeamId" TEXT,
  ADD COLUMN "wasCorrect" BOOLEAN,
  ADD COLUMN "resultType" "PredictionResultType",
  ADD COLUMN "predictionType" "PredictionType" NOT NULL DEFAULT 'PRE_MATCH',
  ADD COLUMN "predictionScope" "PredictionScope" NOT NULL DEFAULT 'SCHEDULED_RUN',
  ADD COLUMN "modelVersion" TEXT NOT NULL DEFAULT 'elo-v1',
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "evaluatedAt" TIMESTAMP(3),
  ADD COLUMN "usedForEvaluation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Prediction_predictionType_predictionScope_generatedAt_idx" ON "Prediction"("predictionType", "predictionScope", "generatedAt");
CREATE INDEX "Prediction_usedForEvaluation_idx" ON "Prediction"("usedForEvaluation");
