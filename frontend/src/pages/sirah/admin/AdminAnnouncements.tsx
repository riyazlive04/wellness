import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  Check,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Megaphone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type Announcement, type AnnouncementRole, type UpsertAnnouncementPayload } from '@/modules/super-admin/api/admin';

type Severity = 'info' | 'warning' | 'critical';

const ROLE_OPTIONS: Array<{ value: AnnouncementRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'nutritionist', label: 'Nutritionist' },
  { value: 'assistant_nutritionist', label: 'Assistant' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'coach', label: 'Coach' },
  { value: 'support', label: 'Support' },
];
const ROLE_LABEL: Record<AnnouncementRole, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label]),
) as Record<AnnouncementRole, string>;

export default function AdminAnnouncements() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // retry: 1 so a missing-migration error surfaces in ~5s instead of
  // 35s of stuck "Loading…". The default 3-retry policy was hiding the
  // "table doesn't exist" error.
  const { data, isLoading, error } = useQuery<{ items: Announcement[] }>({
    queryKey: ['admin', 'announcements'],
    queryFn: () => adminApi.listAnnouncements(),
    retry: 1,
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
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Operations · Announcements
          </span>

          {/* Title + button on the same row so the button aligns with the H1
              baseline, not the bottom of the description. Description flows
              full-width below — common Stripe / Linear / Notion pattern. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-balance">Announcements</h1>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={cn(
                'group inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full',
                'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white',
                'shadow-[0_10px_30px_-10px_rgba(99,102,241,0.55)]',
                'transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_14px_36px_-10px_rgba(99,102,241,0.7)] active:scale-[0.98]',
              )}
            >
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
              New announcement
            </button>
          </div>

          <p className="text-pretty max-w-2xl text-base text-foreground/80 dark:text-foreground/65">
            Banner messages shown in the topbar of every workspace (or specific ones).
            Use for maintenance windows, new features, billing notices.
          </p>
        </motion.div>

        {error && (
          <motion.div variants={fadeUp}>
            <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
              Couldn't load announcements: {(error as Error).message}
              {/* (table) not exist → run migration 20260603100000_add_platform_admin_tables */}
              {/relation .* does not exist/i.test((error as Error).message ?? '') && (
                <div className="mt-1.5 text-xs text-rose-700/80 dark:text-rose-200/75">
                  Migration <code>20260603100000_add_platform_admin_tables.sql</code> needs to be applied in Supabase.
                </div>
              )}
            </Glass>
          </motion.div>
        )}

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              {isLoading ? 'Loading…' : error ? 'Failed to load' : `${items.length} ${items.length === 1 ? 'announcement' : 'announcements'}`}
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {items.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <Megaphone className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/80 dark:text-foreground/65">No announcements yet.</div>
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
              : <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-foreground/75 dark:text-foreground/55">Draft</span>
            }
            <AudienceTag a={a} />
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
  const [roles, setRoles] = useState<AnnouncementRole[]>([]);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [wsSearch, setWsSearch] = useState('');

  // Workspaces for the picker — only loaded while the dialog is open.
  const wsQ = useQuery({
    queryKey: ['admin', 'workspaces', 'picker', wsSearch],
    queryFn: () => adminApi.listWorkspaces({ q: wsSearch || undefined, status: 'active', limit: 50 }),
  });
  const wsItems = wsQ.data?.items ?? [];

  const toggleRole = (r: AnnouncementRole) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  const toggleWs = (id: string) =>
    setWorkspaceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
      target_roles: roles,
      target_workspace_ids: workspaceIds,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 ">
      <Glass variant="heavy" className="flex max-h-[90vh] w-full max-w-lg flex-col p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New announcement</h2>
            <p className="mt-1 text-xs text-foreground/80 dark:text-foreground/65">Saved as draft; publish to show in workspace topbars.</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex min-h-0 flex-1 flex-col">
         <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Title</div>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
              placeholder="Scheduled maintenance Sunday 2-3 AM IST"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Body</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
              placeholder="The platform will be briefly unavailable while we deploy improvements."
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Severity</div>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Ends at (optional)</div>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none" />
            </label>
          </div>

          {/* ── Audience ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 dark:text-foreground/65">
              <Users className="h-3.5 w-3.5" /> Audience
            </div>
            <p className="mt-0.5 text-[11px] text-foreground/55">
              Leave both empty to reach everyone. Filters combine — e.g. nutritionists in 2 workspaces.
            </p>

            {/* Roles */}
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                Roles · {roles.length === 0 ? 'everyone' : `${roles.length} selected`}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_OPTIONS.map((r) => {
                  const on = roles.includes(r.value);
                  return (
                    <button
                      key={r.value} type="button" onClick={() => toggleRole(r.value)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                        on
                          ? 'border-violet-400/50 bg-violet-400/15 text-violet-700 dark:text-violet-200'
                          : 'border-foreground/10 text-foreground/70 hover:bg-foreground/[0.04]',
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Workspaces */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-foreground/55">
                <span>Workspaces · {workspaceIds.length === 0 ? 'all' : `${workspaceIds.length} selected`}</span>
                {workspaceIds.length > 0 && (
                  <button type="button" onClick={() => setWorkspaceIds([])}
                    className="normal-case tracking-normal text-violet-600 hover:underline dark:text-violet-300">
                    Clear
                  </button>
                )}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
                <input
                  type="text" value={wsSearch} onChange={(e) => setWsSearch(e.target.value)}
                  placeholder="Search workspaces…"
                  className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] py-1.5 pl-8 pr-3 text-xs focus:border-violet-400/60 focus:outline-none" />
              </div>
              <div className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-foreground/[0.06] bg-foreground/[0.015] p-1">
                {wsQ.isLoading && (
                  <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-foreground/55">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading workspaces…
                  </div>
                )}
                {!wsQ.isLoading && wsItems.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-foreground/55">No workspaces found.</div>
                )}
                {wsItems.map((w) => {
                  const on = workspaceIds.includes(w.id);
                  return (
                    <button
                      key={w.id} type="button" onClick={() => toggleWs(w.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        on ? 'bg-violet-400/15' : 'hover:bg-foreground/[0.04]',
                      )}
                    >
                      <span className={cn(
                        'grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded border',
                        on ? 'border-violet-500 bg-violet-500 text-white' : 'border-foreground/25',
                      )}>
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <Building2 className="h-3 w-3 flex-shrink-0 text-foreground/40" />
                      <span className="min-w-0 flex-1 truncate text-foreground/80">{w.name}</span>
                      <span className="flex-shrink-0 text-[10px] text-foreground/45">{w.member_count} members</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground/75">
            <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} />
            Users can dismiss this banner
          </label>
         </div>

          <div className="mt-3 flex flex-shrink-0 justify-end gap-2 border-t border-foreground/[0.06] pt-3">
            <button type="button" onClick={onClose}
              className="rounded-full border border-foreground/10 px-4 py-2 text-xs text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.04]">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className={cn('inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white transition-transform', !loading && 'hover:scale-[1.02]', loading && 'opacity-60')}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Save as draft
            </button>
          </div>
        </form>
      </Glass>
    </div>
  );
}

function AudienceTag({ a }: { a: Announcement }) {
  const roles = a.target_roles ?? [];
  const wsCount = a.target_workspace_ids?.length ?? 0;
  if (roles.length === 0 && wsCount === 0) {
    return <span className="text-[10px] text-foreground/55">→ everyone</span>;
  }
  const parts: string[] = [];
  if (roles.length > 0) parts.push(roles.map((r) => ROLE_LABEL[r] ?? r).join(', '));
  parts.push(wsCount === 0 ? 'all workspaces' : `${wsCount} workspace${wsCount === 1 ? '' : 's'}`);
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-1.5 py-0 text-[10px] text-foreground/75 dark:text-foreground/60">
      <Users className="h-2.5 w-2.5" />
      {parts.join(' · ')}
    </span>
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
