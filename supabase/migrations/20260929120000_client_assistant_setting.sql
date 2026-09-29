-- Clients' AI assistant is opt-in per practice, with a daily question limit
-- per client. Off by default: an AI talking to a practice's clients is the
-- practice's decision, and every question spends its AI credits.
alter table public.workspaces
  add column if not exists client_assistant_enabled boolean not null default false,
  add column if not exists client_assistant_daily_limit integer not null default 20;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspaces_client_assistant_daily_limit_range'
  ) then
    alter table public.workspaces
      add constraint workspaces_client_assistant_daily_limit_range
      check (client_assistant_daily_limit between 1 and 200);
  end if;
end $$;
