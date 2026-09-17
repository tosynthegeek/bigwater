# BigWater Rail2 Platform: Infrastructure

How the "sustainability quests" service (repo: `tosynthegeek/bigwater`, package name
`bigwater_backend`) is hosted, deployed and wired. This is a **second, newer backend**
that sits alongside the existing BigWater membership platform — call that one **rail1**
(repo `bigw-api`, documented separately). This document, and the four that follow it,
cover the new service only: **rail2**.

## 1. The big picture

Rail2 is one codebase, built with **Bun + Hono + PostgreSQL + Redis**, that runs as
**two long-running processes** from the same Docker image:

| Process | What it does                                                                                                          | Start command                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **api** | The HTTP API (Hono), plus the BullMQ workers and schedulers (they run in the same process as the API, not separately) | `bun run start:api` (runs `drizzle-kit migrate`, then boots the server) |
| **bot** | The Telegram bot (long-polling with `grammy`)                                                                         | `bun run start:bot`                                                     |

Both processes can also be collapsed into one: setting `RUN_BOT_IN_PROCESS=true` starts
the bot inside the API process (useful for a single-service deploy), leaving the
standalone `bot` service unused.

Unlike rail1, **rail2 is not serverless** — it needs a container host, a persistent
Postgres connection, and a Redis instance for BullMQ queues, rate limiting and the
Telegram bot's session storage. It cannot run on Netlify/Vercel-style edge functions.

## 2. Environments

The repo currently has one deployed environment, **staging**, on Railway:

| Surface                 | URL                                                   |
| ----------------------- | ----------------------------------------------------- |
| API + admin back-office | `https://bigwater-rail2-admin-staging.up.railway.app` |
| Web/quests frontend     | `https://bigwater-rail2-web-staging.up.railway.app`   |

There is no `main`/`dev` branch split documented for rail2 the way rail1 has — the repo
has a single `main` branch and no staging/production branch convention has been set up
yet. Treat the URLs above as staging until a production topology is defined; the
`.env.example` and `DEPLOY.md` in the repo are written generically (`NODE_ENV=production`
is the only environment switch referenced), so a second (production) Railway project
using the same image and a fresh Postgres/Redis pair would be the natural way to add one.

## 3. Railway topology

One repo → one Docker image → up to **four Railway resources** in a project:

| Resource        | What it is                           | Notes                                                                                                              |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Postgres**    | Railway plugin                       | Provides `DATABASE_URL`                                                                                            |
| **Redis**       | Railway plugin                       | Provides `REDIS_URL` — used by BullMQ queues, the admin-login rate limiter, and the Telegram bot's session storage |
| **api** service | This repo, `Dockerfile`              | `bun run start:api`                                                                                                |
| **bot** service | Same image, start command overridden | `bun run start:bot` (no inbound HTTP, so no health check)                                                          |

`railway.json` sets the **api** service's defaults: Dockerfile build, start command
`bun run start:api`, health check on `/health`, and a restart policy of up to 5 retries
on failure.

**Deploy sequence for the api service** (from the Dockerfile / `start:api` script):

1. `drizzle-kit migrate` — applies any pending SQL migrations from
   `src/db/migrations/`. If this fails, the deploy fails and the previous version
   keeps running.
2. `bun index.ts` boots the Hono server, which on startup also:
   - runs `runSeeds()` — idempotent seeding of submission limits, bands and admin
     accounts (see the database document for what each seed does);
   - starts the BullMQ schedulers (`startQueues()` — schedules the recurring banking
     and streak-break sweeps);
   - "warms up" the Privy JWKS client with a throwaway token verification, so the
     first real login isn't slowed by a cold JWKS fetch (and suppresses the noisy
     expected-failure log line from that warmup call);
   - if `RUN_BOT_IN_PROCESS=true`, also starts the Telegram bot's long-polling loop
     in the background.
