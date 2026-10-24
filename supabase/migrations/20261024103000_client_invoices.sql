-- Invoices a PRACTICE issues to its own clients.
--
-- Not to be confused with public.invoices, which is NUSI billing the practice.
-- This is the other direction: a nutritionist charging their client for
-- consultations, diet plans or products.
--
-- NUSI does not collect this money. The client pays the practice directly by
-- UPI, cash or bank, and the practice marks the invoice paid. That keeps NUSI
-- out of handling other people's funds, which would need Razorpay Route and a
-- settlement process, and keeps the practice's GST their own affair.

CREATE TABLE IF NOT EXISTS public.practice_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  /** Per-practice running number, e.g. 7 renders as INV-0007. */
  number        int  NOT NULL,

  /**
   * draft  - being written, the client cannot see it
   * sent   - issued to the client, awaiting payment
   * paid   - the practice confirmed the money arrived
   * void   - cancelled. Kept, never deleted: a GST invoice number that
   *          vanishes leaves a hole in the practice's sequence.
   */
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'paid', 'void')),

  /** Line items: [{ description, quantity, unit_paise }]. Free text by design. */
  items         jsonb NOT NULL DEFAULT '[]'::jsonb,

  /** Totals in paise, computed server-side from items - never trusted from the client. */
  subtotal_paise int NOT NULL DEFAULT 0,
  /** Whole percent, 0 when the practice is not GST-registered. */
  tax_percent    numeric(5,2) NOT NULL DEFAULT 0,
  tax_paise      int NOT NULL DEFAULT 0,
  total_paise    int NOT NULL DEFAULT 0,

  notes         text,
  issued_at     timestamptz,
  due_at        timestamptz,
  paid_at       timestamptz,
  /** How the practice says they were paid: upi / cash / bank / card / other. */
  paid_method   text,
  paid_note     text,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- A practice's invoice numbers must be unique and gapless to itself. The
  -- constraint is what makes concurrent creates safe: two nutritionists in the
  -- same practice clicking "New invoice" at once cannot both take number 8.
  CONSTRAINT practice_invoices_number_unique UNIQUE (workspace_id, number)
);

COMMENT ON TABLE public.practice_invoices IS
  'Invoices a practice issues to its own clients. NUSI does not collect this money; the practice marks them paid.';

-- The practice's own list, newest first.
CREATE INDEX IF NOT EXISTS practice_invoices_workspace_idx
  ON public.practice_invoices (workspace_id, created_at DESC);

-- A client opening "my invoices" - only ones actually issued to them.
CREATE INDEX IF NOT EXISTS practice_invoices_client_idx
  ON public.practice_invoices (client_id, created_at DESC)
  WHERE status <> 'draft';

-- Keep updated_at honest without every writer remembering to set it.
CREATE OR REPLACE FUNCTION public.touch_practice_invoice()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS practice_invoices_touch ON public.practice_invoices;
CREATE TRIGGER practice_invoices_touch
  BEFORE UPDATE ON public.practice_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_practice_invoice();
