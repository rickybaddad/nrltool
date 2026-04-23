# NRL Model

Production-ready Next.js web app for NRL match modeling and market comparison, designed for GitHub → Vercel deployment with Neon Postgres.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Prisma ORM + PostgreSQL (Neon)
- Zod runtime env validation
- Cheerio scrapers for NRL fixtures and Rugby League Project history
- The Odds API ingestion for bookmaker H2H prices

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

Reference template: `.env.example`.

## Database Setup (Neon + Prisma)
1. Create a Neon project and copy pooled connection string into `DATABASE_URL`.
2. On Vercel build, run:
   - `npx prisma generate`
   - `npx prisma migrate deploy`
3. Use `POST /api/jobs/bootstrap` to seed/import all data.

### Troubleshooting
- If you see `The table public.ImportRun does not exist`, your schema migrations have not been applied yet.
- Run `npx prisma migrate deploy` against the same `DATABASE_URL` used by the app, then retry `POST /api/jobs/bootstrap`.

## API Endpoints
### Read
- `GET /api/matches`
- `GET /api/predictions`
- `GET /api/predictions/upcoming`

### Jobs (idempotent)
- `POST /api/jobs/bootstrap`
- `POST /api/jobs/import-history`
- `POST /api/jobs/import-fixtures`
- `POST /api/jobs/import-odds`
- `POST /api/jobs/calculate-ratings`
- `POST /api/jobs/generate-predictions`

Each job writes to `ImportRun` with status and metadata.

## Bootstrap Flow
`POST /api/jobs/bootstrap` executes:
1. team seeding
2. historical import
3. Elo ratings calculation
4. fixtures import
5. odds import
6. prediction generation

## Data Flow
1. **History importer** parses seasons from Rugby League Project and upserts completed matches.
2. **Ratings job** recalculates Elo snapshots from all completed matches.
3. **Fixtures scraper** ingests upcoming draw matches from NRL.com.
4. **Odds importer** pulls bookmaker-level H2H markets from The Odds API.
5. **Prediction job** compares model probabilities vs normalized market probabilities and computes edge + confidence.

## Scraper Maintenance Guide
If source site markup changes:
1. Update selectors in `lib/scrapers/fixtures.ts` for NRL draw cards.
2. Update selectors in `lib/scrapers/history.ts` for season summary table rows.
3. Trigger `POST /api/jobs/import-history` / `import-fixtures` and verify `ImportRun.metadata.unmatched` for failed mappings.

## Vercel Notes
- No persistent workers required.
- Cron schedules are disabled by default; use **Settings → Manual job controls** to run maintenance jobs on demand.
- All operations are serverless-safe and API-triggered.

## Testing
- `npm test` runs lightweight unit tests for implied probability, Elo math, and edge calculations.
