-- Recreate assessments table to fix corrupted schema
-- ADAPTED: defined client_id as TEXT to match public.clients.id type in live DB

-- Drop dependent tables first
DROP TABLE IF EXISTS public.assessment_audits;
DROP TABLE IF EXISTS public.assessments CASCADE;

-- Re-create assessments table
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clients(id) on delete cascade not null, -- Changed to text
  file_url text,
  file_name text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  file_version INTEGER DEFAULT 1,
  file_history JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft'
);

alter table public.assessments enable row level security;

-- Re-create audit table
CREATE TABLE public.assessment_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assessments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_table TEXT NOT NULL,
  before JSONB,
  after JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

alter table public.assessment_audits enable row level security;
CREATE INDEX idx_assessment_audits_assessment_id ON public.assessment_audits(assessment_id);

-- RLS Policies for Assessments
-- Now that client_id is text, we can compare directly if clients.id is text
-- But casting is safer to keep consistent

create policy "Clients can view their own assessments"
  on public.assessments for select
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = assessments.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Admins can view all assessments"
  on public.assessments for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert assessments"
  on public.assessments for insert
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update assessments"
  on public.assessments for update
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete assessments"
  on public.assessments for delete
  using (public.has_role(auth.uid(), 'admin'));
