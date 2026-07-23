// rail1/src/db/schema/users.ts — owned by rail1
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const rail1Users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull().unique(),
  totalPoints: integer("total_points").notNull().default(0),
  firstName: varchar("first_name", { length: 120 }),
  lastName: varchar("last_name", { length: 120 }),
  email: varchar("email", { length: 320 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  phone: varchar("phone", { length: 32 }),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  addressCity: varchar("address_city", { length: 120 }),
  addressPostalCode: varchar("address_postal_code", { length: 32 }),
  addressCountry: varchar("address_country", { length: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
