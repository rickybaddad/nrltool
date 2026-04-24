-- Add Phase 2 blended model fields to Prediction
ALTER TABLE "Prediction" ADD COLUMN "eloHomeProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "eloAwayProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "scoreModelHomeProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "scoreModelAwayProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "finalHomeProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "finalAwayProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "expectedHomeScore" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "expectedAwayScore" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "expectedMargin" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN "expectedTotal" DOUBLE PRECISION;
