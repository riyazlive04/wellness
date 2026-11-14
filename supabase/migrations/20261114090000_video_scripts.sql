-- Marketing video scripts, owned by Sirah Digital.
--
-- The 50 sales-video scripts used to brief shoots and ad tests. Platform
-- content, not tenant content: there is deliberately no workspace_id, the
-- same way `leads` has none. A practice never sees this table.
--
-- The markdown originals in films/sirah-life/ seeded this table once. After
-- that the database is the source of truth - scripts get revised after every
-- shoot and every ad test, and those edits happen here, not in the repo.
CREATE TABLE IF NOT EXISTS public.video_scripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 1-50 today, but not capped: the library grows. Unique because operators
  -- refer to scripts by number ("shoot 07 next"), so two 07s would be a bug.
  number           integer NOT NULL UNIQUE,
  title            text    NOT NULL,

  -- The strategic angle, 1-10. Denormalised title so a read needs no join;
  -- there are ten of them and they change about never.
  bucket           integer NOT NULL,
  bucket_title     text    NOT NULL,

  -- 30 / 60 / 100 / 120 / 150 / 180. Stored as seconds rather than a label so
  -- "every script under a minute" is a comparison, not a string match.
  duration_seconds integer NOT NULL,

  -- The parenthetical on the heading, e.g. "VSL", "brand film". Most have none.
  kind             text,

  avatar           text,
  hook_type        text,

  -- The shot table: [{ n, vo, on_screen }]. jsonb rather than a child table
  -- because lines are only ever read and written as one whole document -
  -- never queried, filtered or joined individually. A lines table would add a
  -- join and ORDER BY to every read and buy nothing.
  lines            jsonb   NOT NULL DEFAULT '[]'::jsonb,

  status           text    NOT NULL DEFAULT 'draft',
  notes            text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT video_scripts_status_check
    CHECK (status IN ('draft', 'ready', 'produced', 'retired')),
  CONSTRAINT video_scripts_bucket_check
    CHECK (bucket BETWEEN 1 AND 99),
  CONSTRAINT video_scripts_duration_check
    CHECK (duration_seconds BETWEEN 5 AND 3600),
  -- Guards the shape the UI relies on. A bare object or string here would
  -- render as an empty script with no error.
  CONSTRAINT video_scripts_lines_is_array
    CHECK (jsonb_typeof(lines) = 'array')
);

COMMENT ON TABLE public.video_scripts IS
  'Sirah Digital marketing video scripts. Platform-owned: no workspace_id, super-admin only.';
COMMENT ON COLUMN public.video_scripts.number IS
  'Stable identifier operators use to refer to a script. Drives display order.';
COMMENT ON COLUMN public.video_scripts.bucket IS
  'Strategic angle 1-10 (tool-stack bleed, churn, India-native, ...). Groups the rail.';
COMMENT ON COLUMN public.video_scripts.lines IS
  'Shot table as [{ n, vo, on_screen }]. Written as a whole document, never row by row.';
COMMENT ON COLUMN public.video_scripts.status IS
  'draft | ready | produced | retired. Operator metadata; gates nothing.';

-- Number order is the only order this table is ever read in.
CREATE INDEX IF NOT EXISTS video_scripts_number_idx  ON public.video_scripts (number);
CREATE INDEX IF NOT EXISTS video_scripts_bucket_idx  ON public.video_scripts (bucket, number);
CREATE INDEX IF NOT EXISTS video_scripts_status_idx  ON public.video_scripts (status);

-- Keep updated_at honest; the UI shows it so a concurrent edit is visible.
CREATE OR REPLACE FUNCTION public.video_scripts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS video_scripts_touch ON public.video_scripts;
CREATE TRIGGER video_scripts_touch
  BEFORE UPDATE ON public.video_scripts
  FOR EACH ROW EXECUTE FUNCTION public.video_scripts_touch_updated_at();

-- Deny-all to authenticated users. Every read and write goes through the API
-- under @SuperAdmin(); RLS is the second layer, not the gate. Same posture as
-- `leads`. The service role used by the API bypasses RLS.
ALTER TABLE public.video_scripts ENABLE ROW LEVEL SECURITY;
