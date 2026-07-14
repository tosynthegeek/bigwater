import z from "zod";
import { submissionFileSchema } from "./file";

export const submissionSchema = z.object({
  taskIdOrCustom: z
    .string()
    .nonempty({ message: "Task ID or custom identifier is required." }),
  file: submissionFileSchema,
  source: z.string().optional(),
});

export const updateCustomSubmissionSchema = z.object({
  newTaskId: z.string().min(1, { message: "Task ID is required." }),
  basePoints: z
    .number()
    .min(0, { message: "Base points must be a non-negative number." }),
});

export const updateSubmissionAiConfidenceSchema = z.object({
  aiConfidence: z
    .number()
    .int()
    .min(0, "aiConfidence must be at least 0")
    .max(100, "aiConfidence cannot exceed 100"),

  aiVerdict: z
    .string()
    .trim()
    .min(1, "aiVerdict is required")
    .max(1000, "aiVerdict cannot exceed 1000 characters"),
});
