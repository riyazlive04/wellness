-- Partial payments and instalments on a practice's invoices.
--
-- Until now an invoice was paid or it was not: one `paid_at`, one
-- `paid_method`. Real practices take a deposit and the rest later, or split a
-- programme over three months, and had nowhere to put it - so they either
-- marked a half-paid invoice "paid" (and lost what was still owed) or left it
-- "sent" (and lost the record of money that had arrived).
--
-- NUSI still does not collect this money. The client pays the practice
-- directly and the practice records what landed; these tables are a ledger,
-- not a payment gateway. See the header of practice_invoices.

-- ── What was actually received ───────────────────────────────────────
--
-- Append-only in spirit: each row is one payment that reached the practice.
-- Deleting a row is how a mis-entry is undone, which is why there is no
-- "amount corrected" column - the history of a payment is the row itself.
CREATE TABLE IF NOT EXISTS public.practice_invoice_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.practice_invoices(id) ON DELETE CASCADE,
  -- Denormalised so the practice's own "money in" reports never have to join
  -- through invoices, and so RLS can scope on it directly.
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  /** Positive paise. A refund is not a negative payment - see refunds below. */
  amount_paise  int  NOT NULL CHECK (amount_paise > 0),

  /** upi / cash / bank / card / cheque / other - the practice's own words. */
  method        text,
  /** Their reference: a UPI ref, cheque number, "handed over at the clinic". */
  reference     text,
  note          text,

  /** When the money arrived, which is not when it was typed in. */
  received_at   timestamptz NOT NULL DEFAULT now(),

  /**
   * Which instalment this settles, when the invoice has a schedule. NULL for a
   * plain part-payment against the invoice as a whole.
   */
  instalment_id uuid,

  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.practice_invoice_payments IS
  'Money a practice received against one of its invoices. A ledger of what the practice collected itself - NUSI does not hold these funds.';

CREATE INDEX IF NOT EXISTS practice_invoice_payments_invoice_idx
  ON public.practice_invoice_payments (invoice_id, received_at);

-- The practice's "what came in this month" view.
CREATE INDEX IF NOT EXISTS practice_invoice_payments_workspace_idx
  ON public.practice_invoice_payments (workspace_id, received_at DESC);

-- ── What was agreed to be paid, and when ─────────────────────────────
--
-- An EMI schedule. Separate from payments because the plan and the reality
-- diverge: an instalment can be late, short, or paid in two goes, and the
-- schedule still says what was promised.
CREATE TABLE IF NOT EXISTS public.practice_invoice_instalments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.practice_invoices(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  /** 1-based position in the schedule: instalment 2 of 3. */
  seq           int  NOT NULL CHECK (seq > 0),
  amount_paise  int  NOT NULL CHECK (amount_paise > 0),
  due_at        timestamptz NOT NULL,

  /**
   * Extending an instalment is a first-class action - a client asks for two
   * more weeks and the practice should not have to rebuild the schedule. The
   * original date is kept so "has this been extended, and how often" stays
   * answerable.
   */
  original_due_at timestamptz,
  extended_count  int NOT NULL DEFAULT 0,

  note          text,

  /**
   * Reminder bookkeeping. Two separate marks because the two reminders are
   * different messages at different times, and sending one must not suppress
   * the other.
   *
   * Cleared when the due date is extended: a client given two more weeks
   * should be reminded again against the new date, not treated as already
   * warned. That is the whole point of these being nullable marks rather than
   * a boolean "reminded".
   */
  reminded_before_at timestamptz,
  reminded_due_at    timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_invoice_instalments_seq_unique UNIQUE (invoice_id, seq)
);

COMMENT ON TABLE public.practice_invoice_instalments IS
  'An EMI schedule on one invoice: what the client agreed to pay and by when. Reality lives in practice_invoice_payments.';

CREATE INDEX IF NOT EXISTS practice_invoice_instalments_invoice_idx
  ON public.practice_invoice_instalments (invoice_id, seq);

-- Due-date reminders are driven off this: every unpaid instalment falling due
-- in the window, across all practices, in one scan.
CREATE INDEX IF NOT EXISTS practice_invoice_instalments_due_idx
  ON public.practice_invoice_instalments (due_at);

-- A payment that names an instalment must name one on the same invoice. The FK
-- is added after both tables exist because they reference each other.
ALTER TABLE public.practice_invoice_payments
  DROP CONSTRAINT IF EXISTS practice_invoice_payments_instalment_fk;
ALTER TABLE public.practice_invoice_payments
  ADD CONSTRAINT practice_invoice_payments_instalment_fk
  FOREIGN KEY (instalment_id)
  REFERENCES public.practice_invoice_instalments(id) ON DELETE SET NULL;

