-- Fix RLS for assessments table using robust ID comparison
-- This ensures clients can view their own assessments even if ID types (uuid vs text) are inconsistent

-- Drop potentially brittle policy
drop policy if exists "Clients can view their own assessments" on public.assessments;

-- Re-create policy with explicit casting but simplified column reference
-- Using 'client_id' directly refers to the column in the target table (public.assessments)
create policy "Clients can view their own assessments"
  on public.assessments
  for select
  using (
    exists (
      select 1 from public.clients c
      where c.id::text = client_id::text
      and c.user_id::text = auth.uid()::text
    )
  );
