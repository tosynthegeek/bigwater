-- Drop wallet_address column safely
ALTER TABLE "participant_profile" 
DROP COLUMN IF EXISTS "wallet_address" CASCADE;