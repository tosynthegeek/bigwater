import { Context } from "hono";
import { db } from "@/db";
import {
  authUsers,
  participantProfile,
  submissions,
  pointsLedger,
  type User,
} from "@/db/schema/rail2";
import { eq, gte, sql } from "drizzle-orm";
import { subDays } from "date-fns";

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export async function getPlatformOverview(c: Context) {
  try {
    const now = new Date();
    const oneWeekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);
    const thirtyDaysAgo = subDays(now, 30);

    const [memberStats, submissionStats, pendingReview, pointsStats] =
      await Promise.all([
        db
          .select({
            totalMembers: sql<number>`COUNT(*)`.mapWith(Number),
            newThisWeek: sql<number>`
            COUNT(CASE WHEN ${authUsers.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
          })
          .from(participantProfile)
          .innerJoin(authUsers, eq(authUsers.id, participantProfile.userId)),

        db
          .select({
            proofsThisWeek: sql<number>`
            COUNT(CASE WHEN ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            proofsLastWeek: sql<number>`
            COUNT(CASE WHEN ${submissions.createdAt} >= ${twoWeeksAgo}
                        AND ${submissions.createdAt} < ${oneWeekAgo} THEN 1 END)
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
                        AND ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            reviewedThisWeek: sql<number>`
            COUNT(CASE WHEN status IN ('approved', 'rejected')
                        AND ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            approvedLastWeek: sql<number>`
            COUNT(CASE WHEN status = 'approved'
                        AND ${submissions.createdAt} >= ${twoWeeksAgo}
                        AND ${submissions.createdAt} < ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            reviewedLastWeek: sql<number>`
            COUNT(CASE WHEN status IN ('approved', 'rejected')
                        AND ${submissions.createdAt} >= ${twoWeeksAgo}
                        AND ${submissions.createdAt} < ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),

            snapshotApproved: sql<number>`
            COUNT(CASE WHEN status = 'approved'
                        AND ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            snapshotUnderReview: sql<number>`
            COUNT(CASE WHEN status = 'under_review'
                        AND ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
          `.mapWith(Number),
            snapshotRejected: sql<number>`
            COUNT(CASE WHEN status = 'rejected'
                        AND ${submissions.createdAt} >= ${oneWeekAgo} THEN 1 END)
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
            COALESCE(SUM(CASE WHEN ${pointsLedger.createdAt} >= ${oneWeekAgo}
                              THEN ${pointsLedger.basePoints} ELSE 0 END), 0)
          `.mapWith(Number),
            pointsLastWeek: sql<number>`
            COALESCE(SUM(CASE WHEN ${pointsLedger.createdAt} >= ${twoWeeksAgo}
                              AND ${pointsLedger.createdAt} < ${oneWeekAgo}
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

export async function adminLogin(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const [admin] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, user.id));

    if (!admin || admin?.role != "admin") {
      return c.json({ error: "Unauthorized" }, 404);
    }

    return c.json({ admin }, 200);
  } catch (error) {
    console.error("Controllers.participants-controllers.login.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
