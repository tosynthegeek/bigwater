ALTER TABLE "submissions" ALTER COLUMN "task_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "score_history" ADD COLUMN "starting_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "participant_profile" DROP COLUMN "current_band";--> statement-breakpoint
ALTER TABLE "submissions" DROP COLUMN "base_points";--> statement-breakpoint
ALTER TABLE "sustainability_score" DROP COLUMN "last_banked_month";