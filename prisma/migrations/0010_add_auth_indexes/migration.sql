DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users"("username");
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_session') THEN
    CREATE INDEX IF NOT EXISTS "user_session_userId_revokedAt_idx" ON "user_session"("userId", "revokedAt");
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') THEN
    CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_expiresAt_usedAt_idx" ON "password_reset_tokens"("userId", "expiresAt", "usedAt");
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_change_tokens') THEN
    CREATE INDEX IF NOT EXISTS "email_change_tokens_userId_expiresAt_usedAt_idx" ON "email_change_tokens"("userId", "expiresAt", "usedAt");
  END IF;
END $$;
