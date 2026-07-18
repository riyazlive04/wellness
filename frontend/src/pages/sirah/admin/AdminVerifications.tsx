import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BadgeCheck, Clock, XCircle, ShieldCheck, Loader2, Download, FileText, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { verificationApi, type AdminVerification, type VerificationStatus } from '@/modules/workspace/api/verification';
import { cn } from '@/lib/utils';

const FILTERS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'unsubmitted', label: 'Awaiting' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function AdminVerifications() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['admin', 'verifications', filter],
    queryFn: () => verificationApi.adminList(filter === 'all' ? undefined : filter),
  });

  const items = listQ.data ?? [];
  const active = useMemo(() => items.find((v) => v.workspace_id === selected) ?? null, [items, selected]);

  const decideMut = useMutation({
    mutationFn: ({ id, decision, notes }: { id: string; decision: 'verified' | 'rejected'; notes?: string }) =>
      verificationApi.adminDecide(id, decision, notes),
    onSuccess: (_r, vars) => {
      toast.success(vars.decision === 'verified' ? 'Marked verified' : 'Rejected');
      qc.invalidateQueries({ queryKey: ['admin', 'verifications'] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not save decision.'),
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
      <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate">
        <motion.div variants={fadeUp} className="mb-6">
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">Trust &amp; safety</span>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight md:text-4xl">
            <ShieldCheck className="h-7 w-7 text-emerald-500" /> Practitioner verification
          </h1>
          <p className="mt-1 text-sm text-foreground/60">Review and approve workspace owners' credentials.</p>
        </motion.div>

        <motion.div variants={fadeUp} className="mb-4 flex gap-1 rounded-full bg-foreground/[0.04] p-1 w-fit">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => { setFilter(f.key); setSelected(null); }}
              className={cn('rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                filter === f.key ? 'bg-foreground/[0.08] text-foreground' : 'text-foreground/55 hover:text-foreground/85')}>
              {f.label}
            </button>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
          {/* Queue */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              {listQ.isLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-foreground/55"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center text-sm text-foreground/55">Nothing here.</div>
              ) : (
                <ul className="divide-y divide-foreground/[0.05]">
                  {items.map((v) => (
                    <li key={v.workspace_id}>
                      <button type="button" onClick={() => setSelected(v.workspace_id)}
                        className={cn('flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-foreground/[0.03]',
                          selected === v.workspace_id && 'bg-foreground/[0.05]')}>
                        <StatusDot status={v.status} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{v.workspace_name || v.legal_name || 'Workspace'}</div>
                          <div className="truncate text-[11px] text-foreground/55">{v.professional_title || '-'}{v.registration_number ? ` · ${v.registration_number}` : ''}</div>
                        </div>
                        <StatusChip status={v.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Glass>
          </motion.div>

          {/* Detail / review */}
          <motion.div variants={fadeUp}>
            {active ? (
              <ReviewPanel
                key={active.workspace_id}
                v={active}
                busy={decideMut.isPending}
                onDecide={(decision, notes) => decideMut.mutate({ id: active.workspace_id, decision, notes })}
              />
            ) : (
              <Glass className="flex h-full min-h-[220px] items-center justify-center p-8 text-center text-sm text-foreground/50">
                Select a submission to review.
              </Glass>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function ReviewPanel({ v, busy, onDecide }: { v: AdminVerification; busy: boolean; onDecide: (d: 'verified' | 'rejected', notes?: string) => void }) {
  const [notes, setNotes] = useState('');
  const awaiting = v.status === 'unsubmitted';
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-semibold">{v.workspace_name || 'Workspace'}</div>
        <StatusChip status={v.status} />
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Detail label="Legal / business name" value={v.legal_name} />
        <Detail label="Professional title" value={v.professional_title} />
        <Detail label="Qualifications" value={v.qualifications} />
        <Detail label="Registration / license" value={v.registration_number} />
        <Detail label="Experience" value={v.experience_years != null ? `${v.experience_years} yrs` : null} />
        <Detail label="PAN" value={v.pan} />
        <Detail label="GSTIN" value={v.gstin} />
      </dl>

      {/* Documents */}
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">Documents</div>
        {v.documents.length === 0 ? (
          <p className="mt-1 text-sm text-foreground/55">No documents attached.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {v.documents.map((d, i) => <DocRow key={d.storage_key} workspaceId={v.workspace_id} index={i} name={d.file_name} />)}
          </ul>
        )}
      </div>

      {v.review_notes && (
        <p className="mt-3 rounded-xl bg-foreground/[0.03] px-3 py-2 text-xs text-foreground/70">Last note: {v.review_notes}</p>
      )}

      {/* Decision */}
      <div className="mt-5 border-t border-foreground/[0.06] pt-4">
        {awaiting ? (
          <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-xs text-sky-800 dark:text-sky-200">
            This workspace exists but the owner hasn't submitted their verification details yet.
            There's nothing to review until they do - they'll show up here as <strong>Pending</strong> once submitted.
          </div>
        ) : (
          <>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Reason / note (shown to the owner on rejection)"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => onDecide('rejected', notes)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300">
                <X className="h-3.5 w-3.5" /> Reject
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide('verified', notes)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
              </button>
            </div>
          </>
        )}
      </div>
    </Glass>
  );
}

function DocRow({ workspaceId, index, name }: { workspaceId: string; index: number; name: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const res = await verificationApi.adminSignDoc(workspaceId, index);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not open document.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <FileText className="h-4 w-4 flex-shrink-0 text-cyan-500" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <button type="button" onClick={open} disabled={busy} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || <span className="text-foreground/40">-</span>}</dd>
    </div>
  );
}

const STATUS_META: Record<VerificationStatus, { label: string; cls: string; icon: typeof BadgeCheck }> = {
  verified:    { label: 'Verified', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200', icon: BadgeCheck },
  pending:     { label: 'Pending',  cls: 'bg-amber-400/15 text-amber-700 dark:text-amber-200', icon: Clock },
  rejected:    { label: 'Rejected', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-200', icon: XCircle },
  unsubmitted: { label: 'Awaiting', cls: 'bg-sky-400/15 text-sky-700 dark:text-sky-200', icon: Clock },
};

function StatusChip({ status }: { status: VerificationStatus }) {
  const m = STATUS_META[status];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', m.cls)}><m.icon className="h-3 w-3" /> {m.label}</span>;
}

function StatusDot({ status }: { status: VerificationStatus }) {
  const color = status === 'verified' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-400' : status === 'rejected' ? 'bg-rose-500' : status === 'unsubmitted' ? 'bg-sky-400' : 'bg-foreground/30';
  return <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', color)} />;
}
