-- ============================================================================
-- SIRAH LIFE — Phase 1A.b: add workspace_id to tenant tables.
--
-- For each tenant-scoped table:
--   1. Add `workspace_id uuid` (nullable for now), FK to public.workspaces(id),
--      ON DELETE CASCADE (delete-a-workspace cascades to all its data).
--   2. Add an index on workspace_id.
--
-- Columns are NULLABLE intentionally. Existing rows have NULL workspace_id
-- (i.e. "unowned"). We'll backfill + add NOT NULL in a future migration
-- once real workspaces exist and we know how to assign legacy rows.
--
-- RLS policies for these tables are deferred to a separate migration so
-- this one stays focused on schema shape.
--
-- Skips any table that doesn't exist (defensive — the dev schema has 78
-- models but this list was curated by domain knowledge, not a query).
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Client data
    'clients',
    'client_workflow_state',
    -- Assessments
    'assessments',
    'assessment_audits',
    'assessment_requests',
    -- Meal + nutrition (per-client logs, not global library)
    'meal_logs',
    'meal_cards',
    'meal_compliance',
    'daily_logs',
    'diet_preferences',
    'weekly_plans',
    'weekly_reports',
    -- Programs of work
    'action_plans',
    'follow_ups',
    -- Messaging
    'messages',
    'message_templates',
    'bulk_message_batches',
    -- Scheduling
    'calendar_events',
    -- Lead capture
    'interest_forms',
    'interest_form_submissions',
    -- Workflow / automation
    'workflow_history',
    -- Admin operations
    'admin_notes',
    'admin_requests',
    'pending_review_cards',
    -- Notifications
    'push_subscriptions'
  ];
  added_count int := 0;
  skipped_count int := 0;
  idx_name text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping % — table does not exist', t;
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Add column (no-op if already there)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS workspace_id uuid
         REFERENCES public.workspaces(id) ON DELETE CASCADE',
      t
    );

    -- Add index (no-op if already there)
    idx_name := t || '_workspace_id_idx';
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(workspace_id)',
      idx_name, t
    );

    added_count := added_count + 1;
  END LOOP;

  RAISE NOTICE 'workspace_id added to % tables (% skipped — not in schema)',
    added_count, skipped_count;
END$$;
