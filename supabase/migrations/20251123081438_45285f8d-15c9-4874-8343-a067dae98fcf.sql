-- Add file_type column to meal_logs table to support various file formats
ALTER TABLE meal_logs ADD COLUMN IF NOT EXISTS file_type TEXT;

-- Add index for better query performance on file_type
CREATE INDEX IF NOT EXISTS idx_meal_logs_file_type ON meal_logs(file_type);