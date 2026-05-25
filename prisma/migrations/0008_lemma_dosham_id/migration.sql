ALTER TABLE "lemma" ADD COLUMN IF NOT EXISTS "doshamId" INTEGER;
CREATE INDEX IF NOT EXISTS "lemma_doshamId_idx" ON "lemma" ("doshamId");
