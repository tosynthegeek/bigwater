CREATE TABLE "admin_rail2_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text,
	"actor_id" text,
	"actor_role" text,
	"actor_label" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX "admin_audit_actor_idx" ON "admin_rail2_audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_rail2_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_audit_action_idx" ON "admin_rail2_audit_logs" USING btree ("action","created_at");