3. `GET /health` runs `SELECT 1` against Postgres and returns `200 OK` (or `500
Database unavailable`) — this is what Railway's health check polls, and it is
   registered **before** any auth middleware so it's reachable with no token.

**Shutdown**: the process traps `SIGTERM`/`SIGINT`, stops accepting new HTTP
connections, drains the BullMQ workers (`stopQueues()` closes all six worker
instances — see the database document's queue section — so in-flight jobs finish
instead of being killed mid-task), then exits.

## 4. Required environment variables

The full list is enumerated and validated at boot (`src/zod/env.ts` — a failed
`.parse()` calls `process.exit(1)`, so a missing var is a boot-time failure, not a
runtime surprise). Grouped by purpose:

| Group              | Variables                                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime            | `NODE_ENV`, `PORT`                                                                                                                                                                       | `NODE_ENV` also gates SQL query debug logging (`postgres` client logs raw SQL when not `production`) and a dev-only rounding rule in `startOfDayUtc` (rounds to the hour instead of midnight, to make cooldown testing fast)                                                                                              |
| Database           | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                                                                                                      | Same Postgres instance rail1 uses — see the database document                                                                                                                                                                                                                                                             |
| Redis              | `REDIS_URL`, `REDIS_PASSWORD` (optional)                                                                                                                                                 | BullMQ, rate limiting, bot sessions                                                                                                                                                                                                                                                                                       |
| CORS               | `CLIENT_URL`                                                                                                                                                                             | **Comma-separated list.** The web app and the admin app are two separate frontend origins, so both must be listed (e.g. `https://app.example.com,https://admin.example.com`). In production, exactly these origins are allowed; in any other `NODE_ENV`, `localhost:3000` and `localhost:3001` are appended automatically |
| Cross-service auth | `RAIL1_JWT_SECRET`                                                                                                                                                                       | **Must equal rail1's own `JWT_SECRET`.** Rail2 verifies rail1-issued session tokens itself (HS256) rather than calling rail1 over the network — see the database document, section 7                                                                                                                                      |
| Privy              | `PRIVY_APP_ID`, `PRIVY_APP_SECRET`                                                                                                                                                       | Member and admin login                                                                                                                                                                                                                                                                                                    |
| Telegram           | `TELEGRAM_BOT_TOKEN`                                                                                                                                                                     | From @BotFather                                                                                                                                                                                                                                                                                                           |
| AI verification    | `AI_SERVICE_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `SIGHTENGINE_USER`, `SIGHTENGINE_SECRET`                                                                                 | See the API document's AI-evaluation section — the shape of this has drifted from what `DEPLOY.md` describes (see the callout there)                                                                                                                                                                                      |
| File storage       | `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `AWS_ACCESS_KEY`, `AWS_ACCESS_SECRET`, `AWS_CLOUDFRONT_URL`, and optionally `AWS_S3_ENDPOINT`, `STORAGE_DRIVER`, `UPLOAD_DIR`, `PUBLIC_BASE_URL` | See section 6 below                                                                                                                                                                                                                                                                                                       |
| Admin              | `ADMIN_PRIVY_DIDS`, `ADMIN_SESSION_SECRET`                                                                                                                                               | See the admin document                                                                                                                                                                                                                                                                                                    |
| Timing / economy   | `TALLY_PERIOD_MS`, `BANKING_SWEEP_INTERVAL_MS`, `STREAK_SWEEP_INTERVAL_MS`, `DAY_PERIOD_MS`, `WEEKLY_PERIOD_MS`                                                                          | All optional, all have production-safe defaults — see the database document's economy section for what each controls                                                                                                                                                                                                      |
| Demo-only          | `DEMO_AUTO_REVIEW`                                                                                                                                                                       | Declared in the env schema and described in `DEPLOY.md`, but **not read anywhere in the current submission code path** — see the callout in the API document                                                                                                                                                              |

## 5. Rail1/rail2 relationship, infrastructure-wise

Rail2 is **not a standalone product** — it is an add-on quest/rewards layer bolted onto
the existing membership platform:

