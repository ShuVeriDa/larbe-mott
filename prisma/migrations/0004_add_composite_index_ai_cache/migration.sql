-- CreateIndex: composite index for the common query WHERE status = 'APPROVED' AND exportedAt IS NULL
CREATE INDEX IF NOT EXISTS "ai_translation_cache_status_exportedAt_idx" ON "ai_translation_cache"("status", "exportedAt");
