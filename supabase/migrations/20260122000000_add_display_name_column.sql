
-- Add display_name column to assessments table
-- This column is used for descriptive titles of assessments in the UI

ALTER TABLE public.assessments 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update existing records to have a default display name if they don't have one
UPDATE public.assessments 
SET display_name = 'Comprehensive Nutritional Assessment' 
WHERE display_name IS NULL AND assessment_type = 'custom';

UPDATE public.assessments 
SET display_name = file_name 
WHERE display_name IS NULL AND file_name IS NOT NULL;
