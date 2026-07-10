-- Assessment forms can be saved as a draft and published later.
-- Existing forms default to 'published' so nothing changes for them.
ALTER TABLE public.assessment_form_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

ALTER TABLE public.assessment_form_templates
  DROP CONSTRAINT IF EXISTS assessment_form_templates_status_check;

ALTER TABLE public.assessment_form_templates
  ADD CONSTRAINT assessment_form_templates_status_check
  CHECK (status IN ('draft', 'published'));
