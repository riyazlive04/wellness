-- Drop the generic policy
drop policy if exists "Clients can manage their own logs" on public.daily_logs;

-- Re-create Admin view policy (optional, but good to ensure consistency if needed, sticking to client fix primarily)
-- Keeping existing Admin policy as is for now unless we need to fix has_role globally.

-- Create explicit Client policies with explicit casting
create policy "Clients can view their own logs"
  on public.daily_logs for select
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = daily_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can insert their own logs"
  on public.daily_logs for insert
  with check (
    exists (
      select 1 from public.clients
      where clients.id::text = daily_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can update their own logs"
  on public.daily_logs for update
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = daily_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can delete their own logs"
  on public.daily_logs for delete
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = daily_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );
