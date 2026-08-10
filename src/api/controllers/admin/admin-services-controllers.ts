import { Context } from "hono";
import { db } from "@/db";
import {
  authUsers,
  participantProfile,
  submissions,
  pointsLedger,
} from "@/db/schema/rail2";
import { eq, gte, sql } from "drizzle-orm";
import { timeframes } from "@/services/economy/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { telegramMarketingQueue } from "@/services/queues/telegram-marketing.queue";

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export async function getPlatformOverview(c: Context) {
  try {
    const now = new Date();

    const weekMs = 7 * timeframes.dayPeriodMs;
    const twoWeeksMs = 14 * timeframes.dayPeriodMs;
    const monthMs = 30 * timeframes.dayPeriodMs;

    const oneWeekAgo = new Date(now.getTime() - weekMs);
    const twoWeeksAgo = new Date(now.getTime() - twoWeeksMs);
    const thirtyDaysAgo = new Date(now.getTime() - monthMs);

    const oneWeekAgoIso = oneWeekAgo.toISOString();
    const twoWeeksAgoIso = twoWeeksAgo.toISOString();
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    const [memberStats, submissionStats, pendingReview, pointsStats] =
      await Promise.all([
        db
          .select({
            totalMembers: sql<number>`COUNT(*)`.mapWith(Number),
            newThisWeek: sql<number>`
            COUNT(CASE WHEN ${authUsers.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
          })
          .from(participantProfile)
          .innerJoin(authUsers, eq(authUsers.id, participantProfile.userId)),

        db
          .select({
            proofsThisWeek: sql<number>`
            COUNT(CASE WHEN ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            proofsLastWeek: sql<number>`
            COUNT(CASE WHEN ${submissions.createdAt} >= ${twoWeeksAgoIso}
                        AND ${submissions.createdAt} < ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),

            approved30d:
              sql<number>`COUNT(CASE WHEN status = 'approved' THEN 1 END)`.mapWith(
                Number,
              ),
            reviewed30d: sql<number>`
            COUNT(CASE WHEN status IN ('approved', 'rejected') THEN 1 END)
          `.mapWith(Number),

            approvedThisWeek: sql<number>`
            COUNT(CASE WHEN status = 'approved'
                        AND ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            reviewedThisWeek: sql<number>`
            COUNT(CASE WHEN status IN ('approved', 'rejected')
                        AND ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            approvedLastWeek: sql<number>`
            COUNT(CASE WHEN status = 'approved'
                        AND ${submissions.createdAt} >= ${twoWeeksAgoIso}
                        AND ${submissions.createdAt} < ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            reviewedLastWeek: sql<number>`
            COUNT(CASE WHEN status IN ('approved', 'rejected')
                        AND ${submissions.createdAt} >= ${twoWeeksAgoIso}
                        AND ${submissions.createdAt} < ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),

            snapshotApproved: sql<number>`
            COUNT(CASE WHEN status = 'approved'
                        AND ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            snapshotUnderReview: sql<number>`
            COUNT(CASE WHEN status = 'under_review'
                        AND ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
            snapshotRejected: sql<number>`
            COUNT(CASE WHEN status = 'rejected'
                        AND ${submissions.createdAt} >= ${oneWeekAgoIso} THEN 1 END)
          `.mapWith(Number),
          })
          .from(submissions)
          .where(gte(submissions.createdAt, thirtyDaysAgo)),

        db
          .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(submissions)
          .where(eq(submissions.status, "under_review")),

        db
          .select({
            totalPoints:
              sql<number>`COALESCE(SUM(${pointsLedger.basePoints}), 0)`.mapWith(
                Number,
              ),
            pointsThisWeek: sql<number>`
            COALESCE(SUM(CASE WHEN ${pointsLedger.createdAt} >= ${oneWeekAgoIso}
                              THEN ${pointsLedger.basePoints} ELSE 0 END), 0)
          `.mapWith(Number),
            pointsLastWeek: sql<number>`
            COALESCE(SUM(CASE WHEN ${pointsLedger.createdAt} >= ${twoWeeksAgoIso}
                              AND ${pointsLedger.createdAt} < ${oneWeekAgoIso}
                              THEN ${pointsLedger.basePoints} ELSE 0 END), 0)
          `.mapWith(Number),
          })
          .from(pointsLedger),
      ]);

    const m = memberStats[0];
    const s = submissionStats[0];
    const p = pointsStats[0];

    const approvalRate = pct(s?.approved30d ?? 0, s?.reviewed30d ?? 0);
    const rateThisWeek = pct(
      s?.approvedThisWeek ?? 0,
      s?.reviewedThisWeek ?? 0,
    );
    const rateLastWeek = pct(
      s?.approvedLastWeek ?? 0,
      s?.reviewedLastWeek ?? 0,
    );
    const approvalRateChange =
      (s?.reviewedLastWeek ?? 0) > 0 ? rateThisWeek - rateLastWeek : 0;

    const snapshotTotal =
      (s?.snapshotApproved ?? 0) +
      (s?.snapshotUnderReview ?? 0) +
      (s?.snapshotRejected ?? 0);

    return c.json({
      totalMembers: m?.totalMembers ?? 0,
      newMembersThisWeek: m?.newThisWeek ?? 0,

      proofsThisWeek: s?.proofsThisWeek ?? 0,
      proofsChangePercent: pct(
        (s?.proofsThisWeek ?? 0) - (s?.proofsLastWeek ?? 0),
        s?.proofsLastWeek ?? 0,
      ),

      pendingReview: pendingReview[0]?.count ?? 0,

      totalPointsIssued: p?.totalPoints ?? 0,
      pointsThisWeek: p?.pointsThisWeek ?? 0,
      pointsChangePercent: pct(
        (p?.pointsThisWeek ?? 0) - (p?.pointsLastWeek ?? 0),
        p?.pointsLastWeek ?? 0,
      ),

      approvalRate,
      approvalRateChange,

      last7DaysSnapshot: {
        approvedPercent: pct(s?.snapshotApproved ?? 0, snapshotTotal),
        underReviewPercent: pct(s?.snapshotUnderReview ?? 0, snapshotTotal),
        rejectedPercent: pct(s?.snapshotRejected ?? 0, snapshotTotal),
      },
    });
  } catch (error) {
    console.error("Admin.getPlatformOverview.error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function sendTelegramBroadcast(c: Context) {
  const user = c.get("user");

  if (!user || typeof user.id !== "string") {
    return c.json(
      {
        error: "Unauthorized",
      },
      401,
    );
  }

  if (user.role !== "admin") {
    return c.json(
      {
        error: "Forbidden",
      },
      403,
    );
  }

  const body = await c.req.formData();

  const message = body.get("message");
  const file = body.get("file");

  if (!message || typeof message !== "string") {
    return c.json(
      {
        error: "Message is required",
      },
      400,
    );
  }

  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return c.json(
      {
        error: "Message cannot be empty",
      },
      400,
    );
  }

  if (trimmedMessage.length > 1024) {
    return c.json(
      {
        error:
          "Message is too long. Telegram photo captions are limited to 1024 characters.",
      },
      400,
    );
  }

  let imagePath: string | undefined;

  if (file) {
    if (!(file instanceof File)) {
      return c.json(
        {
          error: "Invalid image upload.",
        },
        400,
      );
    }

    if (!file.type.startsWith("image/")) {
      return c.json(
        {
          error: "Uploaded file must be an image.",
        },
        400,
      );
    }

    // 10 MB limit.
    const maxFileSize = 10 * 1024 * 1024;

    if (file.size > maxFileSize) {
      return c.json(
        {
          error: "Image must be smaller than 10 MB.",
        },
        400,
      );
    }

    const uploadDirectory = "/tmp/telegram-marketing";

    await mkdir(uploadDirectory, {
      recursive: true,
    });

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";

    imagePath = join(uploadDirectory, `${randomUUID()}.${extension}`);

    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(imagePath, buffer);
  }

  const job = await telegramMarketingQueue.add("broadcast", {
    message: trimmedMessage,
    imagePath,
    initiatedBy: user.id,
  });

  return c.json(
    {
      message: "Telegram broadcast queued successfully",
      jobId: job.id,
    },
    202,
  );
}
