-- Add index on user_dictionary_entry.lemmaId for efficient join with UserWordProgress
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_dictionary_entry_lemmaId_idx"
  ON "user_dictionary_entry" ("lemmaId");
