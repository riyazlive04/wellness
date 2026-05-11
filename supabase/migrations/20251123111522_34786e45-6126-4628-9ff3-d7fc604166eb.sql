-- Create cron job metadata table for managing scheduled tasks
CREATE TABLE IF NOT EXISTS public.cron_job_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  schedule TEXT NOT NULL, -- Cron expression
  edge_function_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT, -- 'success' | 'failed' | 'pending'
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.cron_job_metadata ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage cron jobs"
  ON public.cron_job_metadata
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert existing cron job metadata
INSERT INTO public.cron_job_metadata (job_name, description, schedule, edge_function_name)
VALUES (
  'send-daily-meeting-reminders',
  'Sends reminder notifications to clients about meetings scheduled in the next 24 hours',
  '0 8 * * *',
  'send-meeting-reminders'
);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_cron_job_metadata_updated_at
  BEFORE UPDATE ON public.cron_job_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();