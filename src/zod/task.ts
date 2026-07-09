import z from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required."),
  basePoints: z.number().int().nonnegative(),
  isHighValue: z.boolean().optional(),
  active: z.boolean().optional(),
});
