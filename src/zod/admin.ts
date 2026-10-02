import { z } from "zod";
import { warningReason } from "@/db/schema/rail2";

const walletAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Not a valid EVM wallet address")
  .transform((v) => v.toLowerCase());

const identifierSchema = z.object({
  email: z.email("Not a valid email").transform((v) => v.toLowerCase()),
});

export const addAdminBodySchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("privy"),
    identifier: identifierSchema,
  }),
  z.object({
    method: z.literal("password"),
    email: z.email(),
    username: z.string().min(3).max(32),
    password: z.string().min(12),
  }),
]);

export const updateOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

export const resetAdminPasswordSchema = z.object({
  newPassword: z.string().min(12),
});

export const revokeAdminSchema = z.object({
  id: z.string(),
});

export const warnParticipantBodySchema = z.object({
  reason: z.enum(warningReason.enumValues),
  note: z.string().trim().min(1).max(500),
});

export function parseIdentifier(identifier: string) {
  const result = identifierSchema.safeParse(identifier);
  if (!result.success) {
    throw new Error(`Invalid identifier: ${identifier}`);
  }
  return result.data;
}
