-- =============================================================================
-- Activity Log + Application-Flow pipeline foundation
--
-- Implements the "Activity Logging" + "Analytics" stages of the Enterprise
-- Application Flow:
--   Request → Validation → Permission → Business → DB → Automation
--           → Notification → Activity Logging → Analytics → Response
--
-- Two tables:
--   public.activity_logs       — one row per mutation (POST/PATCH/PUT/DELETE),
--                                written by the ActivityLogInterceptor
--   public.workspace_metrics   — per-(workspace, day, metric) rollup
--                                bumped by the AnalyticsHandler event listener
--
-- The interceptor is the single instrumentation point. Every mutation across
-- every controller is logged automatically — no per-service plumbing. The
-- event emitter then fans the log row out to NotificationDispatcher and
-- AnalyticsHandler asynchronously, so handler latency never affects the
-- request path.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy
  workspace_id    uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- nullable: platform-level actions (super admin) have no workspace context

  -- Actor
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      text,
  -- 'super_admin' | 'owner' | 'nutritionist' | 'client' | 'anonymous'

  -- Action
  http_method     text NOT NULL,
  route           text NOT NULL,
  -- Route TEMPLATE (e.g. '/workspaces/me/recipes/:id'), NOT the resolved URL —
  -- so logs aggregate cleanly across thousands of distinct ids.

  entity_type     text,
  -- 'recipe' | 'client' | 'invite' | 'meal_log' | 'food' | ...
  entity_id       text,
  -- the resolved id from req.params, when available

  action          text NOT NULL,
  -- 'create' | 'update' | 'delete' | 'invoke' (catch-all for non-CRUD verbs)

  -- Request context
  request_id      text,
  status_code     int NOT NULL,
  latency_ms      int,
  ip              text,
  user_agent      text,

  -- Optional payload snapshot. PII-redacted by the interceptor before write.
  -- Capped to a reasonable size by the interceptor (typically <= 8KB serialized).
  payload         jsonb,

  -- Error details when status_code >= 400.
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot indexes for the activity feed UIs.
CREATE INDEX IF NOT EXISTS activity_logs_workspace_recent_idx
  ON public.activity_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_actor_recent_idx
  ON public.activity_logs (actor_user_id, created_at DESC);

-- Drill-down: "everything that touched this entity"
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx
  ON public.activity_logs (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Platform-wide super-admin feed (rows where workspace_id is NULL too).
CREATE INDEX IF NOT EXISTS activity_logs_recent_idx
  ON public.activity_logs (created_at DESC);

-- ---------------------------------------------------------------------------

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Workspace members read their workspace's rows
DROP POLICY IF EXISTS "activity_logs_workspace_member_read" ON public.activity_logs;
CREATE POLICY "activity_logs_workspace_member_read"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Inserts go through the service-role connection from the interceptor.
-- No user-facing INSERT policy; an authenticated user cannot synthesize log
-- entries (mass forgery via direct REST would be possible without this).
-- We DO need to allow our backend service-role to write, which it already can.

-- ---------------------------------------------------------------------------
-- workspace_metrics — per-workspace per-day per-metric rollup
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_metrics (
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bucket_date     date NOT NULL,
  metric          text NOT NULL,
  -- 'mutations.total' | 'recipes.created' | 'clients.invited' | ...
  value           bigint NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, bucket_date, metric)
);

CREATE INDEX IF NOT EXISTS workspace_metrics_recent_idx
  ON public.workspace_metrics (workspace_id, bucket_date DESC);

ALTER TABLE public.workspace_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_metrics_member_read" ON public.workspace_metrics;
CREATE POLICY "workspace_metrics_member_read"
  ON public.workspace_metrics
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );
