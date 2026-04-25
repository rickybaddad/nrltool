# NRL Model

A production-ready, season-long NRL prediction dashboard.  
Blended Elo + score model pre-match win probabilities compared against bookmaker odds to surface edge and confidence signals — tracked, graded, and backtested across every round of the season.

**This is an analysis tool only. No betting, payment, or wagering functionality.**

---

## What it does

- Stores the full NRL season schedule in Postgres (Supabase)
- Browses matches round by round
- Calculates pre-match win probabilities via a blended Elo + attack/defence score model
- Compares model probabilities to bookmaker odds (The Odds API) to surface edge signals
- Shows edge and confidence for every upcoming match
- Tracks whether each prediction was correct after the match
- Backtesting dashboard: accuracy, ROI, model comparison, edge/confidence/round breakdowns

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase Postgres |
| ORM | Prisma 5 |
| Validation | Zod |
| Dates | date-fns |
| Scraping | Cheerio + Axios |
| Odds | The Odds API (v4) |
| Hosting | Vercel (serverless) |

---

## Project structure

```
/app
  /page.tsx                              Dashboard home
  /season/[year]/page.tsx               Season overview
  /season/[year]/round/[round]/page.tsx Round view
  /match/[slug]/page.tsx                Match detail
  /settings/page.tsx                    Model settings + job runner
  /api/health/route.ts
  /api/seasons/route.ts
  /api/seasons/[year]/route.ts
  /api/seasons/[season]/rounds/route.ts
  /api/seasons/[season]/rounds/[round]/route.ts
  /api/seasons/[season]/performance/route.ts
  /api/matches/[slug]/route.ts
  /api/predictions/upcoming/route.ts
  /api/jobs/bootstrap/route.ts
  /api/jobs/sync-season/route.ts
  /api/jobs/import-season-schedule/route.ts
  /api/jobs/refresh-results/route.ts
  /api/jobs/import-odds/route.ts
  /api/jobs/calculate-ratings/route.ts
  /api/jobs/generate-predictions/route.ts
  /api/jobs/evaluate-predictions/route.ts
/components
/lib
  /api/odds-api.ts          The Odds API client
  /config/env.ts            Zod-validated env vars
  /db/prisma.ts             Prisma client singleton
  /jobs/pipeline.ts         All job orchestration
  /models/elo.ts            Elo model functions
  /scrapers/fixtures.ts     NRL.com draw scraper
  /scrapers/history.ts      Rugby League Project scraper
  /utils/
/prisma
  schema.prisma
  seed.ts
/tests
  model.test.ts
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in all values.

```env
# Supabase — use the Transaction Pooler URL for DATABASE_URL
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true

# Use the direct connection for migrations / Prisma CLI
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres

# The Odds API (https://the-odds-api.com)
ODDS_API_KEY=your_key_here
ODDS_API_REGION=au
ODDS_API_MARKETS=h2h

# Elo model
STARTING_ELO=1500
K_FACTOR=30
HOME_ADVANTAGE_ELO=50

# Confidence / edge thresholds
VALUE_EDGE_THRESHOLD=0.04
CONFIDENCE_MEDIUM_THRESHOLD=0.03
CONFIDENCE_HIGH_THRESHOLD=0.06

# App
NEXT_PUBLIC_APP_NAME=NRL Model
APP_TIMEZONE=Australia/Sydney
```

Set these in **Vercel → Project Settings → Environment Variables** for production.

---

## Database setup

### Option A — prisma db push (easiest for Supabase)

```bash
npm install
npx prisma generate
npx prisma db push        # pushes schema directly, no migration history needed
npx prisma db seed        # seeds 17 teams + current season
```

### Option B — prisma migrate deploy (migration-tracked)

```bash
npx prisma generate
npx prisma migrate deploy   # applies all migration files in /prisma/migrations
npx prisma db seed
```

> The project ships with migration files under `/prisma/migrations/`.  
> If you applied the schema via Supabase MCP directly, use `prisma db push` instead.

---

## First-run bootstrap

Once the DB is seeded, call the bootstrap job to import data:

```bash
curl -X POST https://your-domain.vercel.app/api/jobs/bootstrap \
  -H 'content-type: application/json' \
  -d '{"season": 2026}'
