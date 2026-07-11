-- AlterTable
ALTER TABLE "user_text_progress" ADD COLUMN "readConfirmedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "user_text_progress_textId_readConfirmedAt_idx" ON "user_text_progress"("textId", "readConfirmedAt");
