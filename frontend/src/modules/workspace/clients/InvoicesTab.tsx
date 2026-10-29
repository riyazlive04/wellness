import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Loader2, Pencil, Plus, Send, Trash2, Wallet, X, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import {
  clientsApi,
  type InvoiceLine,
  type PracticeInvoice,
} from '@/modules/workspace/api/clients';
import { generatePracticeInvoicePdf } from './practiceInvoicePdf';
import { cn } from '@/lib/utils';

/** ₹ with Indian grouping. Paise are shown only when they are not zero. */
const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS: Record<PracticeInvoice['status'], { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'border-foreground/15 bg-foreground/[0.04] text-foreground/60' },
  sent: { label: 'Sent', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200' },
  paid: { label: 'Paid', cls: 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200' },
  void: { label: 'Void', cls: 'border-foreground/15 bg-foreground/[0.04] text-foreground/40 line-through' },
};

/**
 * Invoices this practice has issued to one client.
 *
 * NUSI does not take the money: the client pays the practice directly and the
 * practice records it here. The PDF carries the practice's own name, logo and
 * GSTIN, because it is their document, not ours.
 */
export function InvoicesTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const [building, setBuilding] = useState(false);
  /** The invoice open in the builder for correction, if any. */
  const [editing, setEditing] = useState<PracticeInvoice | null>(null);

  const q = useQuery({
    queryKey: ['client', clientId, 'invoices'],
    queryFn: () => clientsApi.listInvoices(clientId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId, 'invoices'] });

  const send = useMutation({
    mutationFn: (id: string) => clientsApi.sendInvoice(id),
    onSuccess: () => { invalidate(); toast.success(`Sent. ${clientName.split(' ')[0]} can see it now.`); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send it.'),
  });

  const paid = useMutation({
    mutationFn: ({ id, method }: { id: string; method: string }) =>
      clientsApi.markInvoicePaid(id, { method }),
    onSuccess: () => { invalidate(); toast.success('Marked as paid.'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not mark it paid.'),
  });

  const unpay = useMutation({
    mutationFn: (id: string) => clientsApi.unmarkInvoicePaid(id),
    onSuccess: () => { void q.refetch(); toast.success('Payment undone - the invoice is unpaid again.'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not undo it.'),
  });

  const voidIt = useMutation({
    mutationFn: (id: string) => clientsApi.voidInvoice(id),
    onSuccess: () => { invalidate(); toast.success('Voided. It stays on the list for your records.'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not void it.'),
  });

  async function download(inv: PracticeInvoice) {
    try {
      await generatePracticeInvoicePdf(inv, { clientName });
    } catch {
      toast.error('Could not build the PDF.');
    }
  }

  const rows = q.data ?? [];
  const outstanding = rows
    .filter((i) => i.status === 'sent')
    .reduce((sum, i) => sum + i.total_paise, 0);

  return (
    <div className="space-y-4">
      <Glass className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-foreground/[0.06] px-5 py-3.5">
          <FileText className="h-4 w-4 text-teal-700 dark:text-teal-300" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Invoices
          </span>
          {outstanding > 0 && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
              {inr(outstanding)} outstanding
            </span>
          )}
          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-teal-50 hover:bg-teal-800"
          >
            <Plus className="h-3.5 w-3.5" /> New invoice
          </button>
        </div>

        <p className="border-b border-foreground/[0.06] px-5 py-2.5 text-[11px] leading-relaxed text-foreground/55">
          You collect the money yourself — by UPI, cash or bank. NUSI only makes the
          invoice and keeps the record; mark it paid once it reaches you.
        </p>

        {q.isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-foreground/50">
            No invoices yet for {clientName.split(' ')[0]}.
          </p>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {rows.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{inv.display_number}</span>
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]',
                      STATUS[inv.status].cls,
                    )}>
                      {STATUS[inv.status].label}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-foreground/55">
                    {inv.items.length} line{inv.items.length === 1 ? '' : 's'}
                    {inv.items[0] ? ` · ${inv.items[0].description}` : ''}
                    {inv.paid_at ? ` · paid ${new Date(inv.paid_at).toLocaleDateString('en-IN')}` : ''}
                  </div>
                </div>

                <span className="flex-shrink-0 text-sm font-semibold tabular-nums">
                  {inr(inv.total_paise)}
                </span>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    type="button" title="Download PDF" onClick={() => void download(inv)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>

                  {/* Correct any invoice that is not voided - including one
                      already sent or paid. A wrong amount on a sent invoice
                      used to mean voiding it and re-issuing, which burns a
                      number out of the practice's own run. */}
                  {inv.status !== 'void' && (
                    <button
                      type="button" title="Edit" onClick={() => setEditing(inv)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {inv.status === 'draft' && (
                    <button
                      type="button" onClick={() => send.mutate(inv.id)} disabled={send.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-foreground/15 px-2.5 py-1 text-[11px] font-semibold text-foreground/80 hover:bg-foreground/[0.05] disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" /> Send
                    </button>
                  )}

                  {inv.status === 'sent' && (
                    <button
                      type="button"
                      onClick={() => paid.mutate({ id: inv.id, method: 'upi' })}
                      disabled={paid.isPending}
                      className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-40"
                    >
                      <Wallet className="h-3 w-3" /> Mark paid
                    </button>
                  )}

                  {/* Undo a mis-click. Marking paid used to be a one-way
                      door: the only way back was voiding a real invoice,
                      which loses its number from the practice's own run. */}
                  {inv.status === 'paid' && (
                    <button
                      type="button"
                      title="Recorded by mistake?"
                      disabled={unpay.isPending}
                      onClick={() => {
                        if (window.confirm(`Undo the payment on ${inv.display_number}? It goes back to unpaid.`)) {
                          unpay.mutate(inv.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-foreground/12 px-2.5 py-1 text-[11px] font-semibold text-foreground/70 hover:bg-foreground/[0.05] disabled:opacity-40"
                    >
                      <Undo2 className="h-3 w-3" /> Not paid
                    </button>
                  )}

                  {inv.status !== 'paid' && inv.status !== 'void' && (
                    <button
                      type="button" title="Void"
                      onClick={() => {
                        if (window.confirm(`Void ${inv.display_number}? It stays on the list for your records.`)) {
                          voidIt.mutate(inv.id);
                        }
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Glass>

      {(building || editing) && (
        <InvoiceBuilder
          // Remount when a different invoice is opened, so the form's initial
          // state is taken from it rather than kept from the last one.
          key={editing?.id ?? 'new'}
          clientId={clientId}
          clientName={clientName}
          existing={editing ?? undefined}
          onClose={() => { setBuilding(false); setEditing(null); }}
          onSaved={() => { setBuilding(false); setEditing(null); invalidate(); }}
        />
      )}
    </div>
  );
}

// ── Builder ──────────────────────────────────────────────────────────

const BLANK: InvoiceLine = { description: '', quantity: 1, unit_paise: 0 };

/** Common things a nutritionist bills for, so the first line is one click. */
const PRESETS = ['Consultation', 'Follow-up consultation', 'Diet plan', 'Monthly programme'];

function InvoiceBuilder({
  clientId, clientName, existing, onClose, onSaved,
}: {
  clientId: string;
  clientName: string;
  /** Absent = new invoice. Present = correct this one, whatever its status. */
  existing?: PracticeInvoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!existing;
  const [lines, setLines] = useState<InvoiceLine[]>(
    existing?.items.length ? existing.items.map((l) => ({ ...l })) : [{ ...BLANK }],
  );
  const [taxPercent, setTaxPercent] = useState(existing?.tax_percent ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [terms, setTerms] = useState(existing?.terms ?? '');
  // Terms are usually the practice default and want no attention, so the box
  // stays folded away unless this invoice actually carries something.
  const [showTerms, setShowTerms] = useState(!!existing?.terms);

  const create = useMutation({
    mutationFn: (sendNow: boolean) => {
      const body = {
        items: lines.filter((l) => l.description.trim() && l.unit_paise > 0),
        tax_percent: taxPercent,
        // '' rather than undefined: the server reads an omitted field as
        // "keep" and a blank one as "clear", so emptying the box must send
        // the blank through. On create there is nothing to keep, but a blank
        // terms must not be mistaken for "use the practice default" either -
        // only an untouched box means that.
        notes: editing ? notes.trim() : notes.trim() || undefined,
        ...(editing || showTerms ? { terms: terms.trim() } : {}),
      };
      const saved = existing
        ? clientsApi.updateInvoice(existing.id, body)
        : clientsApi.createInvoice(clientId, body);
      return saved.then((inv) => (sendNow ? clientsApi.sendInvoice(inv.id) : inv));
    },
    onSuccess: (_r, sendNow) => {
      toast.success(
        editing
          ? `${existing?.display_number} updated.`
          : sendNow
            ? `Invoice sent to ${clientName.split(' ')[0]}.`
            : 'Draft saved.',
      );
      onSaved();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save the invoice.'),
  });

  const set = (i: number, patch: Partial<InvoiceLine>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const valid = lines.filter((l) => l.description.trim() && l.unit_paise > 0);
  const subtotal = valid.reduce((s, l) => s + l.quantity * l.unit_paise, 0);
  const tax = taxPercent > 0 ? Math.round((subtotal * taxPercent) / 100) : 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm">
      <Glass variant="heavy" className="flex max-h-[90vh] w-full max-w-2xl flex-col p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {editing ? `Edit ${existing?.display_number}` : 'New invoice'}
            </h2>
            <p className="mt-0.5 text-xs text-foreground/60">
              For {clientName}
              {editing && existing?.status === 'paid'
                ? ' · already marked paid — the amount will change on your records'
                : editing && existing?.status === 'sent'
                  ? ' · already sent — download the PDF again afterwards'
                  : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                value={line.description}
                onChange={(e) => set(i, { description: e.target.value })}
                placeholder="What is this for?"
                className="min-w-0 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
              />
              <input
                type="number" min={1} max={999} value={line.quantity}
                onChange={(e) => set(i, { quantity: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                aria-label="Quantity"
                className="w-16 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-2 py-2 text-center text-sm tabular-nums focus:border-teal-400/60 focus:outline-none"
              />
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-foreground/45">₹</span>
                <input
                  type="number" min={0} step="0.01"
                  value={line.unit_paise ? line.unit_paise / 100 : ''}
                  onChange={(e) =>
                    // Rupees in the box, paise in the model: a float amount
                    // reaching the server is how a total stops adding up.
                    set(i, { unit_paise: Math.round(Number(e.target.value || 0) * 100) })
                  }
                  placeholder="0"
                  aria-label="Amount in rupees"
                  className="w-28 rounded-xl border border-foreground/10 bg-foreground/[0.03] py-2 pl-6 pr-2 text-right text-sm tabular-nums focus:border-teal-400/60 focus:outline-none"
                />
              </div>
              {lines.length > 1 && (
                <button
                  type="button" title="Remove line"
                  onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                  className="mt-1 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-foreground/40 hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, { ...BLANK }])}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1.5 text-xs text-foreground/75 hover:bg-foreground/[0.05]"
            >
              <Plus className="h-3 w-3" /> Add line
            </button>
            {PRESETS.map((p) => (
              <button
                key={p} type="button"
                onClick={() =>
                  setLines((ls) => {
                    const last = ls[ls.length - 1];
                    // Fill the empty line rather than adding a second one.
                    if (last && !last.description.trim()) {
                      return ls.map((l, n) => (n === ls.length - 1 ? { ...l, description: p } : l));
                    }
                    return [...ls, { ...BLANK, description: p }];
                  })
                }
                className="rounded-full border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1 text-[11px] text-foreground/60 hover:bg-foreground/[0.05]"
              >
                + {p}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes for the client (payment details, thanks, anything)"
            className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
          />

          {/* Terms & conditions. Left alone, a new invoice inherits the
              practice default from Settings → Branding, so most invoices need
              nothing here - this is the per-invoice override. */}
          {showTerms ? (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.16em] text-foreground/55">
                Terms &amp; conditions
              </label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Payment terms, cancellation policy, refund rules…"
                className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/60 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-foreground/45">
                {editing
                  ? 'Printed on this invoice only. Clear the box to print none.'
                  : 'Printed on this invoice only. Leave blank to print none.'}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/60 underline decoration-foreground/20 underline-offset-4 hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Terms &amp; conditions for this invoice
            </button>
          )}

          <label className="flex items-center gap-2 text-xs text-foreground/65">
            <input
              type="checkbox"
              checked={taxPercent > 0}
              onChange={(e) => setTaxPercent(e.target.checked ? 18 : 0)}
              className="h-3.5 w-3.5 accent-teal-600"
            />
            Add 18% GST — only if your practice is GST-registered
          </label>
        </div>

        <div className="mt-4 border-t border-foreground/[0.06] pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground/60">Subtotal</span>
            <span className="tabular-nums">{inr(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-foreground/60">GST ({taxPercent}%)</span>
              <span className="tabular-nums">{inr(tax)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{inr(subtotal + tax)}</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button" onClick={onClose}
              className="rounded-full border border-foreground/10 px-4 py-2 text-sm hover:bg-foreground/[0.04]"
            >
              Cancel
            </button>
            {/* An invoice already sent or paid keeps its status when corrected:
                re-sending it is a separate decision, and there is no draft to
                go back to. Only a draft still offers both. */}
            {editing && existing?.status !== 'draft' ? (
              <button
                type="button"
                disabled={valid.length === 0 || create.isPending}
                onClick={() => create.mutate(false)}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-40"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={valid.length === 0 || create.isPending}
                  onClick={() => create.mutate(false)}
                  className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium hover:bg-foreground/[0.05] disabled:opacity-40"
                >
                  {editing ? 'Save changes' : 'Save as draft'}
                </button>
                <button
                  type="button"
                  disabled={valid.length === 0 || create.isPending}
                  onClick={() => create.mutate(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-40"
                >
                  {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Save &amp; send
                </button>
              </>
            )}
          </div>
        </div>
      </Glass>
    </div>
  );
}
