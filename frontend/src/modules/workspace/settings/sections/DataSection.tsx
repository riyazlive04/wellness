import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Check, Download, FileArchive, Loader2, Pencil, Plus,
  ScrollText, ShieldAlert, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  dataPrivacyApi,
  type DataRequest,
  type DataRequestType,
  type RetentionPolicy,
} from '@/modules/workspace/api/dataPrivacy';
import { SectionHeader } from './GeneralSection';

export function DataSection() {
  return (
    <SectionHeader
      title="Data & privacy"
      subtitle="Export your workspace, configure retention, and (last resort) delete your workspace."
    >
      <ExportCard />
      <RetentionCard />
      <DataRequestsCard />
      <ProvenanceCard />
      <DangerZoneCard />
    </SectionHeader>
  );
}

// ─── Export ──────────────────────────────────────────────────────────

function ExportCard() {
  const exportMut = useMutation({
    mutationFn: dataPrivacyApi.export,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = data.generated_at.slice(0, 10);
      const slug = data.workspace_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      a.href = url;
      a.download = `workspace-export-${slug || 'data'}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
      toast.success(`Export ready — ${total.toLocaleString()} records downloaded.`);
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  return (
    <Glass className="p-5">
      <div className="flex items-start gap-3">
        <IconTile from="from-blue-600/20" to="to-cyan-500/15" tone="text-teal-700 dark:text-teal-200">
          <FileArchive className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">Export workspace data</h3>
          <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
            Downloads a JSON archive of this workspace — clients, messages, assessments, meal logs,
            appointments, invoices, and audit records.
          </p>
        </div>
        <button
          type="button"
          disabled={exportMut.isPending}
          onClick={() => exportMut.mutate()}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-1.5 text-xs font-medium text-foreground hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-60"
        >
          {exportMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {exportMut.isPending ? 'Generating…' : 'Generate export'}
        </button>
      </div>
    </Glass>
  );
}

// ─── Retention ───────────────────────────────────────────────────────

function RetentionCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RetentionPolicy | null>(null);

  const retentionQ = useQuery({
    queryKey: ['data-privacy', 'retention'],
    queryFn: dataPrivacyApi.retention,
    retry: 1,
  });

  const saveMut = useMutation({
    mutationFn: (body: RetentionPolicy) => dataPrivacyApi.updateRetention(body),
    onSuccess: (data) => {
      queryClient.setQueryData(['data-privacy', 'retention'], data);
      setEditing(false);
      setDraft(null);
      toast.success('Retention policy updated.');
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const policy = retentionQ.data;

  const startEdit = () => {
    if (policy) setDraft({ ...policy });
    setEditing(true);
  };

  return (
    <Glass className="p-5">
      <div className="flex items-start gap-3">
        <IconTile from="from-amber-300/20" to="to-amber-300/[0.05]" tone="text-amber-700 dark:text-amber-200">
          <ScrollText className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Retention policy</h3>
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                disabled={!policy}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06] disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setDraft(null); }}
                  className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2.5 py-1 text-[11px] text-foreground/70 hover:bg-foreground/[0.04]"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
                <button
                  type="button"
                  disabled={saveMut.isPending || !draft}
                  onClick={() => draft && saveMut.mutate(draft)}
                  className="inline-flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-teal-600 disabled:opacity-60"
                >
                  {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </button>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
            Inactive client records are anonymized after the window below. Messages and audit logs follow
            a longer retention to meet Indian healthcare recordkeeping rules.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {retentionQ.isLoading || !policy ? (
              <div className="col-span-full p-3 text-center text-xs text-foreground/55">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            ) : editing && draft ? (
              <>
                <RetentionEditTile
                  label="Client records" unit="months"
                  value={draft.client_months}
                  onChange={(v) => setDraft({ ...draft, client_months: v })}
                />
                <RetentionEditTile
                  label="Messages + audit" unit="years"
                  value={draft.messages_years}
                  onChange={(v) => setDraft({ ...draft, messages_years: v })}
                />
                <RetentionEditTile
                  label="Backups" unit="days"
                  value={draft.backups_days}
                  onChange={(v) => setDraft({ ...draft, backups_days: v })}
                />
              </>
            ) : (
              <>
                <RetentionTile label="Client records"   value={`${policy.client_months} months`} />
                <RetentionTile label="Messages + audit" value={`${policy.messages_years} years`} />
                <RetentionTile label="Backups"          value={`${policy.backups_days} days`} />
              </>
            )}
          </div>
        </div>
      </div>
    </Glass>
  );
}

// ─── Client data requests ────────────────────────────────────────────

function DataRequestsCard() {
  const queryClient = useQueryClient();
  const [filing, setFiling] = useState(false);

  const requestsQ = useQuery({
    queryKey: ['data-privacy', 'requests'],
    queryFn: dataPrivacyApi.listRequests,
    retry: 1,
  });

  const requests = requestsQ.data ?? [];
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'in_review').length;

  return (
    <Glass className="p-5">
      <div className="flex items-start gap-3">
        <IconTile from="from-emerald-400/20" to="to-emerald-400/[0.05]" tone="text-emerald-700 dark:text-emerald-200">
          <ShieldAlert className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Client data requests</h3>
            <button
              type="button"
              onClick={() => setFiling(true)}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/85 hover:bg-foreground/[0.06]"
            >
              <Plus className="h-3 w-3" /> File a request
            </button>
          </div>
          <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
            Process client-initiated data export or deletion requests (GDPR / India's DPDP Act).
            Requests must be resolved within 7 days. {open > 0 && (
              <span className="font-medium text-foreground">{open} open.</span>
            )}
          </p>

          <div className="mt-3">
            {requestsQ.isLoading ? (
              <div className="p-4 text-center text-xs text-foreground/55">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-foreground/10 p-4 text-center text-xs text-foreground/55">
                No data requests yet.
              </div>
            ) : (
              <ul className="divide-y divide-foreground/[0.05] overflow-hidden rounded-xl border border-foreground/[0.06]">
                {requests.map((r) => <RequestRow key={r.id} req={r} />)}
              </ul>
            )}
          </div>
        </div>
      </div>

      {filing && (
        <FileRequestDialog
          onClose={() => setFiling(false)}
          onFiled={() => {
            setFiling(false);
            void queryClient.invalidateQueries({ queryKey: ['data-privacy', 'requests'] });
          }}
        />
      )}
    </Glass>
  );
}

function RequestRow({ req }: { req: DataRequest }) {
  const type = req.request_channel === 'workspace_erasure' ? 'Erasure' : 'Export';
  return (
    <li className="flex items-center justify-between gap-3 bg-foreground/[0.01] px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-foreground">{req.target_email}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-foreground/45">
          <span>{type}</span>
          <span>·</span>
          <span>filed {formatRelative(req.created_at)}</span>
        </div>
      </div>
      <StatusBadge status={req.status} />
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    in_review: 'border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-200',
    completed: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    rejected:  'border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  };
  return (
    <span className={cn(
      'flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]',
      map[status] ?? 'border-foreground/15 bg-foreground/5 text-foreground/60',
    )}>
      {status.replace('_', ' ')}
    </span>
  );
}

function FileRequestDialog({ onClose, onFiled }: { onClose: () => void; onFiled: () => void }) {
  const [email, setEmail] = useState('');
  const [type, setType] = useState<DataRequestType>('export');
  const [reason, setReason] = useState('');

  const fileMut = useMutation({
    mutationFn: () => dataPrivacyApi.createRequest({
      target_email: email.trim(),
      type,
      reason: reason.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Request filed — due within 7 days.');
      onFiled();
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <Glass className="w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <h3 className="text-sm font-medium">File a client data request</h3>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <Field label="Client email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="client@example.com" className={INPUT_CLASS} />
          </Field>
          <Field label="Request type">
            <select value={type} onChange={(e) => setType(e.target.value as DataRequestType)} className={INPUT_CLASS}>
              <option value="export">Data export — provide a copy of their data</option>
              <option value="erasure">Erasure — delete their personal data</option>
            </select>
          </Field>
          <Field label="Reason / notes" hint="Optional">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="e.g. client emailed requesting account deletion" className={INPUT_CLASS} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onClose}
            className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15">
            Cancel
          </button>
          <button type="button" disabled={!email.trim() || fileMut.isPending} onClick={() => fileMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-60">
            {fileMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            File request
          </button>
        </div>
      </Glass>
    </div>
  );
}

// ─── Provenance (informational) ──────────────────────────────────────

function ProvenanceCard() {
  return (
    <Glass className="p-5">
      <div className="flex items-start gap-3">
        <IconTile from="from-blue-600/20" to="to-cyan-500/15" tone="text-teal-700 dark:text-teal-200">
          <BookOpen className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-foreground">Data sources &amp; provenance</h3>
          <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
            Nutrient values in the Food library are sourced from <strong>IFCT 2017</strong> (NIN / ICMR)
            and <strong>USDA FoodData Central</strong>, each record version-stamped to its source. These
            panels are the authoritative reference used by SIRAH LIFE's Nutrition Engine for every calculation.
            Health &amp; suitability notes are derived from this nutrient data and are general information,
            not medical advice.
          </p>
        </div>
      </div>
    </Glass>
  );
}

// ─── Danger zone (unchanged — not wired yet) ─────────────────────────

function DangerZoneCard() {
  return (
    <Glass className="border-rose-400/15 bg-rose-400/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-rose-400/15 text-rose-700 dark:text-rose-300">
          <Trash2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-rose-100">Delete workspace</h3>
            <span className="rounded-full border border-rose-400/30 bg-rose-400/[0.1] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-rose-700 dark:text-rose-200">
              Permanent
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground/75 dark:text-foreground/55">
            Cancels subscription and schedules irreversible deletion of all workspace data after a
            30-day grace period. Cannot be recovered after grace ends.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            toast('Confirmation dialog with type-to-confirm field opens here. Not destructive in the demo.')
          }
          className="rounded-full border border-rose-400/40 bg-rose-400/[0.06] px-4 py-2 text-xs font-medium text-rose-100 hover:bg-rose-400/[0.1]"
        >
          Delete workspace
        </button>
      </div>
    </Glass>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────

function IconTile({
  from, to, tone, children,
}: { from: string; to: string; tone: string; children: React.ReactNode }) {
  return (
    <div className={cn('grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br', from, to, tone)}>
      {children}
    </div>
  );
}

function RetentionTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function RetentionEditTile({
  label, unit, value, onChange,
}: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-500/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <input
          type="number" min={1} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 rounded-md border border-foreground/10 bg-transparent px-2 py-1 text-sm font-medium text-foreground focus:border-teal-500/40 focus:outline-none"
        />
        <span className="text-xs text-foreground/55">{unit}</span>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-foreground/45">{hint}</p>}
    </div>
  );
}

const INPUT_CLASS =
  'w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-teal-500/40 focus:outline-none';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
