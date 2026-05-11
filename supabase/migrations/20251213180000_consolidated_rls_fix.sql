-- 1. Fix public.has_role by overloading it to accept text
-- This prevents "function does not exist" errors when Postgres sees 'admin' as unknown/text
create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id::text = _user_id::text
      and role::text = _role
  )
$$;

-- 2. Drop ALL existing policies for meal_logs to start fresh
drop policy if exists "Clients can manage their own meal logs" on public.meal_logs;
drop policy if exists "Admins can view all meal logs" on public.meal_logs;
drop policy if exists "Clients can view their own meal logs" on public.meal_logs;
drop policy if exists "Clients can insert their own meal logs" on public.meal_logs;
drop policy if exists "Clients can update their own meal logs" on public.meal_logs;
drop policy if exists "Clients can delete their own meal logs" on public.meal_logs;

-- 3. Re-create Explicit Policies with COMPREHENSIVE type casting

-- Admin Select Policy
create policy "Admins can view all meal logs"
  on public.meal_logs for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id::text = auth.uid()::text
      and role::text = 'admin'
    )
  );

-- Client Select Policy
create policy "Clients can view their own meal logs"
  on public.meal_logs for select
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

-- Client Insert Policy (WITH CHECK)
create policy "Clients can insert their own meal logs"
  on public.meal_logs for insert
  with check (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

-- Client Update Policy
create policy "Clients can update their own meal logs"
  on public.meal_logs for update
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );

-- Client Delete Policy
create policy "Clients can delete their own meal logs"
  on public.meal_logs for delete
  using (
    exists (
      select 1 from public.clients
      where clients.id::text = meal_logs.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );
