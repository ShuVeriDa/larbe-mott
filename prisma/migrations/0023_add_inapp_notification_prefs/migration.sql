ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "inAppFeedbackReply"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inAppSuggestion"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inAppTextSubmission" BOOLEAN NOT NULL DEFAULT true;
