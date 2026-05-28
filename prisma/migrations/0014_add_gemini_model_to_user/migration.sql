-- Add geminiModel column to User table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "geminiModel" TEXT DEFAULT 'gemini-3.1-flash-lite';
