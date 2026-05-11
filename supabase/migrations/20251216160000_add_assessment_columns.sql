-- Add missing columns to assessments table to support AI generation
-- These columns are required by the generate-* edge functions

ALTER TABLE public.assessments 
ADD COLUMN IF NOT EXISTS assessment_type TEXT,
ADD COLUMN IF NOT EXISTS form_responses JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS assessment_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE;

-- Add index for assessment_type
CREATE INDEX IF NOT EXISTS idx_assessments_type ON public.assessments(assessment_type);
