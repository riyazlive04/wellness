-- Create enum for health goals
CREATE TYPE health_goal_type AS ENUM ('weight_loss', 'muscle_gain', 'diabetes', 'pcos', 'lifestyle_correction');

-- Create interest_form_submissions table
CREATE TABLE public.interest_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 10 AND age <= 120),
  gender gender_type NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  health_goal health_goal_type NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'converted', 'not_interested'))
);

-- Create indexes for better query performance
CREATE INDEX idx_interest_submissions_status ON public.interest_form_submissions(status);
CREATE INDEX idx_interest_submissions_submitted_at ON public.interest_form_submissions(submitted_at DESC);

-- Enable RLS
ALTER TABLE public.interest_form_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can insert (for the public form)
CREATE POLICY "Anyone can submit interest form"
  ON public.interest_form_submissions
  FOR INSERT
  WITH CHECK (true);

-- RLS Policy: Only admins can view submissions
CREATE POLICY "Admins can view all submissions"
  ON public.interest_form_submissions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Only admins can update submissions
CREATE POLICY "Admins can update submissions"
  ON public.interest_form_submissions
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Only admins can delete submissions
CREATE POLICY "Admins can delete submissions"
  ON public.interest_form_submissions
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));