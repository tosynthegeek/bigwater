import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tables from "@/db/schema/rail2";
import * as relations from "@/db/schema/relations";

const client = postgres(Bun.env.DATABASE_URL, {
  debug: Bun.env.NODE_ENV !== "production",
});

export const db = drizzle(client, { schema: { ...tables, ...relations } });
