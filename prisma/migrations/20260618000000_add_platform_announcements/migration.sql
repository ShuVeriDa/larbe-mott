-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'NEW_LIBRARY_TEXT';
ALTER TYPE "NotificationType" ADD VALUE 'PLATFORM_ANNOUNCEMENT';

-- AlterTable
ALTER TABLE "notification" ADD COLUMN "title" TEXT,
                           ADD COLUMN "body" TEXT;

-- AlterTable
ALTER TABLE "user_notification_preferences" ADD COLUMN "inAppNewTexts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "textId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_createdAt_idx" ON "announcement"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "announcement_deletedAt_idx" ON "announcement"("deletedAt");

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_textId_fkey"
    FOREIGN KEY ("textId") REFERENCES "text"("id") ON DELETE SET NULL ON UPDATE CASCADE;
