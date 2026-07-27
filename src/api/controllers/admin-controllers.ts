import { Context } from "hono";
import { db } from "@/db";
import {
  authUsers,
  participantProfile,
  submissions,
  pointsLedger,
  type User,
} from "@/db/schema/rail2";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { subDays } from "date-fns";
import { addAdminBodySchema, revokeAdminSchema } from "@/zod/admin";
import { email } from "zod";

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export async function getPlatformOverview(c: Context) {
  try {
    const now = new Date();
    const oneWeekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);
    const thirtyDaysAgo = subDays(now, 30);

    // Raw `sql` template literals hand their interpolated values straight to
    // the postgres driver's parameter binder, which (unlike Drizzle's own
    // gte()/eq() helpers used below) doesn't run them through Drizzle's
    // Date-aware type mapping — it expects a string/Buffer and throws
    // ("Received an instance of Date") if handed a raw Date. Stringify once
    // here rather than at each call site.
    const oneWeekAgoIso = oneWeekAgo.toISOString();
    const twoWeeksAgoIso = twoWeeksAgo.toISOString();

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

export async function adminLogin(c: Context) {
  const user = c.get("user") as User;

  if (!user || (user.role != "superadmin" && user.role != "admin")) {
    return c.json({ error: "Unauthorized access" }, 401);
  }

  try {
    const [admin] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, user.id));

    if (!admin || (admin.role !== "admin" && admin.role !== "superadmin")) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    return c.json({ admin }, 200);
  } catch (error) {
    console.error("AdminControllers.adminLogin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getAllAdmins(c: Context) {
  try {
    const admins = await db
      .select({
        id: authUsers.id,
        privyDid: authUsers.privyDid,
        role: authUsers.role,
        email: authUsers.email,
        wallet: authUsers.walletAddress,
        status: authUsers.status,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .where(inArray(authUsers.role, ["admin", "superadmin"]))
      .orderBy(desc(authUsers.createdAt));

    return c.json({ admins });
  } catch (error) {
    console.error("AdminControllers.getAllAdmins.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function addAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();

  const validatedBody = addAdminBodySchema.safeParse(body);
  if (!validatedBody.success) {
    return c.json(
      {
        error: "Invalid request body",
        details: validatedBody.error.issues,
      },
      400,
    );
  }

  const { identifier } = validatedBody.data;

  try {
    const [created] = await db
      .insert(authUsers)
      .values({
        privyDid: identifier,
        role: "admin",
      })
      .returning();

    return c.json({ admin: created }, 201);
  } catch (error) {
    console.error("AdminControllers.addAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function revokeAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (user.role != "superadmin") {
    return c.json({ error: "Not authorized" }, 403);
  }

  const body = await c.req.json();
  const parsed = revokeAdminSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request body", details: parsed.error.issues },
      400,
    );
  }

  if (parsed.data.id === user.id) {
    return c.json({ error: "Cannot revoke your own admin access" }, 400);
  }

  try {
    const [revoked] = await db
      .update(authUsers)
      .set({
        role: "user",
        status: "inactive",
      })
      .where(eq(authUsers.id, parsed.data.id))
      .returning();

    if (!revoked) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ revoked }, 200);
  } catch (error) {
    console.error("AdminControllers.revokeAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getAdmin(c: Context) {
  const user = c.get("user") as User;

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!user || (user.role != "superadmin" && user.role != "admin")) {
    return c.json({ error: "Unauthorized access" }, 401);
  }

  try {
    const [admin] = await db
      .select()
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, user.id),
          or(eq(authUsers.role, "admin"), eq(authUsers.role, "superadmin")),
        ),
      );

    if (!admin) {
      return c.json({ error: "Admin not found" }, 404);
    }

    return c.json({ admin }, 200);
  } catch (error) {
    console.error("AdminControllers.getAdmin.error: ", error);
    return c.json({ error: "Internal server error" }, 500);
  }
}
