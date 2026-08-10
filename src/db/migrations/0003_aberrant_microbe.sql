ALTER TABLE "auth_accounts" ALTER COLUMN "privy_did" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_username_unique" UNIQUE("username");