-- AlterTable
ALTER TABLE "spelling_entries" ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'CHE';

-- CreateIndex
CREATE INDEX "spelling_entries_language_idx" ON "spelling_entries"("language");
