-- Reports feature (Module: PDFs, summaries & audits) — generation history.
-- The PDF itself is rendered client-side (jsPDF) and downloaded; this table is
-- the durable record of every generated report so the "Generated this month"
-- KPI and the "Recently generated" list become live instead of mock.
-- Additive only (CREATE TABLE IF NOT EXISTS) — safe to run on prod.
CREATE TABLE IF NOT EXISTS public.workspace_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind              text NOT NULL,            -- client_health | client_monthly | program_performance | workspace_digest | billing_gst
  template_name     text NOT NULL,
  target_label      text,                     -- "Priya Sharma" / program name / NULL for workspace-wide
  target_id         uuid,                     -- client_id or program template id, nullable
  period_label      text NOT NULL DEFAULT '', -- "Jun 2026" / "Last 30 days"
  status            text NOT NULL DEFAULT 'ready',  -- queued | generating | ready | failed
  page_count        int,
  size_kb           int,
  generated_by      uuid,                     -- auth.users.id
  generated_by_label text,                    -- snapshot of the generator's email at create time
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_reports_ws
  ON public.workspace_reports(workspace_id, created_at DESC);
