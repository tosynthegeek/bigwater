import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as tables from "@/db/schema/rail2";
import * as relations from "@/db/schema/relations";

const client = postgres(Bun.env.DATABASE_URL, {
  debug: Bun.env.NODE_ENV !== "production",
  // The sweep/rollover workers only touch the DB every minute or few minutes,
  // so a pooled connection can sit idle long enough for Railway's Postgres or
  // proxy to drop it; the next query then fails on a dead socket. Recycle
  // idle connections before that happens, cap connection age, and fail fast
  // (instead of hanging) when a new connection can't be established.
  // All values are in seconds.
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema: { ...tables, ...relations } });