```

Bootstrap flow:
1. Seeds teams (idempotent)
2. Imports historical results from 2018 → current season − 1 (Rugby League Project)
3. Imports the current season schedule (NRL.com draw)
4. Refreshes completed results
5. Imports odds from The Odds API
6. Calculates Elo ratings from all completed matches
7. Generates pre-match predictions for upcoming matches
8. Evaluates completed predictions

---

## Season sync (ongoing)

Run after each round completes to refresh everything:

```bash
curl -X POST https://your-domain.vercel.app/api/jobs/sync-season \
  -H 'content-type: application/json' \
  -d '{"season": 2026}'
```

---

## Available job routes

All accept `POST` with JSON body.

| Route | Body | What it does |
|---|---|---|
| `/api/jobs/bootstrap` | `{ season }` | Full first-run setup |
| `/api/jobs/sync-season` | `{ season }` | Import + refresh + odds + predict + evaluate |
| `/api/jobs/sync-results` | — | Smart results + upcoming week sync (see below) |
| `/api/jobs/import-season-schedule` | `{ season }` | Import fixture list from NRL.com |
| `/api/jobs/refresh-results` | `{ season }` | Update completed scores |
| `/api/jobs/import-odds` | `{ season }` | Pull odds from The Odds API |
| `/api/jobs/calculate-ratings` | — | Recalculate all Elo ratings |
| `/api/jobs/generate-predictions` | `{ season?, round?, upcomingOnly? }` | Generate predictions |
| `/api/jobs/evaluate-predictions` | `{ season?, round? }` | Grade completed predictions |

All jobs log to the `ImportRun` table. Check that table for success/failure details.

---

## Smart results sync: POST /api/jobs/sync-results

This is the recommended way to keep match results up to date without running a full season sync.

```bash
curl -X POST https://your-domain.vercel.app/api/jobs/sync-results
```

### What it does

1. **Past incomplete matches** — queries the database for any match where:
   - `kickoffAt` is in the past
   - status is not `FINISHED`
   - `homeScore` or `awayScore` is null

2. **Current/upcoming NRL week** — calculates the Thursday-to-Monday window for the current or upcoming NRL round (Australia/Sydney time):
   - If today is Thursday, Friday, Saturday, Sunday, or Monday: uses the current week's Thu–Mon
   - If today is Tuesday or Wednesday: uses the upcoming week's Thu–Mon

3. **Deduplication** — combines the dates from steps 1 and 2, removes duplicates, then calls the TheSportsDB `eventsday` endpoint **once per unique date** (never uses the season endpoint).

4. **Matching** — for each TheSportsDB event returned:
   - Normalizes home and away team names
   - Matches against stored DB matches by team pair + Sydney local date
   - Falls back to a 12-hour kickoff tolerance if needed

5. **Updates** — if TheSportsDB has both scores:
   - Sets `homeScore`, `awayScore`, and `status = FINISHED`
   - Never overwrites an already-completed result
   - Never downgrades a finished match back to scheduled
   - A score of `0` is valid and is stored correctly

### Response shape

```json
{
  "success": true,
  "datesChecked": ["2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28"],
  "apiCallsMade": 5,
  "eventsReturned": 8,
  "matchesUpdated": 3,
  "resultsCompleted": 3,
  "unmatchedEvents": [],
  "stillMissingResults": []
}
```

`unmatchedEvents` lists TheSportsDB events that could not be matched to any stored match (logged for data-quality inspection).  
`stillMissingResults` lists past DB matches that remain incomplete after the sync.

### TheSportsDB API

- Endpoint: `https://www.thesportsdb.com/api/v1/json/{THESPORTSDB_API_KEY}/eventsday.php?d=YYYY-MM-DD&l=4416`
- NRL league ID: `4416`
- Set `THESPORTSDB_API_KEY` in environment variables (defaults to `123` if not set)

