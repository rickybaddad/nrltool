-- Migration: add_sync_results_type
-- Adds SYNC_RESULTS value to the ImportRunType enum.
-- Must run outside a transaction in PostgreSQL (Prisma handles this automatically).

ALTER TYPE "ImportRunType" ADD VALUE 'SYNC_RESULTS';
