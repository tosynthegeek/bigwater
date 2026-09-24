# BigWater backend — deployment (Railway)

This service is **not serverless** (long-running Bun/Hono server + a persistent
long-polling Telegram bot + Postgres + Redis), so it runs on a container host.
These notes cover a Railway deployment for the client demo.

## Topology

One repo → one Docker image → **four Railway resources** in a single project:

| Resource        | What it is             | Start command / notes                           |
| --------------- | ---------------------- | ----------------------------------------------- |
| **Postgres**    | Railway plugin         | provides `DATABASE_URL`                         |
| **Redis**       | Railway plugin         | provides `REDIS_URL` (rate-limit + bot session) |
| **api** service | this repo (Dockerfile) | `bun run start:api` (migrate, then serve)       |
| **bot** service | this repo (Dockerfile) | `bun run start:bot` (Telegram long-polling)     |

`railway.json` sets the **api** defaults (Dockerfile build, `/health` healthcheck).
The **bot** service uses the same image with its start command overridden to
`bun run start:bot`. The bot has **no** healthcheck (it makes no inbound HTTP).

## Required environment variables (set on both api and bot services)

```
NODE_ENV=production
PORT=3000                         # api only; Railway injects its own PORT too
DATABASE_URL=...                  # from Railway Postgres (reference variable)
POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB   # from Railway Postgres
REDIS_URL=...                     # from Railway Redis (reference variable)
CLIENT_URL=https://<user-app>.vercel.app          # CORS allow-list (prod = exact match)
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
TELEGRAM_BOT_TOKEN=...            # from @BotFather
AI_SERVICE_API_KEY=...            # any random secret for the demo (AI service not deployed)
AWS_BUCKET_NAME / AWS_BUCKET_REGION / AWS_ACCESS_KEY / AWS_ACCESS_SECRET / AWS_CLOUDFRONT_URL
ADMIN_PRIVY_DIDS=did:privy:...    # grant admin role on seed (comma-separated)
DEMO_AUTO_REVIEW=true             # DEMO ONLY — see below
```

> **`CLIENT_URL`**: in production the CORS middleware allows **only** this exact
> origin. It points at the **user** app. If the **admin** Vercel app is a
> different origin, add it too (the code currently allows a single prod origin —
> for the demo, either widen `src/app.ts` CORS or run admin under the same apex).

## `DEMO_AUTO_REVIEW`

The external AI verification microservice is **not** part of this repo and is not
deployed. Without it, submissions stay `pending` forever and never reach the
admin review queue (which shows only `under_review`). Setting
`DEMO_AUTO_REVIEW=true` routes new submissions straight to `under_review` with a
synthetic verdict so the **submit → review → approve → points** loop is fully
demoable. **Unset it for real production** — behaviour then reverts to `pending`.

## Deploy steps (CLI)

```bash
railway login
railway init                      # create/select the BigWater project
railway add --plugin postgresql
railway add --plugin redis
# Create the api service from this repo, set env vars, deploy:
railway up                        # builds Dockerfile, runs start:api (migrations + seed on boot)
# Create a second service for the bot, override start command to: bun run start:bot
```

Migrations run automatically on api boot (`start:api` → `drizzle-kit migrate`),
and `runSeeds()` (bands, submission limits, admins from `ADMIN_PRIVY_DIDS`) runs
on every server start (idempotent).

## Smoke test

```bash
curl -sf https://<api>.up.railway.app/health      # -> OK
```

Then from the user app: connect wallet (Privy) → link Telegram → submit a proof →
it appears in the admin app's Review Queue → approve → points awarded.
