-- Create enum for user roles
create type public.app_role as enum ('admin', 'client');

-- Create enum for gender
create type public.gender_type as enum ('male', 'female', 'other');

-- Create enum for program types
create type public.program_type as enum ('weight_loss', 'weight_gain', 'maintenance', 'muscle_building', 'general_wellness');

-- Create enum for client status
create type public.client_status as enum ('active', 'inactive', 'pending', 'completed');

-- Create enum for meal types
create type public.meal_type as enum ('breakfast', 'lunch', 'evening_snack', 'dinner');

-- Create profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  phone text,
  email text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

-- Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Create security definer function to check roles
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Create clients table
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  name text not null,
  phone text not null,
  email text not null,
  age integer,
  gender gender_type,
  goals text,
  target_kcal integer,
  program_type program_type,
  status client_status default 'active',
  last_weight decimal(5,2),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.clients enable row level security;

-- Create assessments table
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  file_url text,
  file_name text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.assessments enable row level security;

-- Create weekly_plans table
create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  week_number integer not null,
  start_date date not null,
  end_date date not null,
  total_kcal integer,
  status text default 'draft',
  pdf_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  published_at timestamptz
);

alter table public.weekly_plans enable row level security;

-- Create meal_cards table (Option-B style meals)
create table public.meal_cards (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.weekly_plans(id) on delete cascade not null,
  day_number integer not null check (day_number >= 1 and day_number <= 7),
  meal_type meal_type not null,
  meal_name text not null,
  description text,
  kcal integer not null,
  ingredients text,
  instructions text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.meal_cards enable row level security;

-- Create daily_logs table
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  log_date date not null,
  weight decimal(5,2),
  water_intake integer default 0,
  activity_minutes integer default 0,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(client_id, log_date)
);

alter table public.daily_logs enable row level security;

-- Create meal_logs table
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  daily_log_id uuid references public.daily_logs(id) on delete cascade,
  meal_type meal_type not null,
  meal_name text,
  kcal integer,
  photo_url text,
  vision_tags jsonb,
  notes text,
  logged_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.meal_logs enable row level security;

-- Create food_items table
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  serving_size text not null,
  serving_unit text not null,
  kcal_per_serving integer not null,
  protein decimal(5,2),
  carbs decimal(5,2),
  fats decimal(5,2),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.food_items enable row level security;

-- Create recipes table
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  servings integer not null default 1,
  total_kcal integer,
  instructions text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.recipes enable row level security;

-- Create recipe_ingredients table
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete cascade not null,
  food_item_id uuid references public.food_items(id) on delete cascade not null,
  quantity decimal(10,2) not null,
  unit text not null,
  created_at timestamptz default now() not null
);

alter table public.recipe_ingredients enable row level security;

-- Create weekly_reports table
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  week_number integer not null,
  start_date date not null,
  end_date date not null,
  pdf_url text,
  audio_url text,
  summary text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.weekly_reports enable row level security;

-- Create files table
create table public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  file_name text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  created_at timestamptz default now() not null
);

alter table public.files enable row level security;

-- RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- RLS Policies for user_roles
create policy "Users can view their own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Admins can view all roles"
  on public.user_roles for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert roles"
  on public.user_roles for insert
  with check (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for clients
create policy "Clients can view their own data"
  on public.clients for select
  using (auth.uid() = user_id);

create policy "Admins can view all clients"
  on public.clients for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Clients can insert their own data"
  on public.clients for insert
  with check (auth.uid() = user_id);

create policy "Clients can update their own data"
  on public.clients for update
  using (auth.uid() = user_id);

create policy "Admins can update all clients"
  on public.clients for update
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for assessments
create policy "Clients can view their own assessments"
  on public.assessments for select
  using (
    exists (
      select 1 from public.clients
      where clients.id = assessments.client_id
      and clients.user_id = auth.uid()
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

-- RLS Policies for weekly_plans
create policy "Clients can view their own plans"
  on public.weekly_plans for select
  using (
    exists (
      select 1 from public.clients
      where clients.id = weekly_plans.client_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all plans"
  on public.weekly_plans for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage plans"
  on public.weekly_plans for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for meal_cards
create policy "Clients can view their meal cards"
  on public.meal_cards for select
  using (
    exists (
      select 1 from public.weekly_plans
      join public.clients on clients.id = weekly_plans.client_id
      where weekly_plans.id = meal_cards.plan_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all meal cards"
  on public.meal_cards for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage meal cards"
  on public.meal_cards for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for daily_logs
create policy "Clients can manage their own logs"
  on public.daily_logs for all
  using (
    exists (
      select 1 from public.clients
      where clients.id = daily_logs.client_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all logs"
  on public.daily_logs for select
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for meal_logs
create policy "Clients can manage their own meal logs"
  on public.meal_logs for all
  using (
    exists (
      select 1 from public.clients
      where clients.id = meal_logs.client_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all meal logs"
  on public.meal_logs for select
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for food_items (readable by all authenticated users)
create policy "Authenticated users can view food items"
  on public.food_items for select
  to authenticated
  using (true);

create policy "Admins can manage food items"
  on public.food_items for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for recipes
create policy "Authenticated users can view recipes"
  on public.recipes for select
  to authenticated
  using (true);

create policy "Admins can manage recipes"
  on public.recipes for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for recipe_ingredients
create policy "Authenticated users can view recipe ingredients"
  on public.recipe_ingredients for select
  to authenticated
  using (true);

create policy "Admins can manage recipe ingredients"
  on public.recipe_ingredients for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for weekly_reports
create policy "Clients can view their own reports"
  on public.weekly_reports for select
  using (
    exists (
      select 1 from public.clients
      where clients.id = weekly_reports.client_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all reports"
  on public.weekly_reports for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage reports"
  on public.weekly_reports for all
  using (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for files
create policy "Clients can view their own files"
  on public.files for select
  using (
    exists (
      select 1 from public.clients
      where clients.id = files.client_id
      and clients.user_id = auth.uid()
    )
  );

create policy "Admins can view all files"
  on public.files for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage files"
  on public.files for all
  using (public.has_role(auth.uid(), 'admin'));

-- Create function to handle new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert into profiles
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', '')
  );
  
  -- Assign client role by default
  insert into public.user_roles (user_id, role)
  values (new.id, 'client');
  
  return new;
end;
$$;

-- Trigger for new user creation
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Add updated_at triggers to all relevant tables
create trigger set_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.clients
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.assessments
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.weekly_plans
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.meal_cards
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.daily_logs
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.meal_logs
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.food_items
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.recipes
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.weekly_reports
  for each row execute function public.handle_updated_at();