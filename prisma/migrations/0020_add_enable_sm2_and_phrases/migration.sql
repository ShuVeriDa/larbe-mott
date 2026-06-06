-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "enableSm2" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "enablePhrases" BOOLEAN NOT NULL DEFAULT true;
