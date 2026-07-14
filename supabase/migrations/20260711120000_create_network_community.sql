-- Global "Nutritionist Network" — a shared professional feed across ALL
-- practices. Unlike public.community_posts (per-workspace, includes clients),
-- these posts are authored by staff and visible to every practitioner on
-- SIRAH. Deliberately NOT workspace-scoped: that is the whole point.

create table if not exists public.network_posts (
  id                  uuid primary key default gen_random_uuid(),
  author_user_id      uuid not null,
  author_workspace_id uuid,               -- for practice attribution (nullable)
  content             text not null,
  like_count          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists network_posts_created_idx
  on public.network_posts (created_at desc);

create table if not exists public.network_post_likes (
  post_id    uuid not null references public.network_posts(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Backend accesses these via the postgres role (bypasses RLS); enable RLS so
-- the anon/authenticated Supabase keys can never read/write them directly.
alter table public.network_posts       enable row level security;
alter table public.network_post_likes  enable row level security;