-- Moving a due date un-sends its reminders, wherever the move came from.
--
-- In the trigger rather than in the service because there are two writers
-- already (editing an invoice, extending an instalment) and any future one
-- would have to remember; a client given more time must be reminded again
-- against the new date.
CREATE OR REPLACE FUNCTION public.reset_due_reminders()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.due_at IS DISTINCT FROM OLD.due_at THEN
    NEW.reminded_before_at := NULL;
    NEW.reminded_due_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS practice_invoice_instalments_touch ON public.practice_invoice_instalments;
CREATE TRIGGER practice_invoice_instalments_touch
  BEFORE UPDATE ON public.practice_invoice_instalments
  FOR EACH ROW EXECUTE FUNCTION public.reset_due_reminders();

-- The invoice's own due date behaves the same. This replaces the plain
-- touch_practice_invoice trigger, which only set updated_at.
DROP TRIGGER IF EXISTS practice_invoices_touch ON public.practice_invoices;
CREATE TRIGGER practice_invoices_touch
  BEFORE UPDATE ON public.practice_invoices
  FOR EACH ROW EXECUTE FUNCTION public.reset_due_reminders();

-- ── Reminder marks on the invoice itself ─────────────────────────────
--
-- For an invoice with a plain due date and no schedule. Same two-mark shape as
-- the instalments, and cleared the same way if the due date moves.
ALTER TABLE public.practice_invoices
  ADD COLUMN IF NOT EXISTS reminded_before_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_due_at    timestamptz;

-- Drives the reminder sweep: unpaid, issued, with a due date.
CREATE INDEX IF NOT EXISTS practice_invoices_due_idx
  ON public.practice_invoices (due_at)
  WHERE status = 'sent' AND due_at IS NOT NULL;

-- ── Keeping the invoice's status honest ──────────────────────────────
--
-- `status` and `paid_at` stay on practice_invoices because the whole app reads
-- them, but they must now follow the ledger rather than being set by hand. If
-- a human can mark an invoice paid while the ledger says half of it is owed,
-- the two disagree and the practice is told different things on different
-- screens - the same class of fault as an invoice that could not be un-paid.
--
-- So: recording payments that cover the total marks it paid; removing or
-- reducing them below the total puts it back to sent. A draft is left alone
-- (money against an unissued invoice is the practice's own bookkeeping order,
-- not ours to reinterpret) and a void invoice is never revived.
CREATE OR REPLACE FUNCTION public.sync_practice_invoice_paid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv        public.practice_invoices;
  paid_total int;
  latest     public.practice_invoice_payments;
  target     uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  SELECT * INTO inv FROM public.practice_invoices WHERE id = target;
  IF NOT FOUND OR inv.status IN ('draft', 'void') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(sum(amount_paise), 0) INTO paid_total
    FROM public.practice_invoice_payments WHERE invoice_id = target;

  IF paid_total >= inv.total_paise AND inv.total_paise > 0 THEN
    -- Paid in full. Date and method come from the payment that closed it, so
    -- the invoice agrees with its own ledger instead of saying "now".
    SELECT * INTO latest FROM public.practice_invoice_payments
      WHERE invoice_id = target ORDER BY received_at DESC, created_at DESC LIMIT 1;
    UPDATE public.practice_invoices
       SET status = 'paid',
           paid_at = latest.received_at,
           paid_method = COALESCE(latest.method, paid_method)
     WHERE id = target AND status <> 'paid';
  ELSE
    -- Short of the total: it is owed again, whatever it said before.
    UPDATE public.practice_invoices
       SET status = 'sent', paid_at = NULL
     WHERE id = target AND status = 'paid';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS practice_invoice_payments_sync ON public.practice_invoice_payments;
CREATE TRIGGER practice_invoice_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.practice_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_practice_invoice_paid();

-- ── Backfill ─────────────────────────────────────────────────────────
--
-- Every invoice already marked paid becomes one payment for its full amount,
-- so "amount received" is answerable for the practice's whole history and not
-- just for invoices raised from today. Without this, an existing paid invoice
-- would read as fully unpaid the moment the UI starts trusting the ledger.
INSERT INTO public.practice_invoice_payments
  (invoice_id, workspace_id, amount_paise, method, note, received_at, recorded_by)
SELECT i.id, i.workspace_id, i.total_paise,
       i.paid_method,
       'Recorded before part-payments existed',
       COALESCE(i.paid_at, i.updated_at),
       i.created_by
  FROM public.practice_invoices i
 WHERE i.status = 'paid'
   AND i.total_paise > 0
   AND NOT EXISTS (SELECT 1 FROM public.practice_invoice_payments p
                    WHERE p.invoice_id = i.id);
