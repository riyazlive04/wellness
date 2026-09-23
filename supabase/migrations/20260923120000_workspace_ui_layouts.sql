-- Server-driven UI — per-workspace mobile app layouts.
--
-- One row per (workspace, screen). A workspace with no row simply gets the
-- layout compiled into the backend (sdui.defaults.ts), so this table starts
-- empty and turning the feature on changes nothing until somebody edits.
--
-- The draft/published split is the whole safety story. `draft` is what the
-- editor writes on every keystroke-save; `published` is the only thing devices
-- ever read. Without the split, a half-finished edit is live on every client's
-- phone the moment it is typed.
--
-- `published_revision` is what the app caches against: it is bumped on publish
-- and nowhere else, so a device can skip re-downloading a bundle it already has.
CREATE TABLE IF NOT EXISTS public.workspace_ui_layouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  screen              text NOT NULL,                      -- 'home' | 'more' | 'tabs' | 'onboarding'

  draft               jsonb,                              -- work in progress; never served to devices
  published           jsonb,                              -- the live tree; NULL = fall back to defaults
  published_revision  integer NOT NULL DEFAULT 0,         -- bumped on publish; drives client cache busting

  -- Schema version the PUBLISHED tree was validated against. A client on an
  -- older build compares this and falls back rather than rendering a tree it
  -- only partly understands.
  schema_version      integer NOT NULL DEFAULT 1,

  published_at        timestamptz,
  published_by        uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_ui_layouts_screen_chk
    CHECK (screen IN ('home', 'more', 'tabs', 'onboarding'))
);

-- One layout per screen per workspace. Also the upsert target for the editor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_ui_layouts_ws_screen
  ON public.workspace_ui_layouts (workspace_id, screen);

-- The client read path: every published screen for one workspace, in one hit.
CREATE INDEX IF NOT EXISTS idx_workspace_ui_layouts_published
  ON public.workspace_ui_layouts (workspace_id)
  WHERE published IS NOT NULL;

COMMENT ON TABLE  public.workspace_ui_layouts IS
  'Server-driven UI trees for the client mobile app, one row per workspace+screen.';
COMMENT ON COLUMN public.workspace_ui_layouts.draft IS
  'Editor working copy. Never served to devices.';
COMMENT ON COLUMN public.workspace_ui_layouts.published IS
  'Live tree served to devices. NULL means fall back to the built-in default.';
COMMENT ON COLUMN public.workspace_ui_layouts.published_revision IS
  'Bumped only on publish. Clients cache against it.';


-- Publish history — what was live, when, and who put it there.
--
-- This exists for one reason: rollback. A bad layout is discovered by support
-- ticket, minutes or hours after publish, and the only acceptable answer is
-- "restore the previous one now" rather than "reconstruct it from memory".
CREATE TABLE IF NOT EXISTS public.workspace_ui_layout_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  screen         text NOT NULL,
  revision       integer NOT NULL,
  tree           jsonb NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  note           text,
  published_at   timestamptz NOT NULL DEFAULT now(),
  published_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_workspace_ui_layout_versions_lookup
  ON public.workspace_ui_layout_versions (workspace_id, screen, revision DESC);

COMMENT ON TABLE public.workspace_ui_layout_versions IS
  'Append-only history of published SDUI trees, for rollback.';
