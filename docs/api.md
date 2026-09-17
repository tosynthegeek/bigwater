# BigWater Rail2 Backend Documentation — API

Covers authentication/access levels, the error contract (and where it's inconsistent),
logging, rate limiting, and a full endpoint reference. Ends with concrete options for
publishing this as live, browsable API docs (there is currently no Swagger/OpenAPI
setup in the repo to link to).

## 1. Access levels

There are four distinct gates in this codebase, applied per route prefix in
`src/app.ts`:

| Prefix | Middleware | Who gets in |
|---|---|---|
| `/health` | none | Anyone — unauthenticated, used by Railway's health check |
| `/uploads/:filename` | none | Anyone — the `local` storage driver's public file server |
| `/api/admin/login` | none (the controller does its own checks) | Anyone attempting to log in |
| `/api/admin/*` (else) | `adminSessionAuth` → `requireAdmin` | An account with `role` of `admin` or `superadmin`, authenticated either via a Privy bearer token or the `admin_session` cookie |
| `/api/*` (else) | `privyAuth` → `requireAuth` | Any authenticated rail2 account — member or admin (an admin hitting a plain member route is allowed, per the identity flow in the database document) |
| `/internal/*` | `requireServiceAuth` | A caller presenting `x-api-key: <AI_SERVICE_API_KEY>` — intended for a service-to-service call, not a browser |

There is no distinct "participant" vs. "admin" role check on plain `/api/*` routes
beyond `requireAuth` — every one of those routes is reachable by any logged-in
account. Fine-grained role gating (member-only vs. admin-only) only exists at the
`/api/admin/*` boundary, and *within* `/api/admin/*` a few routes further restrict to
`superadmin` specifically (revoking an admin, resetting another admin's password) —
see the admin document for the full breakdown of which admin actions require which
role.

**Two ways to authenticate as an admin**, both accepted by `adminSessionAuth`:
1. **Privy bearer token** — `Authorization: Bearer <privy-access-token>`, same
   verification path as a member, but requiring the resolved account to already have
   the `admin`/`superadmin` role (see the admin document for how that account gets
   created in the first place).
2. **`admin_session` cookie** — issued by `POST /api/admin/login` after a successful
   password login (see the admin document). An 8-hour HS256 JWT, `HttpOnly; Secure;
   SameSite=None`, checked against a Redis revocation list on every request (logging
   out writes the token's `jti` to Redis with a TTL matching its remaining lifetime).

## 2. Error contract

**There is no single standard error envelope.** Nearly every handler returns
`{ "error": "<message>" }` with an appropriate HTTP status, which is a reasonable de
facto convention, but it is not enforced by any shared helper or middleware — each
controller builds its own JSON by hand. Two inconsistencies worth fixing if this is
formalized:

- **Validation errors** are sometimes `{ "error": <zod issues array> }` (e.g.
  `updateSubmissionAiConfidence`, `updateSubmissionLimits`) and sometimes
  `{ "error": "Invalid request body", "details": <zod issues array> }` (e.g.
  `addAdmin`, `revokeAdmin`, task update). A caller can't rely on `error` always being
  a string.
- **Unhandled exceptions** are caught individually per-controller with a
  `try/catch` around each handler body and logged with a per-function prefix (e.g.
  `"Submissions.Controllers.submitProof.error: "`), then converted to `{ "error":
  "Internal server error" }` with a `500`. There's no global Hono `onError` handler, so
  a controller that forgets its own `try/catch` (or throws before entering one) would
  currently surface as an unhandled exception rather than a clean JSON 500 — worth
  auditing if uncaught-exception crashes are ever observed in production logs.

**Recommendation if standardizing:** adopt a single envelope shape — e.g. `{ "error":
{ "code": "...", "message": "...", "details"?: ... } }`, mirroring what rail1 already
settled on — and enforce it with a global `app.onError()` handler in `src/app.ts` plus
a small helper controllers call instead of building `c.json({ error: ... })` by hand.
That would also be the natural place to catch the "forgot try/catch" gap above.

## 3. Logging

**Current state:** logging is `console.log`/`console.error`/`console.warn` scattered
through controllers, services and workers, plus Hono's built-in request logger
(`hono/logger`, one line per request: method, path, status, timing) mounted globally in
`src/app.ts`. There is no structured (JSON) logging, no log levels beyond what
`console.*` implies, no request-ID/correlation-ID propagation, and no external log
aggregation configured. Whatever Railway captures from the container's stdout/stderr
is, today, the entire log record.

**What that means in practice for debugging a production incident:**
- You can grep Railway's log viewer (or `railway logs`) for a known submission ID,
  user ID, or the per-function error prefixes already used consistently in most
  controllers (e.g. `"Admin.Controllers.getPlatformOverview.error:"`) — but there's no
  way to pull "everything that happened for request X" in one query, since nothing
  ties log lines from the same request together.
  - **This IS enough to trace which module raised an error already** — the prefixes
    are consistent and the module boundaries are clear (`Controllers`, `services/`,
    `workers/`) — but not to trace a request's full path through the system (API →
    queue job → worker → notification), since the queue-side logs (BullMQ job
    lifecycle: `active`, `completed`, `failed`) are logged separately from the
    controller that enqueued them, with no shared ID linking the two except whatever
    ID you already know (submission ID, user ID) and can grep for by hand.

**Concrete changes worth making, roughly in order of effort:**
1. **Add a request ID.** A small Hono middleware that generates (or forwards, if the
   proxy sets one) an ID per request, attaches it to the Hono context, and includes it
   in every `console.error` call in that request's lifecycle (and passes it into the
   BullMQ job payload so the worker's own logs can include it too). This alone makes
   "what happened for this one request" traceable across the API/worker boundary.
2. **Switch to structured logging.** Replace `console.log("prefix", data)` calls with
   a small JSON logger (even just `console.log(JSON.stringify({ level, module,
   requestId, ...data }))`, or a library like `pino`) so Railway's log viewer — or
   anything log lines get shipped to later — can be filtered/queried by field instead
   of by string-matching a prefix.
3. **Mount Bull Board.** `@bull-board/api` and `@bull-board/hono` are already
   dependencies but unused (see the infrastructure document) — mounting one behind
   `adminSessionAuth`/`requireAdmin` gives immediate visibility into queue depth,
   failed jobs, and retry history without writing anything custom. This directly
   answers "which module is causing issues" for anything that runs as a BullMQ job
   (evaluation, notifications, banking, streaks).
4. **Ship logs somewhere queryable.** Railway's own log retention is short and
   text-search-only. If "keep all the logs ready" means being able to search
   historical logs by field, month later, across a redeploy, pipe stdout to an
   external sink (Railway supports log drains to most log platforms — check Railway's
   current documentation for the exact setup, since this is a platform feature rather
   than something the codebase controls) or add a lightweight APM/log
   aggregator (e.g. Better Stack, Axiom, Datadog) as an env var + one-line integration.
5. **Add a global error boundary.** Per point 2 in the error-contract section above —
   this also gives you one place to guarantee every unhandled exception is logged with
   a consistent shape, instead of relying on each handler's own `try/catch`.

None of this requires touching the framework — Hono supports middleware and a global
`onError` cleanly, and BullMQ's own event emitters (already partially used — see
`bankingWorker.on("failed", ...)` etc.) are the natural hook point for the queue side.

## 4. Rate limiting

Two independent, overlapping implementations exist:

- **`src/utils/time.ts`'s `checkRateLimit(key, max=5, windowSec=300)`** — a simple
  Redis `INCR` + `EXPIRE` fixed-window counter. **This is the one actually wired up**,
  and only on one route: admin password login (`handlePasswordLogin`), keyed by the
  submitted identifier, 5 attempts per 5 minutes.
- **`src/middleware/rate-limit.ts`'s `createRateLimiter`/`publicRateLimiter`** — a more
  general Hono middleware factory (same IP-keyed fixed-window pattern, reading
  `cf-connecting-ip`/`x-forwarded-for`), exported as a ready-made `publicRateLimiter`
  (10 requests/minute, keyed `"login"`). **This is not applied to any route** — it is
  dead code today. If per-route rate limiting is wanted more broadly (e.g. on
  `POST /api/submissions/send`, which currently has no rate limit beyond the
  once-per-cooldown-window business rule), this is the ready-made building block; it
  just needs to be added to a route's middleware chain.
- The `hono-rate-limiter` npm package is also a dependency but is used by neither of
  the above and isn't imported anywhere.

There is no IP or account rate limit on the member-facing endpoints beyond submission
limits' own business rules (see the database document, section 3) — `GET /api/tasks`,
`GET /api/leaderboard`, etc. have no rate limiting layer at all.

## 5. CORS and payload limits

- CORS is configured once, globally, in `src/app.ts`: origin allow-list from
  `CLIENT_URL` (comma-separated), credentials enabled, methods `GET, POST, PUT, PATCH,
  DELETE, OPTIONS`, a 600-second preflight cache. See the infrastructure document for
  the exact production-vs-dev origin behavior.
- Every request body is capped at 10MB (`hono/body-limit`), returning `413 Payload too
  large` — this is a global cap, not specific to the image-upload routes (which have
  their own, tighter, 1MB image-size check inside the upload validation logic, and a
  separate 10MB check specifically on the Telegram-broadcast image upload).
- A small global middleware sets `X-Robots-Tag: noindex, nofollow`,
  `X-Content-Type-Options: nosniff`, and HSTS on every response.

## 6. Endpoint reference

Base paths: `/api` (member + shared), `/api/admin` (admin-only), `/internal`
(service-to-service). All request/response bodies are JSON unless noted.

### Public / member (`/api/*`, requires a valid session)

| Method & path | Purpose |
|---|---|
| `GET /api/tasks` | List active tasks |
| `POST /api/submissions/send` | Submit proof (`multipart/form-data`: `taskId`, `file`) |
| `GET /api/participants/profile` | The caller's combined score/profile summary |
| `GET /api/participants/submissions` | The caller's own submission history |
| `GET /api/submissions/limits` | The caller's current cooldown/daily-limit status and which tasks are still available today |
| `GET /api/submissions/:id` | One of the caller's own submissions by ID |
| `GET /api/leaderboard?timeframe=global\|weekly\|monthly[&month=yyyy-MM][&limit][&offset]` | Ranked leaderboard page + the caller's own rank |
| `POST /api/telegram/link-code` | Generate a one-time Telegram-linking code |

### Admin (`/api/admin/*`, requires `admin`/`superadmin`; a few require `superadmin` specifically — see the admin document)

| Method & path | Purpose |
|---|---|
| `POST /api/admin/login` | Password **or** Privy-bearer admin login (see the admin document) — the only unauthenticated route in this group |
| `POST /api/admin/logout` | Revoke the current `admin_session` cookie |
| `GET /api/admin/profile` | The logged-in admin's own account |
| `PATCH /api/admin/password` | Change the logged-in admin's own password |
| `PATCH /api/admin/admins/:adminUserId/password` | Reset another admin's password — **superadmin only** |
| `GET /api/admin/admins` | List all admin/superadmin accounts |
| `POST /api/admin/add` | Invite a new admin (Privy-identifier or password method) |
| `POST /api/admin/revoke` | Revoke another admin's access — **superadmin only** |
| `GET /api/admin/tasks` | List all tasks (active and inactive) |
| `POST /api/admin/tasks` | Create a task |
| `PATCH /api/admin/tasks/:id` | Update a task |
| `PATCH /api/admin/tasks/:id/activate` | Activate a task |
| `PATCH /api/admin/tasks/:id/deactivate` | Deactivate a task |
| `GET /api/admin/submission-limits` | Read the singleton submission-limits config |
| `PATCH /api/admin/submission-limits` | Update it |
| `GET /api/admin/bands` | List score bands |
| `PATCH /api/admin/bands/:id` | Update a band |
| `GET /api/admin/submissions/custom` | *(vestigial — see the database document)* |
| `DELETE /api/admin/submissions/:id` | Delete a submission |
| `GET /api/admin/submissions/review` | The review queue (`under_review` submissions) |
| `PATCH /api/admin/submissions/:id/review` | Approve or reject a submission |
| `GET /api/admin/submissions/approved-rejected?limit&offset` | Reviewed-submission history |
| `GET /api/admin/participants?limit&offset&search` | Paginated/searchable participant list with combined stats |
| `PATCH /api/admin/participants/:userId/flag` | Flag/unflag a participant |
| `POST /api/admin/participants/:userId/points` | Manually adjust a participant's points (positive or negative) |
| `GET /api/admin/overview` | Platform-wide stats for the admin dashboard |
| `POST /api/admin/telegram/broadcast` | Send a marketing message (optionally with an image) to every Telegram-linked member (`multipart/form-data`: `message`, optional `file`) |

### Internal (`/internal/*`, requires `x-api-key: <AI_SERVICE_API_KEY>`)

| Method & path | Purpose |
|---|---|
| `PATCH /internal/submissions/:id/review` | For an **external** AI verification service to report `aiConfidence`/`aiVerdict` and move a submission to `under_review` — an alternative to the in-process Sightengine/OpenRouter pipeline described in the database document. Nothing in this repo currently calls it; it exists for a future or externally-hosted verifier |

### Infrastructure (outside `/api`, no auth)

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness/readiness — checks Postgres |
| `GET /uploads/:filename` | Serves proof images when `STORAGE_DRIVER=local` (404 for any other driver) |

## 7. Publishing this as live, browsable API docs

There is currently **no OpenAPI/Swagger definition anywhere in the repo** — routes are
plain `Hono` handlers with Zod validation scattered per-controller, not declared
through anything that can generate a spec automatically today. To get to a link you
can hand someone (a Swagger UI / Scalar page, or a Postman/Insomnia collection), two
realistic paths:

**Option A — retrofit with `@hono/zod-openapi` (recommended, moderate effort).**
Hono has an official OpenAPI extension (`@hono/zod-openapi`) that lets you describe
each route's request/response with the same Zod schemas already used for validation
(`src/zod/*.ts` already has most of the shapes you'd need), and it auto-generates a
spec you can serve at, say, `GET /api/docs/openapi.json`, then point Swagger UI or
[Scalar's API reference component](https://github.com/scalar/scalar) at. This is the
path of least resistance because the validation logic doesn't change — only the route
registration style does (`app.openapi(route, handler)` instead of `app.get(path,
handler)`), and it can be done incrementally, route group by route group.

**Option B — hand-write an OpenAPI 3.1 YAML/JSON file** from the endpoint table above,
independent of the code, and serve it as a static file plus a Swagger UI/Scalar page
that points at it. Faster to get a first version live, but it will drift from the
actual routes over time unless someone remembers to update it on every change — the
opposite trade-off from Option A.

Either way, once you have an `openapi.json`, the fastest way to get a browsable page
with zero extra hosting is to serve
[Scalar's `@scalar/hono-api-reference` middleware](https://github.com/scalar/scalar)
(or the classic `swagger-ui-dist` served as a static route) directly from this same
Hono app — one more route, no separate deploy.

I can build out either option for you — happy to scaffold the `@hono/zod-openapi`
migration for one route group (say, tasks or submissions) as a proof of concept if
that's useful.