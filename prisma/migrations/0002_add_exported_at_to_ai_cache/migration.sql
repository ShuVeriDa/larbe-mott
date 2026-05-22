-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AiCacheType" AS ENUM ('WORD_ONLY', 'WORD_IN_CONTEXT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AiCacheStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_translation_cache" (
    "id" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "contextSentence" TEXT,
    "cacheType" "AiCacheType" NOT NULL DEFAULT 'WORD_ONLY',
    "translation" TEXT NOT NULL,
    "transliteration" TEXT,
    "partOfSpeech" TEXT,
    "example" TEXT,
    "source" TEXT NOT NULL DEFAULT 'gemini',
    "status" "AiCacheStatus" NOT NULL DEFAULT 'PENDING',
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "thumbsUp" INTEGER NOT NULL DEFAULT 0,
    "thumbsDown" INTEGER NOT NULL DEFAULT 0,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_translation_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ai_translation_cache_lemma_cacheType_key" ON "ai_translation_cache"("lemma", "cacheType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_translation_cache_status_idx" ON "ai_translation_cache"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_translation_cache_requestCount_idx" ON "ai_translation_cache"("requestCount");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_translation_cache_lemma_idx" ON "ai_translation_cache"("lemma");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_translation_cache_exportedAt_idx" ON "ai_translation_cache"("exportedAt");
