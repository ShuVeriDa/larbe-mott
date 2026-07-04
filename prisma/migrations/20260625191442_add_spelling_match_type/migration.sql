-- CreateEnum
CREATE TYPE "spelling_match_type" AS ENUM ('substring', 'whole_word', 'prefix', 'suffix');

-- AlterTable
ALTER TABLE "spelling_entries"
  ADD COLUMN "correctForms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "matchType" "spelling_match_type" NOT NULL DEFAULT 'substring';
