-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'HERITAGE_MODERATION';

-- AlterTable
ALTER TABLE "user_heritage" DROP COLUMN "otherNation",
ADD COLUMN     "districtId" TEXT,
ADD COLUMN     "garaCustom" TEXT,
ADD COLUMN     "garaStatus" "VerificationStatus",
ADD COLUMN     "hasTukhum" BOOLEAN,
ADD COLUMN     "nationId" TEXT,
ADD COLUMN     "otherNationName" TEXT,
ADD COLUMN     "regionId" TEXT,
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "taipCustom" TEXT,
ADD COLUMN     "taipStatus" "VerificationStatus",
ADD COLUMN     "tukhumId" TEXT;

-- AlterTable
ALTER TABLE "user_privacy_settings" DROP COLUMN "showGara",
DROP COLUMN "showNation",
DROP COLUMN "showNekyi",
DROP COLUMN "showTaip",
DROP COLUMN "showTukhum",
ADD COLUMN     "showActivity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showAge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showJoinDate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showLocation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPhone" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "user_heritage_nationId_idx" ON "user_heritage"("nationId");

-- CreateIndex
CREATE INDEX "user_heritage_tukhumId_idx" ON "user_heritage"("tukhumId");

-- AddForeignKey
ALTER TABLE "user_heritage" ADD CONSTRAINT "user_heritage_nationId_fkey" FOREIGN KEY ("nationId") REFERENCES "nation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_heritage" ADD CONSTRAINT "user_heritage_tukhumId_fkey" FOREIGN KEY ("tukhumId") REFERENCES "tukhum"("id") ON DELETE SET NULL ON UPDATE CASCADE;
