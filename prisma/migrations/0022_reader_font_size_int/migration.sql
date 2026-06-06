-- Convert readerFontSize from String (enum key) to Int (px value)
-- Map old enum values to new px values, anything unrecognized → 17 (default)
ALTER TABLE "user_preferences"
  ALTER COLUMN "readerFontSize" TYPE INTEGER
  USING CASE "readerFontSize"
    WHEN 'xs' THEN 13
    WHEN 'sm' THEN 15
    WHEN 'md' THEN 17
    WHEN 'lg' THEN 19
    WHEN 'xl' THEN 22
    ELSE 17
  END;

ALTER TABLE "user_preferences"
  ALTER COLUMN "readerFontSize" SET DEFAULT 17;
