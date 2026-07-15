-- Trial length: 30 days → 14 days (2026 pricing sheet).
--
-- The original default was set when workspaces were introduced. The 2026 sheet
-- sells a 14-day trial, so a new signup was getting double the advertised
-- window purely from a stale column default.
--
-- Existing workspaces are NOT touched: shortening a trial someone is already
-- inside would cut short an evaluation they were promised, and could expire a
-- live workspace the moment this runs. New rows only.

alter table public.workspaces
  alter column trial_ends_at set default (now() + interval '14 days');

comment on column public.workspaces.trial_ends_at is
  'End of the free trial (14 days from signup). Existing rows keep whatever window they were created with.';
