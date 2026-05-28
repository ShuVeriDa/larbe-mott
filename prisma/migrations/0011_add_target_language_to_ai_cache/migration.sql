-- Add targetLanguage and russianGloss fields to ai_translation_cache
-- targetLanguage defaults to 'ru' to preserve all existing rows as Russian translations
-- russianGloss stores the Russian meaning alongside non-Russian translations for context verification

ALTER TABLE "ai_translation_cache"
  ADD COLUMN "targetLanguage" TEXT NOT NULL DEFAULT 'ru',
  ADD COLUMN "russianGloss"   TEXT;

-- Drop the old unique index (PostgreSQL stores @@unique as an index, not a constraint)
DROP INDEX IF EXISTS "ai_translation_cache_lemma_cacheType_key";
ALTER TABLE "ai_translation_cache"
  DROP CONSTRAINT IF EXISTS "ai_translation_cache_lemma_cacheType_key";

-- Add new unique constraint that includes targetLanguage
ALTER TABLE "ai_translation_cache"
  ADD CONSTRAINT "ai_translation_cache_lemma_cacheType_targetLanguage_key"
  UNIQUE ("lemma", "cacheType", "targetLanguage");

-- Add indexes for targetLanguage lookups
CREATE INDEX IF NOT EXISTS "ai_translation_cache_targetLanguage_idx"
  ON "ai_translation_cache" ("targetLanguage");

CREATE INDEX IF NOT EXISTS "ai_translation_cache_lemma_targetLanguage_idx"
  ON "ai_translation_cache" ("lemma", "targetLanguage");
