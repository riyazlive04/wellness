-- ============================================================================
-- SIRAH LIFE — Public nutritionist profile (link-in-bio).
--
-- Owners publish a branded page at /p/:slug with custom links + Join CTA.
-- Prospects hit GET /api/v1/public/profiles/:slug (no auth).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_public_profiles (
  workspace_id   uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled        boolean NOT NULL DEFAULT false,
  headline       text,
  bio            text,
  show_join_cta  boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_public_profiles IS
  'Per-workspace public link-in-bio settings. enabled=false → public GET returns 404.';

CREATE TABLE IF NOT EXISTS public.workspace_profile_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label         text NOT NULL,
  url           text NOT NULL,
  sort_order    int NOT NULL DEFAULT 0,
  icon          text NOT NULL DEFAULT 'custom',
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_profile_links_icon_chk
    CHECK (icon IN ('whatsapp', 'instagram', 'youtube', 'website', 'calendar', 'shop', 'custom'))
);

CREATE INDEX IF NOT EXISTS workspace_profile_links_workspace_idx
  ON public.workspace_profile_links(workspace_id, sort_order);

COMMENT ON TABLE public.workspace_profile_links IS
  'Ordered buttons on the public /p/:slug page.';
