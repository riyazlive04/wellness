import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { adminApi, type RecordSetupFeeInput } from '@/modules/super-admin/api/admin';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
/** Same fees as backend/src/billing/plans.ts. */
const PLANS: Array<{ key: RecordSetupFeeInput['plan_key']; name: string; fee: number }> = [
  { key: 'starter', name: 'Starter', fee: 4999 },
  { key: 'growth', name: 'Growth', fee: 9999 },
  { key: 'scale_pro', name: 'Scale Pro', fee: 24999 },
];
const METHODS: Array<{ key: RecordSetupFeeInput['method']; name: string }> = [
  { key: 'upi', name: 'UPI' }, { key: 'bank', name: 'Bank transfer' }, { key: 'cash', name: 'Cash' }, { key: 'other', name: 'Other' },
];
const planName = (k: string) => PLANS.find((p) => p.key === k)?.name ?? k;
const today = () => new Date().toLocaleDateString('en-CA');
const field = 'h-9 w-full rounded-lg border border-foreground/10 bg-background px-2.5 text-sm outline-none focus:border-foreground/30';

/**
 * Setup fee for one practice. A fee paid by UPI, bank or cash is recorded
 * here: it marks the plan the practice chose, and Razorpay won't charge that
 * fee again when they subscribe after the trial.
 */
export function SetupFeeCard({ workspaceId, onTrial }: { workspaceId: string; onTrial: boolean }) {
  const qc = useQueryClient();
  const fees = useQuery({ queryKey: ['admin', 'setup-fees', workspaceId], queryFn: () => adminApi.setupFees(workspaceId) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ plan_key: 'starter' as RecordSetupFeeInput['plan_key'], amount: '4999', method: 'upi' as RecordSetupFeeInput['method'], reference: '', paid_at: today() });

  const done = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'setup-fees', workspaceId] });
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };
  const record = useMutation({
    mutationFn: () => adminApi.recordSetupFee(workspaceId, {
      plan_key: form.plan_key, amount_inr: Math.round(Number(form.amount)), method: form.method,
      reference: form.reference.trim() || undefined, paid_at: form.paid_at ? new Date(`${form.paid_at}T12:00:00`).toISOString() : undefined,
    }),
    onSuccess: () => { toast.success('Setup fee recorded.'); setOpen(false); done(); },
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (feeId: string) => adminApi.removeSetupFee(workspaceId, feeId),
    onSuccess: () => { toast.success('Removed.'); done(); },
    onError: onErr,
  });

  const rows = fees.data ?? [];
  const chosen = rows[0]?.plan_key;
  const amountOk = Number(form.amount) >= 1;

  return (
    <Glass className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Setup fee</div>
          <p className="mt-1 text-sm text-foreground/70">
            {chosen
              ? onTrial ? `Paid for ${planName(chosen)}. After the trial they pay the ${planName(chosen)} plan; the setup fee won’t be charged again.` : `Paid for ${planName(chosen)}.`
              : 'Not paid yet. If they paid by UPI, bank or cash, record it here.'}
          </p>
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-teal-50 hover:bg-teal-800">
            <Plus className="h-3.5 w-3.5" />Record payment
          </button>
        )}
      </div>

      {open && (
        <form
          className="grid gap-3 rounded-xl bg-foreground/[0.03] p-4 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); if (amountOk) record.mutate(); }}
        >
          <label className="grid gap-1 text-xs font-medium">Plan they chose
            <select className={field} value={form.plan_key} onChange={(e) => { const p = PLANS.find((x) => x.key === e.target.value)!; setForm((f) => ({ ...f, plan_key: p.key, amount: String(p.fee) })); }}>
              {PLANS.map((p) => <option key={p.key} value={p.key}>{p.name} (setup {INR.format(p.fee)})</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">Amount paid (₹)
            <input className={field} inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))} />
          </label>
          <label className="grid gap-1 text-xs font-medium">Paid by
            <select className={field} value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as RecordSetupFeeInput['method'] }))}>
              {METHODS.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">Date paid
            <input type="date" className={field} max={today()} value={form.paid_at} onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-medium sm:col-span-2">Reference (optional)
            <input className={field} maxLength={120} placeholder="UPI transaction ID, bank ref…" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-foreground/70 hover:bg-foreground/[0.05]">Cancel</button>
            <button type="submit" disabled={!amountOk || record.isPending} className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-4 py-1.5 text-xs font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-50">
              {record.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
            </button>
          </div>
        </form>
      )}

      {fees.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-foreground/40" /> : rows.length > 0 && (
        <ul className="divide-y divide-foreground/[0.05] rounded-xl border border-foreground/[0.06] text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <b className="font-semibold">{INR.format(r.amount_inr)}</b> <span className="text-foreground/60">· {planName(r.plan_key)}</span>
                <div className="truncate text-xs text-foreground/50">
                  {new Date(r.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.manual ? METHODS.find((m) => m.key === r.method)?.name ?? 'By hand' : 'Razorpay'}{r.reference ? ` · ${r.reference}` : ''}
                </div>
              </div>
              {r.manual && (
                <button type="button" aria-label="Remove" disabled={remove.isPending}
                  onClick={() => { if (confirm(`Remove this ${INR.format(r.amount_inr)} setup fee? Only do this if it was recorded by mistake.`)) remove.mutate(r.id); }}
                  className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-rose-500/10 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

function onErr(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : (err as Error).message);
}
