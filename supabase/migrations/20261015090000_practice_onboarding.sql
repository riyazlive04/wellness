-- Guided practice onboarding: a super admin creates a personal link for a
-- nutritionist, who fills six sections at their own pace. Super admin sees each
-- section's status live, approves, and the practice is created with its 14-day
-- trial starting at approval.

CREATE TABLE IF NOT EXISTS public.practice_onboarding (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text NOT NULL UNIQUE,
  name               text NOT NULL,
  email              text NOT NULL,
  phone              text,
  plan_key           text NOT NULL DEFAULT 'trial',
  -- invited → opened → in_progress → submitted → approved; changes / cancelled on the side
  status             text NOT NULL DEFAULT 'invited'
                     CHECK (status IN ('invited', 'opened', 'in_progress', 'submitted', 'changes', 'approved', 'cancelled')),
  -- { "<section>": { "status": "none|in_progress|done", "data": {...}, "updated_at": "..." } }
  sections           jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes_section    text,
  changes_note       text,
  -- [{ "at": "...", "text": "..." }]
  activity           jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_id            uuid,
  workspace_id       uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_by         uuid,
  approved_by        uuid,
  expires_at         timestamptz NOT NULL DEFAULT now() + interval '7 days',
  opened_at          timestamptz,
  submitted_at       timestamptz,
  approved_at        timestamptz,
  delay_notified_at  timestamptz,
  last_activity_at   timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_onboarding_status_idx ON public.practice_onboarding (status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS practice_onboarding_user_idx ON public.practice_onboarding (user_id) WHERE user_id IS NOT NULL;

-- Server-side only (public access goes through the token-checked API).
ALTER TABLE public.practice_onboarding ENABLE ROW LEVEL SECURITY;