- Rail2 reads and writes rail1's `users` table **directly**, in the same Postgres
  database and, in at least one place, the same transaction (crediting rail1's
  `total_points` when a member links Telegram for the first time). This is a
  deliberate shared-database integration, not an API call between services — see the
  database document, section 7, for the full mechanism.
- Rail2's own `drizzle.config.ts` only points at `src/db/schema/rail2.ts`, so
  `drizzle-kit migrate`/`generate` never touches rail1's `users` table. Rail1's schema
  file is vendored into this repo (`src/db/schema/rail1.ts`, headed "owned by rail1")
  strictly so rail2's Drizzle queries can type-check and join against it — rail1 owns
  that table's actual migrations.
  - Deploying rail2 does not require redeploying rail1, but rail2 **does** require a
    `DATABASE_URL` pointed at the same Postgres instance rail1 uses, and rail1's
    `users` table must already exist in it before rail2's migrations run (rail2 never
    creates it).
- The cross-service authentication link (a rail1-issued JWT, forwarded as
  `X-Rail1-Token`) requires the two services' `JWT_SECRET`/`RAIL1_JWT_SECRET` to match.
  If rail1 ever rotates its secret, rail2's copy has to be rotated in lockstep or every
  first-time rail2 login for an existing rail1 member starts failing.

## 6. File storage

Proof-of-task photos (and Telegram marketing images) go through one of two drivers,
selected by `STORAGE_DRIVER`:

- **`s3` (default).** Uploads go to an S3-compatible bucket via the AWS SDK.
  `AWS_S3_ENDPOINT` is optional: unset, the SDK talks to real AWS S3; set, it points at
  any S3-compatible store (MinIO, Cloudflare R2, Supabase Storage, Backblaze B2) with
  path-style addressing forced on (required by most non-AWS providers). Public URLs are
  served through `AWS_CLOUDFRONT_URL`.
- **`local`.** Files are written to `UPLOAD_DIR` on the container's own disk and served
  back unauthenticated from `GET /uploads/:filename` (registered outside `/api`, so it
  never hits the member-auth middleware — an `<img src>` tag can't attach a bearer
  token). `PUBLIC_BASE_URL` must be the API's own public origin for the returned URLs to
  resolve. This is a zero-dependency option for staging/demo; it does **not** survive a
  redeploy on most container hosts (ephemeral filesystem), so it is not suitable for
  production use as-is.

## 7. Health, logs and process management

- `GET /health` — unauthenticated, checks Postgres connectivity, used by Railway's
  health check and any uptime monitor.
- Logging is currently **stdout only** — see the API document's "Logging" section for
  what is and isn't captured today, and concrete options for making logs queryable.
- `@bull-board/api` and `@bull-board/hono` are installed as dependencies (a
  ready-made dashboard for BullMQ queues) but are **not wired into the app** — no route
  mounts a Bull Board UI today. Mounting one (behind the admin auth middleware) would
  be the fastest way to get visibility into queue backlogs and failed jobs without
  writing anything custom.
- `hono-rate-limiter` is likewise installed but unused; the app's own hand-rolled
  Redis-backed limiter (`src/middleware/rate-limit.ts`) exists but only its `checkRateLimit`
  sibling in `src/utils/time.ts` is actually wired up (on admin password login) — see the
  API document's rate-limiting section.

## 8. Local development

`docker-compose.yml` brings up just Postgres and Redis (the app itself runs on the host
via Bun, not in a container, for local dev). A `Makefile` wraps the common flows:

- `make docker-up` / `make docker-down` — Postgres + Redis only
- `make dev` — starts both `api` and `bot` in the background with `bun --watch`,
  logging to `logs/api.log` / `logs/bot.log`, tracked via PID files in `.run/`
- `make status`, `make stop`, `make logs` (`logs-api`, `logs-bot`) — process management
  around the above

`bun run dev` (no Makefile) does the same for the API process alone, without the bot.
