-- 2026-07-04: Custom assessment form builder.
--
-- Lets a workspace author its own intake forms (arbitrary questions + answer
-- types), assign them to clients, and auto-generate a report from responses.
--
-- Reuses the existing pending_review_cards pipeline (assign → client fills →
-- generated_content.client_responses), adding a 'custom_form' card_type and a
-- template_id link, plus a new table that stores the reusable form definitions.

-- 1. Allow the custom-form card type + link back to its template.
ALTER TABLE public.pending_review_cards
  DROP CONSTRAINT IF EXISTS pending_review_cards_card_type_check;

ALTER TABLE public.pending_review_cards
  ADD CONSTRAINT pending_review_cards_card_type_check
  CHECK (card_type IN ('health_assessment', 'stress_card', 'sleep_card', 'action_plan', 'diet_plan', 'custom_form'));

ALTER TABLE public.pending_review_cards
  ADD COLUMN IF NOT EXISTS template_id uuid;

-- 2. Reusable, workspace-owned form definitions.
CREATE TABLE IF NOT EXISTS public.assessment_form_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  -- [{ id, question, type: text|scale|number|yesno|choice|multi, options?, max? }]
  questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by   uuid,
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_form_templates_workspace_idx
  ON public.assessment_form_templates(workspace_id);

COMMENT ON TABLE public.assessment_form_templates IS
  'Workspace-authored custom assessment forms (question definitions).';

-- 3. RLS (defence-in-depth; the NestJS backend uses the service role).
ALTER TABLE public.assessment_form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aft_member_rw ON public.assessment_form_templates;
CREATE POLICY aft_member_rw ON public.assessment_form_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = assessment_form_templates.workspace_id
        AND wm.user_id = auth.uid() AND wm.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = assessment_form_templates.workspace_id
        AND wm.user_id = auth.uid() AND wm.status = 'active'
    )
  );

DROP TRIGGER IF EXISTS assessment_form_templates_touch ON public.assessment_form_templates;
CREATE TRIGGER assessment_form_templates_touch
  BEFORE UPDATE ON public.assessment_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
