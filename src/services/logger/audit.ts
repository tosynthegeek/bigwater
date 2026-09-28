// src/services/audit.ts
import type { Context, MiddlewareHandler } from "hono";
import { db } from "@/db";
import { logger } from "./logger";
import { adminAuditLogs } from "@/db/schema/rail2";

const log = logger.child({ source: "audit" });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = typeof db | Tx;

export type AuditOutcome = "success" | "failure" | "denied";

export interface AuditActor {
  id?: string | null;
  role?: string | null;
  email?: string | null;
  username?: string | null;
  privyDid?: string | null;
}

export interface AuditEvent {
  action: string;
  outcome: AuditOutcome;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  /** undefined => taken from c.get("user"); null => explicitly anonymous */
  actor?: AuditActor | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "passwordhash",
  "code",
  "pendingtoken",
  "token",
  "authorization",
]);

function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Date) return value.toISOString();
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v, depth + 1),
    ]),
  );
}

// Verify what your proxy actually sets before trusting these for anything
// beyond forensics: the leftmost X-Forwarded-For entry is client-controlled
// unless the proxy overwrites it.
function clientIp(c: Context): string | null {
  return (
    c.req.header("x-real-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/** Attach extra context (before/after values, reason...) to the current request's audit row. */
export function setAuditMeta(c: Context, meta: Record<string, unknown>) {
  c.set("auditMeta", { ...(c.get("auditMeta") ?? {}), ...meta });
}

/**
 * Record an admin action. Always emitted to stdout; also persisted to
 * admin_audit_logs.
 *
 * - Without `tx`: best-effort. A DB failure is logged, never thrown.
 * - With `tx`: written inside the caller's transaction, so the audit row
 *   commits/rolls back atomically with the action. Errors propagate on
 *   purpose (a failed statement aborts a Postgres tx anyway).
 */
export async function audit(
  c: Context,
  event: AuditEvent,
  tx?: DbLike,
): Promise<void> {
  const actor =
    event.actor === undefined
      ? (c.get("user") as AuditActor | undefined)
      : event.actor;

  const row = {
    requestId: (c.get("requestId") as string | undefined) ?? null,
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    actorLabel: actor?.email ?? actor?.username ?? actor?.privyDid ?? null,
    action: event.action,
    outcome: event.outcome,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    ip: clientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    metadata: redact(event.metadata ?? {}) as Record<string, unknown>,
  };

  log[event.outcome === "success" ? "info" : "warn"](`audit ${event.action}`, {
    audit: true,
    ...row,
  });

  const insert = () =>
    (tx ?? (db as DbLike)).insert(adminAuditLogs).values(row);

  if (tx) {
    await insert();
    return;
  }
  try {
    await insert();
  } catch (err) {
    // stdout line above is the fallback record.
    log.error("audit db write failed", { err, action: event.action });
  }
}

/**
 * Wrap a controller so every call is audited with actor, target and outcome —
 * no controller changes needed:
 *
 *   admin.patch("/tasks/:id", withAudit("task.update", updateTask, { targetType: "task", targetParam: "id" }))
 *
 * Outcome comes from the response status (2xx/3xx success, 401/403 denied,
 * else failure). Controllers may call setAuditMeta(c, {...}) to add detail.
 */
export function withAudit(
  action: string,
  handler: (c: Context) => Response | Promise<Response>,
  opts: { targetType?: string; targetParam?: string } = {},
) {
  return async (c: Context) => {
    const started = Date.now();
    const targetId = opts.targetParam
      ? c.req.param(opts.targetParam)
      : undefined;

    let res: Response;
    try {
      res = await handler(c);
    } catch (err) {
      await audit(c, {
        action,
        outcome: "failure",
        targetType: opts.targetType,
        targetId,
        metadata: {
          status: 500,
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
          ...(c.get("auditMeta") ?? {}),
        },
      });
      throw err;
    }

    const s = res.status;
    await audit(c, {
      action,
      outcome:
        s < 400 ? "success" : s === 401 || s === 403 ? "denied" : "failure",
      targetType: opts.targetType,
      targetId,
      metadata: {
        status: s,
        durationMs: Date.now() - started,
        ...(c.get("auditMeta") ?? {}),
      },
    });
    return res;
  };
}

/**
 * Request-level access log for the whole admin router (stdout only).
 * Register BEFORE the auth middleware so 401s are captured too:
 *   admin.use("*", adminRequestLogger, adminAuth)
 * Logs path only (no query string) — search params can contain PII.
 */
export const adminRequestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  const started = Date.now();

  await next();

  const user = c.get("user") as AuditActor | undefined;
  log.info("admin request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - started,
    actorId: user?.id ?? null,
    actorRole: user?.role ?? null,
    ip: clientIp(c),
  });
};
