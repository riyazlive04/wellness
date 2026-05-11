-- Fix RLS policies for weekly_reports to ensure visibility
-- Using explicit text casting to handle potential type mismatches in the DB

-- Drop existing policies for weekly_reports
drop policy if exists "Clients can view their own published reports" on public.weekly_reports;
drop policy if exists "Admins can do everything with weekly reports" on public.weekly_reports;

-- Re-create policies for weekly_reports
create policy "Admins can do everything with weekly reports"
  on public.weekly_reports
  for all
  using (
    public.has_role(auth.uid(), 'admin')
  );

create policy "Clients can view their own published reports"
  on public.weekly_reports for select
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = weekly_reports.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
    and status = 'published'
  );

-- Removed 'assessments' table policies due to error 'column client_id does not exist'
-- We will focus on fixing the Weekly Reports visibility first.
