
create table if not exists public.interest_forms (
  id uuid not null default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  age integer null,
  gender text null,
  health_goal text null,
  message text null,
  created_at timestamp with time zone not null default now(),
  status text not null default 'pending',
  constraint interest_forms_pkey primary key (id)
);

-- Enable RLS
alter table public.interest_forms enable row level security;

-- Create policies
create policy "Enable insert for everyone" on public.interest_forms
  for insert with check (true);

create policy "Enable select for authenticated users only" on public.interest_forms
  for select using (auth.role() = 'authenticated');

create policy "Enable update for authenticated users only" on public.interest_forms
  for update using (auth.role() = 'authenticated');
