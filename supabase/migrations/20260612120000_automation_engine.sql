-- =============================================================================
-- Automation Engine — rules table + run log
--
-- Implements the "Automation" stage of the Enterprise Application Flow.
-- Subscribes to ACTIVITY_RECORDED_EVENT (from the activity log foundation) and
-- evaluates each event against enabled rules for that workspace.
--
-- Rule shape:
--   trigger_event:  '{entity_type}.{action}' — e.g. 'recipe.created',
--                   'client.created', 'meal_log.created'.
--   conditions:     JSONB array of {field, operator, value}; ALL must match
--                   (logical AND). Field paths read from the event row using
--                   dot notation (e.g. 'actor_role', 'payload.is_published').
--   actions:        JSONB array; executed in order. Action types:
--                     - notify.message  → writes a 'notification' activity row
--                                          (surfaces in the Activity feed)
--                     - webhook.post    → outbound POST to a URL
--
-- Runs are immutable — every rule firing writes one automation_runs row with
-- status, latency, and per-action results. The Activity page can drill into
-- the run log to debug why a rule fired (or didn't).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  name                text NOT NULL,
  description         text,
  is_enabled          boolean NOT NULL DEFAULT true,

  trigger_event       text NOT NULL,
  -- Format: '{entity_type}.{action}' OR 'any.{action}' for wildcards.

  conditions          jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions             jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Telemetry — bumped by the executor after each run.
  fire_count          bigint NOT NULL DEFAULT 0,
  last_fired_at       timestamptz,
  last_error          text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_rules_workspace_trigger_idx
  ON public.automation_rules (workspace_id, trigger_event)
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS automation_rules_workspace_idx
  ON public.automation_rules (workspace_id, name);

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  activity_log_id uuid REFERENCES public.activity_logs(id) ON DELETE SET NULL,

  status          text NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  trigger_event   text NOT NULL,

  -- Snapshot of the input event + per-action results.
  input_payload   jsonb,
  action_results  jsonb,
  error_message   text,

  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  latency_ms      int
);

CREATE INDEX IF NOT EXISTS automation_runs_rule_recent_idx
  ON public.automation_runs (rule_id, started_at DESC);

CREATE INDEX IF NOT EXISTS automation_runs_workspace_recent_idx
  ON public.automation_runs (workspace_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_rules_member" ON public.automation_rules;
CREATE POLICY "automation_rules_member"
  ON public.automation_rules
  FOR ALL
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "automation_runs_member_read" ON public.automation_runs;
CREATE POLICY "automation_runs_member_read"
  ON public.automation_runs
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
       WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP TRIGGER IF EXISTS automation_rules_set_updated_at ON public.automation_rules;
CREATE TRIGGER automation_rules_set_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
