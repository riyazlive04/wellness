-- A practice's own Daily.co API key for video calls. When set, the practice's
-- calls run on its own Daily.co account (it pays Daily directly) and don't use
-- the plan's monthly video hours. Encrypted at rest; only the last 4 chars are
-- ever shown back.

CREATE TABLE IF NOT EXISTS public.workspace_video_keys (
  workspace_id   uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider       text NOT NULL DEFAULT 'daily' CHECK (provider IN ('daily')),
  key_enc        text NOT NULL,
  key_last4      text NOT NULL,
  -- The Daily.co subdomain the key belongs to (e.g. "mypractice"), for display.
  domain_name    text,
  status         text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  last_error     text,
  last_tested_at timestamptz,
  created_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Server-side only.
ALTER TABLE public.workspace_video_keys ENABLE ROW LEVEL SECURITY;
