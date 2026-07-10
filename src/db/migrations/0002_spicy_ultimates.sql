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
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "sustainability_score" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"head_start" integer DEFAULT 0 NOT NULL,
	"last_banked_month" varchar,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "participant_profile" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_tally" ADD CONSTRAINT "monthly_tally_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sustainability_score" ADD CONSTRAINT "sustainability_score_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_profile" DROP COLUMN "sustainability_score";--> statement-breakpoint
ALTER TABLE "participant_profile" DROP COLUMN "monthly_tally";--> statement-breakpoint
ALTER TABLE "participant_profile" DROP COLUMN "streak_count";--> statement-breakpoint
ALTER TABLE "participant_profile" DROP COLUMN "last_streak_day";