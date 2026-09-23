-- Structured lab results.
--
-- The `lab_results` starter form (backend/src/clients/starter-forms.ts) already
-- collects eight panels — glycaemic, lipid, thyroid, vitamins, CBC, LFT, KFT and
-- a hormonal panel — but it stores them as free-text table answers inside
-- pending_review_cards.generated_content. That is fine for reading one report and
-- useless for everything else: you cannot trend HbA1c across a 12-week program,
-- flag an out-of-range value, or surface any of it on a report.
--
-- This table is the typed destination. Rows arrive either by importing a
-- submitted lab_results card (source='form') or by a practitioner typing them in
-- (source='manual'). The raw text the client entered is kept alongside the parsed
-- number so a bad parse is always auditable against what the report actually said.

CREATE TABLE IF NOT EXISTS public.client_lab_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  panel          text NOT NULL,          -- glycaemic | lipid | thyroid | vitamins | cbc | lft | kft | hormonal | other
  marker_code    text NOT NULL,          -- stable slug, e.g. 'hba1c' — see lab-markers.ts
  marker_label   text NOT NULL,          -- display label as printed/known, e.g. 'HbA1c'

  value          numeric,                -- parsed numeric result; NULL when unparseable
  value_text     text,                   -- raw result exactly as entered ('<0.1', '6.4 %', 'Negative')
  unit           text,

  -- Reference range as the client's OWN lab printed it. Deliberately not a
  -- global constant: ranges vary by lab, assay and population, and flagging a
  -- value against someone else's range is worse than not flagging it at all.
  ref_low        numeric,
  ref_high       numeric,
  ref_text       text,

  taken_on       date NOT NULL,
  lab_name       text,
  fasting        boolean,

  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'form')),
  source_card_id uuid REFERENCES public.pending_review_cards(id) ON DELETE SET NULL,
  notes          text,

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The trend query: one marker for one client, oldest→newest.
CREATE INDEX IF NOT EXISTS client_lab_results_trend_idx
  ON public.client_lab_results (client_id, marker_code, taken_on DESC);

-- Tenant-scoped listing / analytics.
CREATE INDEX IF NOT EXISTS client_lab_results_ws_idx
  ON public.client_lab_results (workspace_id, taken_on DESC);

-- Re-importing the same assessment card must not duplicate rows. Only applies to
-- form imports; manual entries are intentionally free to repeat (two tests on one
-- day from different labs is legitimate).
CREATE UNIQUE INDEX IF NOT EXISTS client_lab_results_import_uq
  ON public.client_lab_results (source_card_id, marker_code, taken_on)
  WHERE source_card_id IS NOT NULL;

-- RLS: app enforces workspace scope server-side (RolesGuard + assertClientInWorkspace);
-- enable RLS as defence-in-depth, consistent with the rest of the schema.
ALTER TABLE public.client_lab_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can read their own lab results" ON public.client_lab_results;
CREATE POLICY "Clients can read their own lab results"
  ON public.client_lab_results FOR SELECT
  USING ( public.is_own_client(client_id::text) );
