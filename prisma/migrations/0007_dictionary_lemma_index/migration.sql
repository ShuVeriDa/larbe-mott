-- Add index on user_dictionary_entry.lemmaId for efficient join with UserWordProgress
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_dictionary_entry') THEN
    CREATE INDEX IF NOT EXISTS "user_dictionary_entry_lemmaId_idx"
      ON "user_dictionary_entry" ("lemmaId");
  END IF;
END $$;
