-- Migration: full_spec_update
-- Adds Season, Round models; adds slug, seasonId, roundId to Match;
-- Adds isLatest, homeWinProbability, awayWinProbability, homeTeamRating,
-- awayTeamRating, homeAdvantageApplied, eloDifference to Prediction;
-- Adds ratingSystem, asOfDate, sourceMatchId to TeamRatingSnapshot;
-- Aligns OddsSnapshot columns with spec;
-- Adds recordsProcessed, errorMessage, source to ImportRun.

-- ============================================================
-- Season
-- ============================================================
CREATE TABLE IF NOT EXISTS "Season" (
    "id"        TEXT NOT NULL,
    "year"      INTEGER NOT NULL,
    "isActive"  BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Season_year_key" ON "Season"("year");

-- ============================================================
-- Round
-- ============================================================
CREATE TABLE IF NOT EXISTS "Round" (
    "id"          TEXT NOT NULL,
    "seasonId"    TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "name"        TEXT,
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Round_seasonId_roundNumber_key" ON "Round"("seasonId", "roundNumber");
CREATE INDEX IF NOT EXISTS "Round_seasonId_idx" ON "Round"("seasonId");

ALTER TABLE "Round" ADD CONSTRAINT "Round_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Match — add new columns
-- ============================================================
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "slug"      TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "seasonId"  TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "roundId"   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Match_slug_key" ON "Match"("slug");
CREATE INDEX IF NOT EXISTS "Match_seasonId_idx" ON "Match"("seasonId");
CREATE INDEX IF NOT EXISTS "Match_roundId_idx" ON "Match"("roundId");

ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey"
    FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- TeamRatingSnapshot — add new columns
-- ============================================================
ALTER TABLE "TeamRatingSnapshot" ADD COLUMN IF NOT EXISTS "ratingSystem"   TEXT NOT NULL DEFAULT 'elo-v1';
ALTER TABLE "TeamRatingSnapshot" ADD COLUMN IF NOT EXISTS "asOfDate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TeamRatingSnapshot" ADD COLUMN IF NOT EXISTS "seasonId"       TEXT;
ALTER TABLE "TeamRatingSnapshot" ADD COLUMN IF NOT EXISTS "sourceMatchId"  TEXT;

-- Rename matchId -> sourceMatchId if old column exists (safe migration)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='TeamRatingSnapshot' AND column_name='matchId'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='TeamRatingSnapshot' AND column_name='sourceMatchId'
    ) THEN
        ALTER TABLE "TeamRatingSnapshot" RENAME COLUMN "matchId" TO "sourceMatchId";
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TeamRatingSnapshot_seasonId_idx" ON "TeamRatingSnapshot"("seasonId");

-- ============================================================
-- OddsSnapshot — add new columns (backwards-compatible)
-- ============================================================
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "source"                TEXT NOT NULL DEFAULT 'the-odds-api';
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "marketType"            TEXT NOT NULL DEFAULT 'h2h';
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "drawOdds"              DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "homeImpliedRaw"        DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "awayImpliedRaw"        DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "drawImpliedRaw"        DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "homeImpliedNormalized" DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "awayImpliedNormalized" DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "drawImpliedNormalized" DOUBLE PRECISION;
ALTER TABLE "OddsSnapshot" ADD COLUMN IF NOT EXISTS "pulledAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rename old columns to spec names if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='bookmakerKey')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='bookmaker')
    THEN
        ALTER TABLE "OddsSnapshot" RENAME COLUMN "bookmakerKey" TO "bookmaker";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='homePrice')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='homeOdds')
    THEN
        ALTER TABLE "OddsSnapshot" RENAME COLUMN "homePrice" TO "homeOdds";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='awayPrice')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OddsSnapshot' AND column_name='awayOdds')
    THEN
        ALTER TABLE "OddsSnapshot" RENAME COLUMN "awayPrice" TO "awayOdds";
    END IF;

    -- Copy existing implied prob into raw columns if raw not yet populated
    UPDATE "OddsSnapshot"
    SET "homeImpliedRaw" = "homeImpliedProbability",
        "awayImpliedRaw" = "awayImpliedProbability",
        "homeImpliedNormalized" = "homeNormalizedProb",
        "awayImpliedNormalized" = "awayNormalizedProb"
    WHERE "homeImpliedRaw" IS NULL;
END $$;

-- ============================================================
-- Prediction — add new columns
-- ============================================================
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "isLatest"             BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "homeTeamRating"       DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "awayTeamRating"       DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "homeAdvantageApplied" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "eloDifference"        DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "homeImpliedProbability" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "awayImpliedProbability" DOUBLE PRECISION;

-- Rename probability columns to spec names (safe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Prediction' AND column_name='modelHomeProbability')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Prediction' AND column_name='homeWinProbability')
    THEN
        ALTER TABLE "Prediction" RENAME COLUMN "modelHomeProbability" TO "homeWinProbability";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Prediction' AND column_name='modelAwayProbability')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Prediction' AND column_name='awayWinProbability')
    THEN
        ALTER TABLE "Prediction" RENAME COLUMN "modelAwayProbability" TO "awayWinProbability";
    END IF;

    -- Sync isLatest from usedForEvaluation if isLatest not populated
    UPDATE "Prediction" SET "isLatest" = TRUE WHERE "usedForEvaluation" = TRUE AND "isLatest" = FALSE;
END $$;

CREATE INDEX IF NOT EXISTS "Prediction_isLatest_idx" ON "Prediction"("isLatest");

-- ============================================================
-- ImportRun — add new columns
-- ============================================================
ALTER TABLE "ImportRun" ADD COLUMN IF NOT EXISTS "source"           TEXT;
ALTER TABLE "ImportRun" ADD COLUMN IF NOT EXISTS "recordsProcessed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportRun" ADD COLUMN IF NOT EXISTS "errorMessage"     TEXT;
