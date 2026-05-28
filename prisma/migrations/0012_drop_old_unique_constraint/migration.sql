-- Drop the old unique index on (lemma, cacheType) if it still exists.
-- This was missed in 0011 because PostgreSQL stores @@unique as an index
-- (not just a constraint), and DROP CONSTRAINT leaves the underlying index.
DROP INDEX IF EXISTS "ai_translation_cache_lemma_cacheType_key";
