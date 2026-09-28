import { Resend } from "resend";
import type { Worker } from "bullmq";
import redisClient from "@/redis";
import { logger } from "@/services/logger/logger";

const log = logger.child({ source: "alerts" });

const resend = Bun.env.RESEND_API_KEY
  ? new Resend(Bun.env.RESEND_API_KEY)
  : null;

const ALERT_FROM = Bun.env.ALERT_EMAIL_FROM ?? "alerts@bigwater.dev";
const ALERT_TO = (Bun.env.ALERT_EMAIL_TO ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// How long to suppress a repeat of the *same* alert (same source+message)
// before sending it again. Retries and job re-runs would otherwise fire the
// same email dozens of times in a few minutes.
const DEDUP_WINDOW_SECONDS = 10 * 60;

export type CriticalAlert = {
  // Short machine-readable origin, e.g. "worker:banking", "worker:evaluation",
  // "process:uncaughtException", "health:db".
  source: string;
  // One-line human summary, e.g. "banking job failed after all retries".
  message: string;
  // The Error, if any — stack trace is included in the email body.
  error?: unknown;
  // Extra structured context (job id, userId, month, etc.) shown as a table.
  meta?: Record<string, unknown>;
};

function dedupKey(alert: CriticalAlert): string {
  return `alert:dedup:${alert.source}:${alert.message}`;
}

function errorToText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function renderHtml(alert: CriticalAlert): string {
  const metaRows = Object.entries(alert.meta ?? {})
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 8px;color:#666">${k}</td><td style="padding:2px 8px"><code>${escapeHtml(
          String(v),
        )}</code></td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:monospace;font-size:14px">
      <p><strong>${escapeHtml(alert.source)}</strong> — ${escapeHtml(alert.message)}</p>
      ${metaRows ? `<table>${metaRows}</table>` : ""}
      ${
        alert.error
          ? `<pre style="background:#f4f4f4;padding:12px;overflow-x:auto">${escapeHtml(
              errorToText(alert.error),
            )}</pre>`
          : ""
      }
      <p style="color:#999;font-size:12px">env=${Bun.env.NODE_ENV} • ${new Date().toISOString()}</p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fire-and-forget critical alert email. Never throws — a broken alert path
 * must not take down the worker/request that called it. Deduplicates
 * identical (source, message) pairs within DEDUP_WINDOW_SECONDS so a
 * failing job's retries don't produce an inbox flood.
 */
export async function sendCriticalAlert(alert: CriticalAlert): Promise<void> {
  try {
    // Always log regardless of whether email is configured/dedup'd.
    log.error(alert.message, {
      source: alert.source,
      err: alert.error,
      ...alert.meta,
    });

    if (!resend || ALERT_TO.length === 0) {
      if (Bun.env.NODE_ENV === "production") {
        log.warn(
          "RESEND_API_KEY / ALERT_EMAIL_TO not set — alert not emailed",
          {
            source: alert.source,
          },
        );
      }
      return;
    }

    // SET key value NX EX seconds -> null if the key already exists, i.e.
    // this exact alert already fired within the window.
    const key = dedupKey(alert);
    const firstOccurrence = await redisClient.set(
      key,
      "1",
      "EX",
      DEDUP_WINDOW_SECONDS,
      "NX",
    );
    if (firstOccurrence === null) return;

    const { error } = await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `🚨 [BigWater/${Bun.env.NODE_ENV}] ${alert.source}: ${alert.message}`,
      html: renderHtml(alert),
    });

    if (error) {
      log.error("Resend send failed", { source: alert.source, err: error });
    }
  } catch (err) {
    // Swallow — alerting must never be the thing that crashes a worker.
    log.error("failed to send critical alert", { source: alert.source, err });
  }
}

/**
 * Wires a BullMQ worker's "failed" (all retries exhausted) and "error"
 * (connection/internal) events to sendCriticalAlert, on top of whatever
 * console logging the worker already does.
 *
 * Usage, at the bottom of a worker file:
 *   wireWorkerAlerts(bankingWorker, "worker:banking");
 */
export function wireWorkerAlerts(
  worker: Worker<any, any, any>,
  source: string,
) {
  worker.on("failed", (job, err) => {
    // job.attemptsMade/opts.attempts let us only alert once the job has
    // actually exhausted its retries, not on every intermediate attempt.
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) return;

    void sendCriticalAlert({
      source,
      message: `job ${job?.id ?? "?"} failed after ${attemptsMade} attempt(s)`,
      error: err,
      meta: { jobId: job?.id, jobName: job?.name, data: job?.data },
    });
  });

  worker.on("error", (err) => {
    void sendCriticalAlert({
      source,
      message: "worker-level error (connection/internal)",
      error: err,
    });
  });
}

export async function sendRedeployAlert(): Promise<void> {
  if (Bun.env.ALERT_ON_REDEPLOY !== "true") return;

  try {
    if (!resend || ALERT_TO.length === 0) {
      log.warn("Resend not configured — deployment alert not sent");
      return;
    }

    const environment = Bun.env.NODE_ENV ?? "development";

    await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `🚀 [BigWater/${environment}] Deployment successful`,
      html: `
        <div style="font-family: sans-serif">
          <h2>🚀 BigWater deployment</h2>

          <p>
            A new BigWater deployment has started successfully.
          </p>

          <table style="border-collapse: collapse">

            <tr>
              <td style="padding: 4px 12px 4px 0; color: #666">
                Environment
              </td>
              <td>${escapeHtml(environment)}</td>
            </tr>
          </table>

          <p style="color: #999; font-size: 12px">
            ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    log.info("deployment alert sent", {
      environment,
    });
  } catch (err) {
    log.error("failed to send deployment alert", { err });
  }
}
