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
  AWS_BUCKET_NAME: z.string(),
  AWS_BUCKET_REGION: z.string(),
  AWS_ACCESS_KEY: z.string(),
  AWS_ACCESS_SECRET: z.string(),
  AWS_CLOUDFRONT_URL: z.string(),
  AI_SERVICE_API_KEY: z.string(),
  // Optional / operational
  // Custom S3 endpoint for an S3-compatible store (MinIO/R2/Supabase/B2).
  // Unset = real AWS S3. See src/s3-client.ts.
  AWS_S3_ENDPOINT: z.string().optional(),
  // Storage driver: "s3" (default) or "local" (write to UPLOAD_DIR, serve via
  // GET /uploads). For local, PUBLIC_BASE_URL must be the API's public origin.
  STORAGE_DRIVER: z.enum(["s3", "local"]).optional(),
  UPLOAD_DIR: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  // Run the Telegram bot in the API process (single-service deploys). See index.ts.
  RUN_BOT_IN_PROCESS: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  // Comma-separated Privy DIDs granted the admin role on seed (src/db/seed/admins.ts).
  // Without at least one, the admin panel has no admin to log in as.
  ADMIN_PRIVY_DIDS: z.string().optional(),
  // Demo-only: route new submissions straight to "under_review" (see
  // services/submissions/submissions.ts) so the review->approve loop is
  // demoable without the external AI verification service. Leave unset in prod.
  DEMO_AUTO_REVIEW: z.string().optional(),

  RAIL1_JWT_SECRET: z.string(),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODEL: z.string().default("qwen/qwen3.6-flash"),
  SIGHTENGINE_USER: z.string(),
  SIGHTENGINE_SECRET: z.string(),

  ADMIN_SESSION_SECRET: z.string(),

  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
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
