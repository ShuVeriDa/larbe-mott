-- AlterEnum: add DRAFT to TextSubmissionStatus
ALTER TYPE "TextSubmissionStatus" ADD VALUE 'DRAFT';

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('ORIGINAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "SubmissionLicenseType" AS ENUM ('PUBLIC_DOMAIN', 'CC', 'PERMISSION', 'UNKNOWN');

-- AlterTable: add new columns to text_submission
ALTER TABLE "text_submission"
  ADD COLUMN "submissionType"  "SubmissionType"        NOT NULL DEFAULT 'EXTERNAL',
  ADD COLUMN "licenseType"     "SubmissionLicenseType",
  ADD COLUMN "publicationYear" INTEGER,
  ADD COLUMN "contentRich"     JSONB,
  ADD COLUMN "updatedAt"       TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: compound index for owner-scoped status filter
CREATE INDEX "text_submission_userId_status_idx" ON "text_submission"("userId", "status");
