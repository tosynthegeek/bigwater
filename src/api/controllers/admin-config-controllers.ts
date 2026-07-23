import type { Context } from "hono";

import { db } from "@/db";
import { bands, submissionLimits } from "@/db/schema/rail2";
import { updateBandSchema, updateSubmissionLimitsSchema } from "@/zod/config";
import { asc, eq } from "drizzle-orm";

export async function getSubmissionLimits(c: Context) {
  try {
    const limits = await db.query.submissionLimits.findFirst();

    if (!limits) {
      return c.json({ error: "Submission limits not initialized" }, 404);
    }

    return c.json({ submissionLimits: limits });
  } catch (error) {
    console.error("Admin.Controllers.getSubmissionLimits.error:", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function updateSubmissionLimits(c: Context) {
  try {
    const body = await c.req.json();

    const validated = updateSubmissionLimitsSchema.safeParse(body);

    if (!validated.success) {
      return c.json({ error: validated.error.issues }, 400);
    }

    const limits = await db.query.submissionLimits.findFirst();

    if (!limits) {
      return c.json({ error: "Submission limits not initialized" }, 404);
    }

    const [updated] = await db
      .update(submissionLimits)
      .set({
        ...validated.data,
        updatedAt: new Date(),
      })
      .where(eq(submissionLimits.id, limits.id))
      .returning();

    return c.json({
      submissionLimits: updated,
    });
  } catch (error) {
    console.error("Admin.Controllers.updateSubmissionLimits.error:", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function getBands(c: Context) {
  const user = c.get("user");
  if (!user || typeof user.id !== "string") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const band = await db.select().from(bands).orderBy(asc(bands.order));

    return c.json({ bands: band }, 200);
  } catch (error) {
    console.error("Admin.Controllers.getBands.error: ", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}

export async function updateBand(c: Context) {
  const bandId = c.req.param("id");

  if (!bandId) {
    return c.json({ error: "Band ID is required" }, 400);
  }

  try {
    const body = await c.req.json();

    const validated = updateBandSchema.safeParse(body);

    if (!validated.success) {
      return c.json({ error: validated.error.issues }, 400);
    }

    const band = await db.query.bands.findFirst({
      where: eq(bands.id, bandId),
    });

    if (!band) {
      return c.json({ error: "Band not found" }, 404);
    }

    const [updated] = await db
      .update(bands)
      .set(validated.data)
      .where(eq(bands.id, bandId))
      .returning();

    return c.json({
      band: updated,
    });
  } catch (error) {
    console.error("Admin.Controllers.updateBand.error:", error);

    return c.json({ error: "Internal server error" }, 500);
  }
}
