import {
  pgTable,
  pgEnum,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "@/utils/nanoid";

export const userRole = pgEnum("user_role", ["user", "admin", "superadmin"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  privyDid: text("privy_did").notNull().unique(),
  displayName: text("display_name"),
  role: userRole("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participantProfile = pgTable("participant_profile", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  telegramId: text("telegram_id").unique(),
  isMember: boolean("is_member").notNull().default(false),
  sustainabilityScore: integer("sustainability_score").notNull().default(0),
  monthlyTally: integer("monthly_tally").notNull().default(0),
  currentBand: text("current_band").notNull().default("seedling"),
  streakCount: integer("streak_count").notNull().default(0),
  lastStreakDay: timestamp("last_streak_day", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const telegramLinkCodes = pgTable("telegram_link_codes", {
  code: text("code").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
