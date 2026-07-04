-- DropConstraint (existing unique key is a table constraint, not a bare index)
ALTER TABLE "ai_translation_cache" DROP CONSTRAINT "ai_translation_cache_lemma_cacheType_targetLanguage_key";

-- AlterTable
ALTER TABLE "ai_translation_cache" ADD COLUMN     "sourceLanguage" TEXT NOT NULL DEFAULT 'che';

-- CreateIndex
CREATE INDEX "ai_translation_cache_sourceLanguage_idx" ON "ai_translation_cache"("sourceLanguage");

-- AddConstraint
ALTER TABLE "ai_translation_cache" ADD CONSTRAINT "ai_translation_cache_lemma_cacheType_sourceLanguage_targetL_key" UNIQUE ("lemma", "cacheType", "sourceLanguage", "targetLanguage");
