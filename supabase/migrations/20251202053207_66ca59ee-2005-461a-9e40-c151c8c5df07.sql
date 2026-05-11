-- Create audits table for tracking all assessment changes
CREATE TABLE IF NOT EXISTS public.assessment_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add index for faster audit queries
CREATE INDEX IF NOT EXISTS idx_assessment_audits_assessment_id ON public.assessment_audits(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_audits_created_at ON public.assessment_audits(created_at DESC);

-- Add version history to assessments for file tracking
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS file_version INTEGER DEFAULT 1;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS file_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Enable RLS on audits table
ALTER TABLE public.assessment_audits ENABLE ROW LEVEL SECURITY;

-- Admins can view all audits
CREATE POLICY "Admins can view all audits"
  ON public.assessment_audits
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert audits
CREATE POLICY "Admins can insert audits"
  ON public.assessment_audits
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Backfill: Set file_version = 1 for existing assessments with files
UPDATE public.assessments 
SET file_version = 1, status = 'sent'
WHERE file_url IS NOT NULL;