### Schedule source of truth

The schedule is **manually seeded** — `sync-results` only updates results for existing DB matches. It never creates new matches from TheSportsDB. To add new fixtures, run `/api/jobs/import-season-schedule` or `/api/jobs/bootstrap`.

---

## Read API routes

| Route | Description |
|---|---|
| `GET /api/health` | DB connectivity check |
| `GET /api/seasons` | List all season years |
| `GET /api/seasons/[year]` | Season summary |
| `GET /api/seasons/[year]/rounds` | All rounds in a season |
| `GET /api/seasons/[year]/rounds/[round]` | Matches in a round |
| `GET /api/seasons/[year]/performance` | Season accuracy stats |
| `GET /api/matches/[slug]` | Single match + predictions + odds |
| `GET /api/predictions/upcoming` | All upcoming predictions with latest flag |

---

## Elo model

**File:** `lib/models/elo.ts`

- `STARTING_ELO` — initial rating for all teams (default 1500)
- `K_FACTOR` — sensitivity of rating updates (default 30)
- `HOME_ADVANTAGE_ELO` — points added to home team before probability calculation (default 50)

Formula:
```
P(home win) = 1 / (1 + 10^((awayRating - (homeRating + homeAdvantage)) / 400))
```

Ratings update only from completed matches. Predictions are generated before kickoff and locked. Only the latest pre-kickoff prediction per match is used for grading.

---

## Edge and confidence

**File:** `lib/utils/probability.ts`

```
rawImplied     = 1 / decimalOdds
normalizedProb = rawImplied / (rawHome + rawAway)
edge           = modelProbability - normalizedImpliedProbability
```

Confidence bands:
- **Low**: `|edge| < CONFIDENCE_MEDIUM_THRESHOLD` (default 3%)
- **Medium**: `3% ≤ |edge| < CONFIDENCE_HIGH_THRESHOLD` (6%)
- **High**: `|edge| ≥ 6%`

---

## Phase 2: blended model

**Files:** `lib/models/score-model.ts`, `lib/jobs/chronological-predictions.ts`

The prediction engine blends two independent models:

### Elo model
Standard Elo rating system, updated from every completed match since 2018. Captures team strength relative to historical opposition.

### Attack/defence score model
Dixon-Coles style expected-score model:
```
homeAttack  = team.avgPointsFor / leagueAvg
awayDefence = team.avgPointsAgainst / leagueAvg
expectedHomeScore = leagueAvg × homeAttack × awayDefence × homeAdvantageFactor
```
Probability is derived from expected margin via a logistic function:
```
scoreProb = 1 / (1 + exp(-expectedMargin / scale))
```

### Blended probability
```
finalProb = ELO_MODEL_WEIGHT × eloProb + (1 − ELO_MODEL_WEIGHT) × scoreProb
```
Defaults: `ELO_MODEL_WEIGHT=0.5`, `SCORE_MODEL_SCALE=10`, `SCORE_HOME_ADVANTAGE_FACTOR=1.1`

### Chronological generation (no lookahead bias)
`generateSeasonPredictionsChronologically(season)` processes every match in kickoff order.
For each match it **first generates the prediction** using the current model state, then updates ratings with the result. This guarantees the model never uses future data.

---

## Prediction grading

**File:** `lib/jobs/pipeline.ts → evaluatePredictions()`

For each completed match:
- Finds the latest prediction with `lockedAt ≤ kickoffAt` (or `generatedAt ≤ kickoffAt`)
- Compares `predictedWinnerTeamId` to actual winner from score
- Records `resultType`: `WIN`, `LOSS`, `DRAW`, `NO_RESULT`, `NO_PREDICTION`
- Sets `wasCorrect`, `evaluatedAt`, `usedForEvaluation = true`

