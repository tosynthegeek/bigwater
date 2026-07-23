import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "src/db/migrations",
  schema: "src/db/schema/rail2.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  breakpoints: true,
});
