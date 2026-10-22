-- Daily storage snapshots.
--
-- Storage is a point-in-time total: a file either exists or it does not, so
-- there is no history to plot after the fact. Recording one row per practice
-- per day is the only way to answer "is this growing, and how fast" — and it
-- has to start before the question is asked, not when it is.
--
-- One row per workspace per day; the job is idempotent so a re-run or a second
-- instance overwrites rather than duplicates.

CREATE TABLE IF NOT EXISTS public.workspace_storage_daily (
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- The Indian calendar day the snapshot represents.
  day          date        NOT NULL,
  bytes        bigint      NOT NULL,
  files        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, day)
);

COMMENT ON TABLE public.workspace_storage_daily IS
  'One storage reading per practice per IST day, written nightly. Storage has no history of its own.';

-- The chart reads a single practice's recent days.
CREATE INDEX IF NOT EXISTS workspace_storage_daily_ws_day_idx
  ON public.workspace_storage_daily (workspace_id, day DESC);
