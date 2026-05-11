-- Add form_data column to store structured health assessment form submissions
-- This allows storing new fields (smoking, alcohol, others) without schema changes

ALTER TABLE public.assessments 
  ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb;

-- Add index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_assessments_form_data 
  ON public.assessments USING GIN (form_data);

-- Add helpful comment
COMMENT ON COLUMN public.assessments.form_data 
  IS 'Structured JSON storage of health assessment form data including smoking, alcohol, and other lifestyle fields. Backward compatible - defaults to empty object for existing rows.';
