-- Add display_name column to assessments table
ALTER TABLE assessments 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN assessments.display_name IS 'Human-friendly display name for the assessment file, shown in UI and used for downloads';

-- Backfill display_name for existing records
-- Rule: If file_name exists, sanitize it. Otherwise generate from client name + assessment_type + date
UPDATE assessments
SET display_name = CASE
  -- If file_name exists and is not empty, use sanitized version
  WHEN file_name IS NOT NULL AND file_name != '' THEN 
    LOWER(REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(file_name, '\s+', '-', 'g'),
        '[^a-z0-9._-]', '', 'g'
      ),
      '-+', '-', 'g'
    ))
  -- Otherwise generate from client info
  ELSE 
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(clients.name, '\s+', '-', 'g'),
        '[^a-z0-9-]', '', 'g'
      ) || '_' ||
      COALESCE(assessments.assessment_type::text, 'assessment') || '_' ||
      TO_CHAR(assessments.created_at, 'YYYYMMDD') ||
      '.pdf'
    )
END
FROM clients
WHERE assessments.client_id = clients.id
  AND assessments.display_name IS NULL;

-- Add index for faster lookups when checking uniqueness
CREATE INDEX IF NOT EXISTS idx_assessments_display_name 
ON assessments(client_id, display_name);

-- Add validation check for display_name length
ALTER TABLE assessments
ADD CONSTRAINT chk_display_name_length 
CHECK (display_name IS NULL OR LENGTH(display_name) <= 200);