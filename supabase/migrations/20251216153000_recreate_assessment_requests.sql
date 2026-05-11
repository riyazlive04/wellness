-- Recreate assessment_requests table to fix schema and RLS
-- ADAPTED: defined client_id as TEXT to match public.clients.id type
-- ADAPTED: defined requested_by as TEXT
-- ADAPTED: removed ::app_role cast
-- ADAPTED: Added handle_updated_at function check

-- Ensure timestamp function exists
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop existing triggers
DROP TRIGGER IF EXISTS update_assessment_requests_updated_at ON public.assessment_requests;

-- Drop table
DROP TABLE IF EXISTS public.assessment_requests CASCADE;

-- Drop enum if exists
DROP TYPE IF EXISTS public.assessment_request_status;

-- Recreate enum
CREATE TYPE public.assessment_request_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Create assessment_requests table
CREATE TABLE public.assessment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL,
  status public.assessment_request_status DEFAULT 'pending',
  requested_by TEXT, -- Changed to TEXT
  requested_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assessment_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can manage all requests
CREATE POLICY "Admins can manage assessment requests"
  ON public.assessment_requests FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Clients can view their own requests
CREATE POLICY "Clients can view their requests"
  ON public.assessment_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = assessment_requests.client_id
      AND clients.user_id::text = auth.uid()::text
    )
  );

-- Clients can update their requests (for marking in_progress)
CREATE POLICY "Clients can update their requests"
  ON public.assessment_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = assessment_requests.client_id
      AND clients.user_id::text = auth.uid()::text
    )
  );

-- Indexes for performance
CREATE INDEX idx_assessment_requests_client_id ON public.assessment_requests(client_id);
CREATE INDEX idx_assessment_requests_status ON public.assessment_requests(status);
CREATE INDEX idx_assessment_requests_type ON public.assessment_requests(assessment_type);

-- Trigger for updated_at
CREATE TRIGGER update_assessment_requests_updated_at
  BEFORE UPDATE ON public.assessment_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
