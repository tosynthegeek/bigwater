ALTER TABLE "auth_accounts" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_wallet_address_unique" UNIQUE("wallet_address");