---

## Backtesting dashboard

**Route:** `GET /backtesting`  
**API:** `GET /api/backtesting?season=2026&modelType=blended&confidence=all&minEdge=0`

Analyses all graded predictions for a season. Filters by season, model type, confidence level, and minimum edge. Sections:

| Section | What it answers |
|---|---|
| Summary cards | Overall accuracy, P/L, ROI, best/worst rounds |
| Model comparison | Elo vs score model vs blended on same dataset |
| Round by round | Which rounds performed well or badly |
| Edge buckets | Does higher edge predict better outcomes? |
| Confidence buckets | Does High confidence actually outperform Low? |
| Favourite vs underdog | Are model upsets profitable? |
| Prediction list | Full record per match |

### Accuracy calculation
```
accuracy = correct_predictions / (correct + incorrect)
```
Draws are excluded from the numerator and denominator (counted separately).

### Theoretical ROI calculation
```
profit(win)  = (1 / homeImpliedNormalized) − 1  [fair-value odds − 1]
profit(loss) = −1
roi          = total_profit / total_bets_placed
```
Fair-value odds = `1 / normalized_implied_probability` (overround already removed). Actual market odds would be slightly lower, so real ROI would be lower than shown.

### Model comparison explanation
All three model variants are evaluated on the **same filtered dataset**. The predicted winner changes per model (based on which team has higher probability under that model). This isolates the decision-rule difference from the dataset difference.

### Limitations
- P/L uses fair-value odds, not actual bookmaker odds (slightly optimistic)
- The score model uses all historical data by default; early rounds have limited current-season data
- Draws are very rare in NRL but are excluded from accuracy metrics
- Results depend on having run "Generate predictions" and "Evaluate predictions" from Settings

---

## Data sources

### NRL schedule — `lib/scrapers/fixtures.ts`
Scrapes `https://www.nrl.com/draw/?competition=111&season={year}`.  
If NRL.com changes its HTML structure, update the CSS selectors at the top of this file.

### Historical results — `lib/scrapers/history.ts`
Scrapes `https://www.rugbyleagueproject.org/seasons/nrl-{year}/summary.html`.  
Table column positions are defined at the top of the scraper. Update them if the page layout changes.

### Odds — `lib/api/odds-api.ts`
Calls `https://api.the-odds-api.com/v4/sports/rugby_league_nrl/odds`.  
Requires a valid `ODDS_API_KEY`. The free tier has limited daily requests.

---

## Vercel deployment

1. Push to GitHub
2. Import the repo in Vercel
3. Set all environment variables in Project Settings
4. Deploy
5. Call `POST /api/jobs/bootstrap` once to seed and import data

### Vercel function timeout

Default Vercel Hobby plan has a 10-second function timeout. Bootstrap and history import take longer. Use a **Pro plan** or call individual job routes in sequence rather than bootstrap all at once.

### Build command

```
prisma generate && next build
```

This is already set in `package.json`.

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your values
npx prisma generate
npx prisma db push
npx prisma db seed
npm run dev
```

Visit `http://localhost:3000`.

---

## Tests

```bash
npm test
```

Tests cover:
- Elo probability math
- Rating update symmetry and upset weighting
- Edge calculation
- Implied probability normalisation
- Confidence band labelling
- Team name normalisation

---

## Limitations and assumptions

- No live score ingestion — scores are pulled from Rugby League Project after matches complete
- The NRL.com scraper uses CSS selectors that may break if NRL.com redesigns their draw page
- The Odds API free tier has a daily request quota (~500 requests/month)
- Bootstrap with full historical import from 2018 may exceed Vercel's 60s function timeout on Hobby — run individual job routes instead
- No authentication — this is a private analysis tool, not a public-facing app
- Draws are extremely rare in NRL but handled gracefully as `DRAW` result type
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
