import { z } from "zod";

const walletAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Not a valid EVM wallet address")
  .transform((v) => v.toLowerCase());

const emailSchema = z
  .email("Not a valid email")
  .transform((v) => v.toLowerCase());

const identifierSchema = z.union([
  emailSchema.transform((email) => ({
    email,
    walletAddress: undefined as string | undefined,
  })),
  walletAddressSchema.transform((walletAddress) => ({
    email: undefined as string | undefined,
    walletAddress,
  })),
]);

export const addAdminBodySchema = z.object({
  identifier: z.string().min(1, "identifier is required"),
});

export const revokeAdminSchema = z.object({
  id: z.string(),
});
