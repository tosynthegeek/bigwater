CREATE TABLE "score_history" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"month" varchar NOT NULL,
	"tally" integer NOT NULL,
	"band" text NOT NULL,
	"multiplier" integer NOT NULL,
	"streak_bonus_percent" integer DEFAULT 0 NOT NULL,
	"banked_amount" integer NOT NULL,
	"resulting_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_history_user_id_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "monthly_tally" ADD COLUMN "period_end" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_profile" ADD COLUMN "is_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;