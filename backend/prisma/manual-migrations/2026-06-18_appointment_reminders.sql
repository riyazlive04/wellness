-- Auto meeting reminders: track when a reminder push was sent so the cron
-- sends exactly one per appointment. Additive + idempotent.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- Hot path for the reminder cron (upcoming, not-yet-reminded, scheduled).
CREATE INDEX IF NOT EXISTS appointments_reminder_idx
  ON public.appointments (scheduled_at)
  WHERE status = 'scheduled' AND reminded_at IS NULL;
