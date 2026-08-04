-- Per-workspace notification channel connections.
--
-- Each workspace connects its OWN email sender and (later) its OWN WhatsApp
-- number, configured in-app rather than via global server env vars. Secrets in
-- `config` are stored ENCRYPTED (AES-256-GCM) by the backend — never plaintext.
-- One row per (workspace, channel).

CREATE TABLE IF NOT EXISTS public.workspace_connections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  provider     text NOT NULL,                 -- e.g. 'resend' | 'smtp' | 'evolution'
  config       jsonb NOT NULL DEFAULT '{}',   -- encrypted secrets + non-secret settings
  status       text NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
  identity     text,                          -- human label: from-email or WhatsApp number
  last_error   text,
  last_tested_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_workspace_connections_ws
  ON public.workspace_connections (workspace_id);

-- RLS: app enforces owner-only access server-side (RolesGuard + workspace scope);
-- enable RLS as defence-in-depth, consistent with the rest of the schema.
ALTER TABLE public.workspace_connections ENABLE ROW LEVEL SECURITY;
