-- Backfill: readConfirmedAt is a new signal (dwell-time-confirmed reads) with
-- no historical data. Texts a user already finished reading (completedAt set)
-- are a reliable proxy for "actually read" even without a logged dwell-time
-- session, so we seed readConfirmedAt from completedAt for those rows only.
-- Rows that are merely in-progress (no completedAt) are intentionally left
-- null — they'll pick up readConfirmedAt organically as reading sessions land.
UPDATE "user_text_progress"
SET "readConfirmedAt" = "completedAt"
WHERE "completedAt" IS NOT NULL
  AND "readConfirmedAt" IS NULL;
