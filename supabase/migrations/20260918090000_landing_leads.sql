-- Landing page lead capture (Meta ads traffic).
--
-- The landing form writes here with the anon key. RLS allows INSERT only:
-- nobody can read, update or delete leads from the browser. Read them in the
-- Supabase table editor / SQL editor, which uses the service role.

create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  name           text not null,
  phone          text not null,
  email          text not null,
  city           text,
  practice_size  text,
  source         jsonb not null default '{}'::jsonb,  -- utm_*, fbclid, referrer
  status         text not null default 'new',         -- new | contacted | won | lost
  notes          text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx     on public.leads (status);

alter table public.leads enable row level security;

-- Anyone on the landing page may submit a lead...
drop policy if exists "landing form can insert leads" on public.leads;
create policy "landing form can insert leads"
  on public.leads for insert
  to anon, authenticated
  with check (
    length(coalesce(name, '')) between 1 and 120
    and length(coalesce(phone, '')) between 8 and 20
    and length(coalesce(email, '')) between 5 and 200
  );

-- ...but nobody may read them back with the anon/authenticated keys.
-- (No SELECT policy = no rows visible. The service role bypasses RLS.)

grant insert on public.leads to anon, authenticated;

-- Sirah Digital staff (super_admin in user_roles) read + work the leads in the
-- admin area at /admin/leads. Everyone else still sees nothing.
drop policy if exists "super admins read leads" on public.leads;
create policy "super admins read leads"
  on public.leads for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role::text = 'super_admin'
    )
  );

drop policy if exists "super admins update leads" on public.leads;
create policy "super admins update leads"
  on public.leads for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role::text = 'super_admin'
    )
  );

grant select, update on public.leads to authenticated;
