import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema/rail2";

const client = postgres(Bun.env.DATABASE_URL, {
  debug: Bun.env.NODE_ENV !== "production",
});

export const db = drizzle(client, { schema });
