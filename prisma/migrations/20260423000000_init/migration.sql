-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRunType" AS ENUM ('BOOTSTRAP', 'SEED_TEAMS', 'IMPORT_HISTORY', 'IMPORT_FIXTURES', 'IMPORT_ODDS', 'CALCULATE_RATINGS', 'GENERATE_PREDICTIONS');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "season" INTEGER NOT NULL,
    "round" INTEGER,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRatingSnapshot" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "matchId" TEXT,
    "season" INTEGER NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamRatingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OddsSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "bookmakerKey" TEXT NOT NULL,
    "bookmakerTitle" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "homePrice" DOUBLE PRECISION NOT NULL,
    "awayPrice" DOUBLE PRECISION NOT NULL,
    "homeImpliedProbability" DOUBLE PRECISION NOT NULL,
    "awayImpliedProbability" DOUBLE PRECISION NOT NULL,
    "homeNormalizedProb" DOUBLE PRECISION NOT NULL,
    "awayNormalizedProb" DOUBLE PRECISION NOT NULL,
    "overround" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "modelHomeProbability" DOUBLE PRECISION NOT NULL,
    "modelAwayProbability" DOUBLE PRECISION NOT NULL,
    "selectedBookmaker" TEXT,
    "marketHomeProbability" DOUBLE PRECISION,
    "marketAwayProbability" DOUBLE PRECISION,
    "homeEdge" DOUBLE PRECISION,
    "awayEdge" DOUBLE PRECISION,
    "confidence" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "type" "ImportRunType" NOT NULL,
    "status" "ImportRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "message" TEXT,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_fullName_key" ON "Team"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Team_shortName_key" ON "Team"("shortName");

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TeamAlias_alias_key" ON "TeamAlias"("alias");

-- CreateIndex
CREATE INDEX "TeamAlias_normalized_idx" ON "TeamAlias"("normalized");

-- CreateIndex
CREATE INDEX "TeamAlias_teamId_idx" ON "TeamAlias"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_season_round_idx" ON "Match"("season", "round");

-- CreateIndex
CREATE UNIQUE INDEX "Match_season_round_homeTeamId_awayTeamId_kickoffAt_key" ON "Match"("season", "round", "homeTeamId", "awayTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "TeamRatingSnapshot_teamId_createdAt_idx" ON "TeamRatingSnapshot"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamRatingSnapshot_season_idx" ON "TeamRatingSnapshot"("season");

-- CreateIndex
CREATE INDEX "OddsSnapshot_matchId_fetchedAt_idx" ON "OddsSnapshot"("matchId", "fetchedAt");

-- CreateIndex
CREATE INDEX "OddsSnapshot_bookmakerKey_fetchedAt_idx" ON "OddsSnapshot"("bookmakerKey", "fetchedAt");

-- CreateIndex
CREATE INDEX "Prediction_matchId_generatedAt_idx" ON "Prediction"("matchId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_matchId_generatedAt_key" ON "Prediction"("matchId", "generatedAt");

-- CreateIndex
CREATE INDEX "ImportRun_type_startedAt_idx" ON "ImportRun"("type", "startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_startedAt_idx" ON "ImportRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "TeamAlias" ADD CONSTRAINT "TeamAlias_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRatingSnapshot" ADD CONSTRAINT "TeamRatingSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamRatingSnapshot" ADD CONSTRAINT "TeamRatingSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OddsSnapshot" ADD CONSTRAINT "OddsSnapshot_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

