  -- Program phases.
  --
  -- Program templates already schedule tasks by week_number/day_of_week, which
  -- answers "when". Practices that sell a staged protocol also need "which stage" —
  -- e.g. a four-stage model like Detox -> Booster -> Turbo -> Stabilization, where
  -- the stage is the thing the client is sold and the thing the coach talks about.
  --
  -- Modelled as a free-text label rather than a phases table on purpose: every
  -- practice names its stages differently, the set is small, and a lookup table
  -- would force a second CRUD screen to express what is really just a grouping
  -- key. Ordering comes from phase_order so 'Detox' can precede 'Booster' without
  -- depending on alphabet or on the first task's week.

  ALTER TABLE public.program_template_tasks
    ADD COLUMN IF NOT EXISTS phase_label text,
    ADD COLUMN IF NOT EXISTS phase_order integer;

  -- Assignment tasks are a SNAPSHOT of the template at assign time (that is the
  -- versioning guarantee), so the phase has to be copied down with everything else
  -- or an active client's program loses its stages on the next sync.
  ALTER TABLE public.program_assignment_tasks
    ADD COLUMN IF NOT EXISTS phase_label text,
    ADD COLUMN IF NOT EXISTS phase_order integer;

  -- Grouping a template's builder view by phase, in phase order.
  CREATE INDEX IF NOT EXISTS program_template_tasks_phase_idx
    ON public.program_template_tasks (template_id, phase_order, sort_order);
