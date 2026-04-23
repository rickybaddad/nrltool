# NRL Model (Season + Round Aware)

Next.js + TypeScript + Prisma app for NRL Elo predictions, now upgraded for full-season fixture persistence, round-by-round browsing, and prediction grading over time.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Prisma ORM + PostgreSQL (Neon)
- Vercel serverless API routes for all jobs
- Existing Elo + odds/edge logic retained and extended

## What Changed
- Full season fixture sync (not just this weekend)
- Round navigation pages:
  - `/season/:season`
  - `/season/:season/round/:round`
- Prediction snapshots preserved; grading uses final pre-match prediction generated before kickoff
- Prediction outcomes tracked (`WIN`, `LOSS`, `DRAW`, `NO_RESULT`, `NO_PREDICTION`)
- Season performance API with accuracy + by-round breakdown
- New season sync orchestration job route

## Environment Variables
Set these in Vercel Project Settings:

- `DATABASE_URL`
- `ODDS_API_KEY`
- `ODDS_API_REGION` (default `au`)
- `ODDS_API_MARKETS` (default `h2h`)
- `STARTING_ELO` (default `1500`)
- `K_FACTOR` (default `30`)
- `HOME_ADVANTAGE_ELO` (default `50`)
- `VALUE_EDGE_THRESHOLD` (default `0.04`)
- `CONFIDENCE_MEDIUM_THRESHOLD` (default `0.03`)
- `CONFIDENCE_HIGH_THRESHOLD` (default `0.06`)

## Database / Prisma
### Migrations
Run in deployment or CI:

```bash
npx prisma generate
npx prisma migrate deploy
```

If this project was previously using only older schema state, apply the new migration before running season sync jobs.

### New prediction grading fields
`Prediction` now stores:
- `predictedWinnerTeamId`
- `actualWinnerTeamId`
- `wasCorrect`
- `resultType`
- `evaluatedAt`
- `predictionType`
- `predictionScope`
- `modelVersion`
- `lockedAt`
- `usedForEvaluation`

## Season-Aware Jobs
All jobs are API-triggered and serverless-safe for Vercel.

### Main orchestration
- `POST /api/jobs/sync-season`
  1. import full season schedule
  2. refresh completed results
  3. update odds
  4. generate missing pre-match predictions
  5. evaluate completed predictions

### Other jobs
- `POST /api/jobs/bootstrap`
- `POST /api/jobs/import-season-schedule`
- `POST /api/jobs/refresh-results`
- `POST /api/jobs/import-odds`
- `POST /api/jobs/generate-predictions`
- `POST /api/jobs/generate-round-predictions`
- `POST /api/jobs/evaluate-predictions`

All job endpoints accept JSON body with `season` (and optionally `round` where relevant).

## New read APIs
- `GET /api/seasons`
- `GET /api/seasons/:season/rounds`
- `GET /api/seasons/:season/rounds/:round`
- `GET /api/seasons/:season/performance`

## Prediction Evaluation Rules
- Only `PRE_MATCH` predictions created at or before kickoff are eligible for grading.
- The latest eligible prediction is marked `usedForEvaluation=true`.
- Completed matches with no eligible prediction are counted as `no prediction` in season performance.
- Draws and no-result states are stored as neutral result types.

## Fix for bootstrap 500 / 403
If you see:
- client: `POST /api/jobs/bootstrap 500`
- status text mentioning `403`

It usually means an upstream data provider rejected one of the fetches (fixtures/odds). The upgraded pipeline now provides season-specific sync routes, and odds import failures during season sync are contained so the rest of the sync can still complete.

Run:
```bash
curl -X POST https://<your-domain>/api/jobs/sync-season \
  -H 'content-type: application/json' \
  -d '{"season": 2026}'
```

Then check `ImportRun` records for details.

## Local Development
```bash
npm install
npx prisma migrate deploy
npm run dev
```

## Testing
```bash
npm test
```
