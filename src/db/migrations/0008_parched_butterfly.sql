CREATE TABLE "scheduled_task_selections" (
	"id" varchar PRIMARY KEY NOT NULL,
	"day_index" integer NOT NULL,
	"task_id" varchar NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_task_selection_day_task_unique" UNIQUE("day_index","task_id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_task_selections" ADD CONSTRAINT "scheduled_task_selections_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_selections" ADD CONSTRAINT "scheduled_task_selections_created_by_auth_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_task_selection_day_idx" ON "scheduled_task_selections" USING btree ("day_index");