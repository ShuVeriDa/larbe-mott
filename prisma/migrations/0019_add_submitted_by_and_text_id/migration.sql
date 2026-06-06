-- Add submittedById to text table
ALTER TABLE "text" ADD COLUMN IF NOT EXISTS "submittedById" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'text_submittedById_fkey') THEN
    ALTER TABLE "text" ADD CONSTRAINT "text_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add textId to text_submission table
ALTER TABLE "text_submission" ADD COLUMN IF NOT EXISTS "textId" TEXT;
