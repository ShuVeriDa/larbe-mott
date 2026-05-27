-- Add index on users.username for login lookups
CREATE INDEX IF NOT EXISTS "users_username_idx" ON "users"("username");

-- Add composite index on user_session for active sessions query
CREATE INDEX IF NOT EXISTS "user_session_userId_revokedAt_idx" ON "user_session"("userId", "revokedAt");

-- Add composite index on password_reset_tokens for token lookup
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_expiresAt_usedAt_idx" ON "password_reset_tokens"("userId", "expiresAt", "usedAt");

-- Add composite index on email_change_tokens for token lookup
CREATE INDEX IF NOT EXISTS "email_change_tokens_userId_expiresAt_usedAt_idx" ON "email_change_tokens"("userId", "expiresAt", "usedAt");
