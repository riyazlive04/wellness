import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Megaphone,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type Announcement, type UpsertAnnouncementPayload } from '@/modules/super-admin/api/admin';

type Severity = 'info' | 'warning' | 'critical';

export default function AdminAnnouncements() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery<{ items: Announcement[] }>({
    queryKey: ['admin', 'announcements'],
    queryFn: () => adminApi.listAnnouncements(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });

  const create    = useMutation({ mutationFn: (p: UpsertAnnouncementPayload) => adminApi.createAnnouncement(p),  onSuccess: () => { toast.success('Created (draft).'); invalidate(); setShowForm(false); }, onError: onErr });
  const publish   = useMutation({ mutationFn: (id: string) => adminApi.publishAnnouncement(id),                  onSuccess: () => { toast.success('Published.');       invalidate(); }, onError: onErr });
  const unpublish = useMutation({ mutationFn: (id: string) => adminApi.unpublishAnnouncement(id),                onSuccess: () => { toast.success('Unpublished.');     invalidate(); }, onError: onErr });
  const remove    = useMutation({ mutationFn: (id: string) => adminApi.deleteAnnouncement(id),                   onSuccess: () => { toast.success('Deleted.');         invalidate(); }, onError: onErr });

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/60">Operations · Announcements</span>
            <h1 className="text-balance mt-1">Announcements</h1>
            <p className="text-pretty text-base text-foreground/65 mt-2">
              Banner messages shown in the topbar of every workspace (or specific ones).
              Use for maintenance windows, new features, billing notices.
            </p>
          </div>
          <button type="button" onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]">
            <Plus className="h-4 w-4" /> New announcement
          </button>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
              {isLoading ? 'Loading…' : `${items.length} ${items.length === 1 ? 'announcement' : 'announcements'}`}
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {items.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <Megaphone className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/65">No announcements yet.</div>
                </li>
              )}
              {items.map((a) => (
                <AnnouncementRow
                  key={a.id}
                  a={a}
                  busy={publish.isPending || unpublish.isPending || remove.isPending}
                  onPublish={() => publish.mutate(a.id)}
                  onUnpublish={() => unpublish.mutate(a.id)}
                  onDelete={() => { if (confirm(`Delete "${a.title}"?`)) remove.mutate(a.id); }}
                />
              ))}
            </ul>
          </Glass>
        </motion.div>
      </motion.div>

      {showForm && (
        <ComposeDialog
          loading={create.isPending}
          onClose={() => setShowForm(false)}
          onSubmit={(p) => create.mutate(p)}
        />
      )}
    </div>
  );
}

function AnnouncementRow({
  a, busy, onPublish, onUnpublish, onDelete,
}: { a: Announcement; busy: boolean; onPublish: () => void; onUnpublish: () => void; onDelete: () => void }) {
  const isPublished = !!a.published_at;
  return (
    <li className="px-5 py-4 hover:bg-foreground/[0.02]">
      <div className="flex items-start gap-3">
        <SeverityIcon severity={a.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{a.title}</span>
            <SeverityBadge severity={a.severity} />
            {isPublished
              ? <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">Live</span>
              : <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-foreground/55">Draft</span>
            }
            {a.target_workspace_ids && a.target_workspace_ids.length > 0 && (
              <span className="text-[10px] text-foreground/55">→ {a.target_workspace_ids.length} workspaces</span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground/75">{a.body}</p>
          <div className="mt-1 text-[10px] text-foreground/45">
            created {new Date(a.created_at).toLocaleDateString()}
            {a.ends_at && <> · ends {new Date(a.ends_at).toLocaleDateString()}</>}
            {!a.dismissible && <> · not dismissible</>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isPublished
            ? <Btn icon={EyeOff} label="Unpublish" tone="warn"  onClick={onUnpublish} disabled={busy} />
            : <Btn icon={Eye}    label="Publish"   tone="ok"    onClick={onPublish}   disabled={busy} />
          }
          <Btn icon={Trash2} label="Delete" tone="danger" onClick={onDelete} disabled={busy} />
        </div>
      </div>
    </li>
  );
}

function ComposeDialog({
  loading, onClose, onSubmit,
}: { loading: boolean; onClose: () => void; onSubmit: (p: UpsertAnnouncementPayload) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [endsAt, setEndsAt] = useState('');
  const [dismissible, setDismissible] = useState(true);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) { toast.error('Title required.'); return; }
    if (body.trim().length < 2)  { toast.error('Body required.');  return; }
    onSubmit({
      title: title.trim(),
      body: body.trim(),
      severity,
      ends_at: endsAt || undefined,
      dismissible,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <Glass variant="heavy" className="w-full max-w-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New announcement</h2>
            <p className="mt-1 text-xs text-foreground/65">Saved as draft; publish to show in workspace topbars.</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-foreground/55 hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/65">Title</div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              placeholder="Scheduled maintenance Sunday 2-3 AM IST"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/65">Body</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
              placeholder="The platform will be briefly unavailable while we deploy improvements."
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-foreground/65">Severity</div>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-foreground/65">Ends at (optional)</div>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/75">
            <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} />
            Users can dismiss this banner
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-full border border-foreground/10 px-4 py-2 text-xs text-foreground/65 hover:bg-foreground/[0.04]">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className={cn('inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white transition-transform', !loading && 'hover:scale-[1.02]', loading && 'opacity-60')}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Save as draft
            </button>
          </div>
        </form>
      </Glass>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const tone = severity === 'critical' ? 'text-rose-700 dark:text-rose-300' : severity === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-violet-700 dark:text-violet-300';
  const Icon = severity === 'critical' ? AlertOctagon : severity === 'warning' ? AlertTriangle : Info;
  return <Icon className={cn('h-4 w-4 flex-shrink-0', tone)} />;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = severity === 'critical' ? 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200'
             : severity === 'warning'  ? 'border-amber-300/40 bg-amber-300/10 text-amber-700 dark:text-amber-200'
             :                            'border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200';
  return <span className={cn('rounded-full border px-1.5 py-0 text-[9px] uppercase tracking-[0.16em]', tone)}>{severity}</span>;
}

function Btn({ icon: Icon, label, tone, onClick, disabled }: {
  icon: typeof Eye; label: string; tone: 'ok' | 'warn' | 'danger'; onClick: () => void; disabled?: boolean
}) {
  const cls = {
    ok:     'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-400/10',
    warn:   'text-amber-700 dark:text-amber-300 hover:bg-amber-300/10',
    danger: 'text-rose-700 dark:text-rose-300 hover:bg-rose-400/10',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label}
      className={cn('inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs transition-colors disabled:opacity-50', cls)}>
      {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function onErr(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : (err as Error).message);
}
