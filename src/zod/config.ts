import { z } from "zod";

export const updateSubmissionLimitsSchema = z.object({
  cooldownHours: z.number().int().positive().optional(),
  maxSubmissionsPerDay: z.number().int().positive().optional(),
  maxHighValuePerDay: z.number().int().positive().optional(),
  monthlyTallyCap: z.number().int().positive().optional(),
  streakEnabled: z.boolean().optional(),
});

export const updateBandSchema = z.object({
  name: z.string().min(1).optional(),
  minPoints: z.number().int().min(0).optional(),
  maxPoints: z.number().int().min(0).optional(),
  multiplier: z.number().int().positive().optional(),
  order: z.number().int().min(0).optional(),
});
