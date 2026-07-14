-- Bring the global Nutritionist Network to parity with the per-practice
-- community: multi-type reactions (cheer/strength/love/celebrate) + comments.

create table if not exists public.network_post_reactions (
  post_id    uuid not null references public.network_posts(id) on delete cascade,
  user_id    uuid not null,
  reaction   text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

create table if not exists public.network_comments (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.network_posts(id) on delete cascade,
  author_user_id      uuid not null,
  author_workspace_id uuid,
  content             text not null,
  created_at          timestamptz not null default now()
);
create index if not exists network_comments_post_idx
  on public.network_comments (post_id, created_at);

alter table public.network_post_reactions enable row level security;
alter table public.network_comments       enable row level security;
