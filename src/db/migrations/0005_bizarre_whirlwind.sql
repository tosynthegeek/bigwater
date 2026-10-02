CREATE TYPE "public"."warning_reason" AS ENUM('spam', 'abusive_behavior', 'low_quality_submissions', 'policy_violation', 'other');--> statement-breakpoint
CREATE TABLE "participant_warnings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"participant_id" varchar NOT NULL,
	"reason" "warning_reason" NOT NULL,
	"note" text,
	"issued_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_profile" ADD COLUMN "warning_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_warnings" ADD CONSTRAINT "participant_warnings_participant_id_participant_profile_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_warnings" ADD CONSTRAINT "participant_warnings_issued_by_auth_accounts_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."auth_accounts"("id") ON DELETE set null ON UPDATE no action;