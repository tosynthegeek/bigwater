# BigWater Rail2 Admin Back-Office Guide

How to operate the rail2 (sustainability quests) platform from the admin API: tasks,
submissions review, participants, config, and admin accounts. This mirrors the shape
of the rail1 admin guide, but rail2's admin surface is API-only in this repo — there is
no bundled admin UI source here (the staging admin URL referenced in the
infrastructure document is a separate frontend deploy).

## Signing in

There are **two independent ways** to authenticate as an admin, both landing on
`POST /api/admin/login`:

1. **Password login.** Send `{ "identifier": "<email or username>", "password":
"<password>" }`. Rate-limited to 5 attempts per 5 minutes per identifier. On
   success, issues an `admin_session` cookie (`HttpOnly; Secure; SameSite=None`, 8-hour
   expiry) and returns the admin's own safe profile fields.
2. **Privy login.** Send `Authorization: Bearer <privy-access-token>` instead of a
   JSON body. The Privy DID is resolved against Privy's own API to read the linked
   Google account / wallet, matched against an existing admin row (see "How an admin
   account comes to exist" below), and on success issues the same kind of
   `admin_session` cookie.

Either path can be used going forward: once you have the `admin_session` cookie,
every other `/api/admin/*` route accepts it. A Privy-bearer admin can also just keep
sending their Privy token on every request instead of picking up the cookie — both
are accepted transparently by `adminSessionAuth`.

**Logging out** (`POST /api/admin/logout`) clears the cookie **and** revokes its
`jti` in Redis, so a copy of the token captured before logout can't be replayed —
this is checked on every subsequent request, not just at login.

There is no explicit "session lasts 12 hours" design note the way rail1's admin guide
states — rail2's session is a fixed 8 hours from issuance
(`SESSION_TTL_SECONDS`), non-refreshing; after that, sign in again. There is also no
account-lockout-after-N-failed-passwords mechanism on the account itself (only the
IP/identifier-keyed rate limit above) — a locked-out attacker is slowed, not blocked
outright after a fixed number of tries.

## Two roles

| Role         | Can                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `admin`      | Everything below **except** revoking another admin's access and resetting another admin's password |
| `superadmin` | Everything, including revoking admins and resetting their passwords                                |

Every regular member also has a row in the same table with `role: "user"` — the role
column is what separates "a member" from "an operator," not a separate table.

## How an admin account comes to exist

There is no separate "seed the first superadmin manually" script step the way rail1
documents one — instead, on **every** server boot, `runSeeds()` reads
`ADMIN_PRIVY_DIDS` (a comma-separated list of emails or `0x...` wallet addresses) and,
for each one: if a matching account already exists, promotes it to `superadmin`; if
not, creates a new placeholder `auth_accounts` row with `role: "superadmin"` and the
identifier temporarily stored in the `privy_did` column (lowercased). This is
idempotent — safe to leave `ADMIN_PRIVY_DIDS` set permanently across every restart.

**Inviting further admins** (beyond the bootstrap superadmins above) happens from
`POST /api/admin/add`, with two methods:

- **`method: "privy"`** — give an `identifier` (an email or a `0x...` wallet address).
  Creates a placeholder row exactly like the bootstrap seed does: `role: "admin"`,
  the identifier temporarily stored in `privy_did`. The invited person "claims" it the
  first time they actually log in with Privy using that email/wallet — at which point
  `getOrcreateAdminByPrivyDid` finds the placeholder by matching the real Privy DID's
  linked Google account/wallet against it, and overwrites `privy_did` with the real
  DID (plus fills in `email`/`walletAddress` for real).
- **`method: "password"`** — give `email`, `username`, `password` directly. Creates a
  fully active `admin` row immediately, no claim step.

**Re-inviting a previously revoked admin** is handled specially: if the identifier
matches an existing row with `role: "user", status: "inactive"` (exactly what
`revokeAdmin` leaves behind — see below), that row is **reactivated in place** rather
than a duplicate being inserted, which would otherwise silently orphan the original
account's history. Inviting an identifier that's already an _active_ admin, or already
has an unclaimed invite pending, is refused with a `409` explaining which case it is.

## Managing admins

- **`GET /api/admin/admins`** — list every `admin`/`superadmin` row.
- **`GET /api/admin/profile`** — the logged-in admin's own row, with `passwordHash`
  stripped and replaced by a boolean `hasPassword` (so a frontend can decide whether to
  show a "change my password" option without ever seeing the hash).
- **`PATCH /api/admin/password`** — change your own password (requires the current one;
  fails with a clear `400` if this account has no password set at all, i.e. it's
  Privy-only).
- **`PATCH /api/admin/admins/:adminUserId/password`** — **superadmin only.** Force-resets
  another admin's password with no current-password check — the escape hatch for a
  locked-out admin.
- **`POST /api/admin/revoke`** — **superadmin only.** Flips the target's `role` to
  `"user"` and `status` to `"inactive"`. This is what "revoked" means in this
  codebase — the row survives (nothing is deleted), it's just demoted and marked
  inactive, and cannot revoke your own account (`400`).

## Tasks

- **`GET /api/admin/tasks`** — every task, active or not.
- **`POST /api/admin/tasks`** — create one (`title`, `category`, `basePoints`
  required; `description`, `isHighValue`, `active` optional). Creating a task also
  fires a Telegram announcement to every linked member — see the API document's
  queue table.
- **`PATCH /api/admin/tasks/:id`** — update any subset of fields.
- **`PATCH /api/admin/tasks/:id/activate`** / **`.../deactivate`** — the on/off switch.
  An inactive task disappears from the member-facing catalog (web and Telegram)
  immediately, but existing submissions and any points already awarded are untouched.

There is **no delete endpoint** for tasks in this codebase — deactivating is the only
retirement path available today.

## Submission review

- **`GET /api/admin/submissions/review`** — the queue: every `under_review`
  submission, newest first, joined with the task title, the submitter's username and
  rail1 wallet address, and (if present) any per-model relevance-check debug data held
  in-memory from the AI evaluation step.
- **`PATCH /api/admin/submissions/:id/review`** — the decision. Body: `{ "status":
"approved" | "rejected" }`. Refuses anything not currently `under_review` with a
  `409` (so a submission can't be double-reviewed, and can't be reviewed before the AI
  pipeline has even run). Approving credits points, updates the monthly tally and band,
  and updates the streak — see the database document, sections 6–9, for exactly what
  that touches. Either outcome queues a Telegram notification to the member if they
  have a linked Telegram account.
- **`GET /api/admin/submissions/approved-rejected?limit&offset`** — paginated
  history of past decisions.
- **`DELETE /api/admin/submissions/:id`** — hard-deletes a submission row entirely
  (not a status change) — use with care; this does not reverse any points already
  awarded if the submission had already been approved before deletion (there's no
  automatic points clawback tied to this endpoint).
- **`GET /api/admin/submissions/custom`** — a vestigial endpoint that queries for
  submissions with no `task_id`; per the current schema (`task_id` is `NOT NULL`), it
  should always return an empty list. See the database document's callout on this.

## Participants

- **`GET /api/admin/participants?limit&offset&search`** — paginated list, each row
  showing username, rail1 wallet address, combined score, current band, current
  streak, and flag/membership status. `search` matches (case-insensitively) against
  username, wallet address, or email. Also returns aggregate stats: total participant
  count, flagged count, and how many were active (had a points-ledger entry) in the
  last 7 days.
- **`PATCH /api/admin/participants/:userId/flag`** — `{ "isFlagged": true|false,
"reason"?: string }`. A flagged participant is blocked from submitting new proofs
  (checked at submission time — see the database document, section 3) but keeps
  everything they've already earned. The `reason` is logged to stdout, not stored on
  any row — there is no persisted moderation-note field for this today.
- **`POST /api/admin/participants/:userId/points`** — `{ "points": <number, can be
negative>, "reason": <string, required>, "month"?: "yyyy-MM" }`. Same
  ledger/tally/band mechanics an approved submission would trigger, but with no
  submission behind it (`submissionId: null` on the ledger row) — the way to correct a
  member's score by hand. `reason` is required for the request to succeed, but — same
  caveat as flagging — it's only ever logged, not persisted to a queryable audit
  column.

## Configuration

- **`GET` / `PATCH /api/admin/submission-limits`** — the singleton row governing
  cooldown, daily caps and (declared but currently unenforced/unused) monthly cap and
  streak-toggle fields. **Before changing `cooldownHours` from the admin panel, read
  the callout in the database document** — despite its name, this field is treated as
  raw milliseconds everywhere it's consumed, not hours.
- **`GET` / `PATCH /api/admin/bands`** — the five score bands and their multipliers.
  Band lookups are cached for 60 seconds in the API process, so an edit here can take
  up to a minute to be reflected in newly-computed tallies.

## Platform overview

`GET /api/admin/overview` — the dashboard summary: total (rail1) members and new this
week, rail2 engagement figures, submission volume and approval-rate trends (this week
vs. last week), how many submissions are currently sitting in the review queue, and
points issued this week vs. last week. Entirely read-only.

## Telegram broadcast

`POST /api/admin/telegram/broadcast` — `multipart/form-data`: `message` (required,
≤1024 characters — Telegram's own caption limit when an image is attached) and an
optional `file` (image, ≤10MB). Queues a job that sends the message (with the image, if
provided) to every member with a linked Telegram account, at a throttled rate. Returns
immediately with `202` and a `jobId` — the send itself happens asynchronously; check
the worker's logs (or a mounted Bull Board, once one exists — see the API document) to
confirm delivery counts rather than assuming success from the `202` alone.

## Audit trail — what exists and what doesn't

Unlike rail1's admin back-office, **rail2 has no dedicated audit-log table.** Every
admin action that would normally be audited (flagging a participant, adjusting points,
reviewing a submission, adding/revoking an admin) is only ever recorded as a
`console.log`/`console.error` line and whatever fields the affected row itself ends up
holding — there is no `admin_audit_logs`-equivalent table capturing who did what, when,
on which object, independent of the target row's own history. If a real audit trail is
needed, the two most-touched actions to instrument first would be point adjustments
and admin revocations, since both currently discard their `reason`/actor information
after logging it.
