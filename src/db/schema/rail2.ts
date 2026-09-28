import {
  pgTable,
  pgEnum,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  unique,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { nanoid } from "@/utils/nanoid";
import { email } from "zod";

export type ParticipantProfile = typeof participantProfile.$inferSelect;
export type User = typeof authUsers.$inferSelect & {
  participantProfile?: ParticipantProfile;
};

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
export const warningReason = pgEnum("warning_reason", [
  "spam",
  "abusive_behavior",
  "low_quality_submissions",
  "policy_violation",
  "other",
]);

export const authUsers = pgTable("auth_accounts", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  privyDid: text("privy_did").unique(),
  role: userRole("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  email: text("email").unique(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  walletAddress: text("wallet_address").unique(),
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
    .references(() => authUsers.id, { onDelete: "cascade" }),
  rail1UserId: uuid("rail1_user_id").unique().notNull(),
  username: text("username"),
  telegramId: text("telegram_id").unique(),
  isMember: boolean("is_member").notNull().default(false),
  isFlagged: boolean("is_flagged").notNull().default(false),
  warningCount: integer("warning_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const participantWarnings = pgTable("participant_warnings", {
  id: varchar("id").primaryKey().$defaultFn(nanoid),
  participantId: varchar("participant_id")
    .notNull()
    .references(() => participantProfile.id, { onDelete: "cascade" }),
  reason: warningReason("reason").notNull(),
  note: text("note"),
  issuedBy: varchar("issued_by").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
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
    .references(() => authUsers.id, { onDelete: "cascade" }),
  taskId: varchar("task_id")
    .references(() => tasks.id, {
      onDelete: "set null",
    })
    .notNull(),
  source: submissionSource("source").notNull(),
  status: submissionStatus("status").notNull().default("pending"),
  imageUrl: text("image_url"),
  aiConfidence: integer("ai_confidence"),
  aiVerdict: text("ai_verdict"),
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

export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: varchar("id").primaryKey().$defaultFn(nanoid),
    userId: varchar("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    submissionId: varchar("submission_id").references(() => submissions.id, {
      onDelete: "set null",
    }),
    basePoints: integer("base_points").notNull(),
    month: varchar("month").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("points_ledger_created_at_idx").on(table.createdAt)],
);

export const sustainabilityScore = pgTable("sustainability_score", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => authUsers.id, {
      onDelete: "cascade",
    }),
  totalScore: integer("total_score").notNull().default(0),
  headStart: integer("head_start").notNull().default(0),
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
      .references(() => authUsers.id, { onDelete: "cascade" }),
    month: varchar("month").notNull(),
    baseTally: integer("base_tally").notNull().default(0),
    band: text("band").notNull().default("seedling"),
    multiplier: integer("multiplier").notNull().default(50),
    streakBonus: integer("streak_bonus").notNull().default(0),
    bankedAmount: integer("banked_amount").notNull().default(0),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
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
    .references(() => authUsers.id, {
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

export const scoreHistory = pgTable(
  "score_history",
  {
    id: varchar("id").primaryKey().$defaultFn(nanoid),
    userId: varchar("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    month: varchar("month").notNull(),
    tally: integer("tally").notNull(),
    band: text("band").notNull(),
    multiplier: integer("multiplier").notNull(),
    streakBonusPercent: integer("streak_bonus_percent").notNull().default(0),
    startingScore: integer("starting_score").notNull(),
    bankedAmount: integer("banked_amount").notNull(),
    resultingScore: integer("resulting_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("score_history_user_id_month_unique").on(table.userId, table.month),
  ],
);

export const telegramLinkCodes = pgTable("telegram_link_codes", {
  code: text("code").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
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

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestId: text("request_id"),
    actorId: text("actor_id"), // null for unauthenticated attempts (failed login)
    actorRole: text("actor_role"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(), // e.g. "task.update", "auth.login.failed"
    outcome: text("outcome").notNull(), // "success" | "failure" | "denied"
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => ({
    actorIdx: index("admin_audit_actor_idx").on(t.actorId, t.createdAt),
    targetIdx: index("admin_audit_target_idx").on(t.targetType, t.targetId),
    actionIdx: index("admin_audit_action_idx").on(t.action, t.createdAt),
  }),
);
