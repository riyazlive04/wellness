-- Workspace API keys — the Scale Pro "API access" feature.
-- The full key is shown to the owner ONCE at creation; we persist only its
-- SHA-256 hash (for lookup) plus a short display prefix. Never the plaintext.
CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_prefix    text NOT NULL,                         -- e.g. 'sk_live_AbC123…' (display only)
  key_hash      text NOT NULL UNIQUE,                  -- sha256 hex of the full key
  scopes        text[] NOT NULL DEFAULT ARRAY['read']::text[],
  last_used_at  timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

-- Active keys for a workspace (management list).
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_ws
  ON public.workspace_api_keys (workspace_id) WHERE revoked_at IS NULL;

-- Auth lookup by hash on every API call.
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_hash
  ON public.workspace_api_keys (key_hash);
