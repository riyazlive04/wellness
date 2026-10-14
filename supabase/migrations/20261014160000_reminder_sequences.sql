-- A practice's reminder sequences: a named daily routine (meal times, a water
-- schedule and its own reminders such as "6:30 AM methi water") that the
-- nutritionist builds once and applies to clients. Applying copies the
-- settings into clients.reminder_settings (with sequence_id), and the client
-- app schedules them on the phone.

CREATE TABLE IF NOT EXISTS public.reminder_sequences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description  text,
  settings     jsonb NOT NULL,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminder_sequences_workspace_idx ON public.reminder_sequences (workspace_id, name);

-- Server-side only.
ALTER TABLE public.reminder_sequences ENABLE ROW LEVEL SECURITY;
