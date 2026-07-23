CREATE TYPE "public"."submission_source" AS ENUM('web', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'under_review');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'superadmin');--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"privy_did" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_accounts_privy_did_unique" UNIQUE("privy_did")
);
--> statement-breakpoint
CREATE TABLE "bands" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_points" integer NOT NULL,
	"max_points" integer NOT NULL,
	"multiplier" integer NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_tally" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"month" varchar NOT NULL,
	"base_tally" integer DEFAULT 0 NOT NULL,
	"band" text DEFAULT 'seedling' NOT NULL,
	"multiplier" integer DEFAULT 50 NOT NULL,
	"streak_bonus" integer DEFAULT 0 NOT NULL,
	"banked_amount" integer DEFAULT 0 NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_tally_user_id_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "participant_profile" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"rail1_user_id" uuid,
	"username" text,
	"telegram_id" text,
	"is_member" boolean DEFAULT false NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"wallet_address" varchar(42),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "participant_profile_rail1_user_id_unique" UNIQUE("rail1_user_id"),
	CONSTRAINT "participant_profile_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"submission_id" varchar,
	"base_points" integer NOT NULL,
	"month" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_history" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"month" varchar NOT NULL,
	"tally" integer NOT NULL,
	"band" text NOT NULL,
	"multiplier" integer NOT NULL,
	"streak_bonus_percent" integer DEFAULT 0 NOT NULL,
	"starting_score" integer NOT NULL,
	"banked_amount" integer NOT NULL,
	"resulting_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_history_user_id_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "streak_bonuses" (
	"id" varchar PRIMARY KEY NOT NULL,
	"streak_days" integer NOT NULL,
	"bonus_percent" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_bonuses_streak_days_unique" UNIQUE("streak_days")
);
--> statement-breakpoint
CREATE TABLE "submission_limits" (
	"id" varchar PRIMARY KEY NOT NULL,
	"cooldown_hours" integer DEFAULT 6 NOT NULL,
	"max_submissions_per_day" integer DEFAULT 4 NOT NULL,
	"max_high_value_per_day" integer DEFAULT 1 NOT NULL,
	"monthly_tally_cap" integer DEFAULT 1000 NOT NULL,
	"streak_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"task_id" varchar NOT NULL,
	"source" "submission_source" NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"image_url" text,
	"ai_confidence" integer,
	"ai_verdict" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sustainability_score" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"head_start" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"base_points" integer DEFAULT 0 NOT NULL,
	"is_high_value" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_tally" ADD CONSTRAINT "monthly_tally_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_profile" ADD CONSTRAINT "participant_profile_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sustainability_score" ADD CONSTRAINT "sustainability_score_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_auth_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "points_ledger_created_at_idx" ON "points_ledger" USING btree ("created_at");