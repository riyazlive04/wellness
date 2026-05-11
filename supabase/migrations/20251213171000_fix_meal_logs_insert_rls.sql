-- Drop the generic policy if it exists
drop policy if exists "Clients can manage their own meal logs" on public.meal_logs;
drop policy if exists "Admins can view all meal logs" on public.meal_logs;

-- Re-create Admin view policy with explicit casting
create policy "Admins can view all meal logs"
  on public.meal_logs for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id::text = auth.uid()::text
      and role::text = 'admin'
    )
  );

-- Create explicit Client policies with explicit casting
create policy "Clients can view their own meal logs"
  on public.meal_logs for select
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can insert their own meal logs"
  on public.meal_logs for insert
  with check (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can update their own meal logs"
  on public.meal_logs for update
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

create policy "Clients can delete their own meal logs"
  on public.meal_logs for delete
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );
