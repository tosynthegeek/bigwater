import { defineConfig } from "drizzle-kit";

// This file is used to configure the Drizzle ORM CLI. You can learn more about the available options in the documentation: https://orm.drizzle.team/docs/cli/configuration
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
