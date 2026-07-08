import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string(),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  CLIENT_URL: z.string(),
  REDIS_URL: z.string(),
  PRIVY_APP_ID: z.string(),
  PRIVY_APP_SECRET: z.string(),
  TELEGRAM_BOT_TOKEN: z.string(),
});

export default function parseEnv() {
  try {
    envSchema.parse(Bun.env);
  } catch (error) {
    console.error("Invalid Env variables:: ", error);
    process.exit(1);
  }
}

export type EnvSchemaType = z.infer<typeof envSchema>;

declare module "bun" {
  interface Env extends EnvSchemaType {}
}
