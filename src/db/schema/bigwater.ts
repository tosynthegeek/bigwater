import {
  pgTable,
  pgEnum,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  unique,
} from "drizzle-orm/pg-core";
import { nanoid } from "@/utils/nanoid";

export const userRole = pgEnum("user_role", ["user", "admin", "superadmin"]);
export const submissionStatus = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "under_review",
]);
export const submissionSource = pgEnum("submission_source", [
  "web",
  "telegram",
]);

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
  currentBand: text("current_band").notNull().default("seedling"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  basePoints: integer("base_points").notNull().default(0),
  isHighValue: boolean("is_high_value").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: varchar("task_id").references(() => tasks.id, {
    onDelete: "set null",
  }),
  source: submissionSource("source").notNull(),
  status: submissionStatus("status").notNull().default("pending"),
  imageUrl: text("image_url"),
  basePoints: integer("base_points").notNull().default(0),
  aiConfidence: integer("ai_confidence"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const submissionLimits = pgTable("submission_limits", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),

  cooldownHours: integer("cooldown_hours").notNull().default(6),

  maxSubmissionsPerDay: integer("max_submissions_per_day").notNull().default(4),

  maxHighValuePerDay: integer("max_high_value_per_day").notNull().default(1),

  monthlyTallyCap: integer("monthly_tally_cap").notNull().default(1000),

  streakEnabled: boolean("streak_enabled").notNull().default(true),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const pointsLedger = pgTable("points_ledger", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  submissionId: varchar("submission_id").references(() => submissions.id, {
    onDelete: "set null",
  }),
  basePoints: integer("base_points").notNull(),
  month: varchar("month").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sustainabilityScore = pgTable("sustainability_score", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  totalScore: integer("total_score").notNull().default(0),

  headStart: integer("head_start").notNull().default(0),

  lastBankedMonth: varchar("last_banked_month"),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const monthlyTally = pgTable(
  "monthly_tally",
  {
    id: varchar("id").primaryKey().$defaultFn(nanoid),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: varchar("month").notNull(),
    baseTally: integer("base_tally").notNull().default(0),
    band: text("band").notNull().default("seedling"),
    multiplier: integer("multiplier").notNull().default(50),
    streakBonus: integer("streak_bonus").notNull().default(0),
    bankedAmount: integer("banked_amount").notNull().default(0),
    isFinalized: boolean("is_finalized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // processApprovedSubmission's insert().onConflictDoUpdate() upserts
    // one row per user per month — needs this to exist as a real DB
    // constraint, not just an assumption in the query.
    unique("monthly_tally_user_id_month_unique").on(table.userId, table.month),
  ],
);

export const userStreaks = pgTable("user_streaks", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  currentStreak: integer("current_streak").notNull().default(0),

  longestStreak: integer("longest_streak").notNull().default(0),

  lastActivityDate: timestamp("last_activity_date", {
    withTimezone: true,
  }),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
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

export const streakBonuses = pgTable("streak_bonuses", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),

  streakDays: integer("streak_days").notNull().unique(),

  bonusPercent: integer("bonus_percent").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const bands = pgTable("bands", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),

  name: text("name").notNull(),

  minPoints: integer("min_points").notNull(),

  maxPoints: integer("max_points").notNull(),

  multiplier: integer("multiplier").notNull(),

  order: integer("order").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});
