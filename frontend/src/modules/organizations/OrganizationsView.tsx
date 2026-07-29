import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Building2, ChevronRight, LayoutDashboard, Loader2, Plus, ScrollText, Trash2, UserPlus, Users, Workflow, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Glass, fadeUp, stagger } from '@/design-system';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';
import {
  ORG_ROLE_LABEL,
  organizationsApi,
  type OrganizationMember,
  type OrganizationSummary,
  type OrgRole,
} from '@/modules/workspace/api/organizations';

/**
 * OrganizationsView — Platform → Organization → Workspace dashboard.
 *
 * Left column: list of organizations the caller belongs to (with role badge).
 * Right column: details for the selected org — workspaces + members.
 *
 * org_owner / org_admin can add members + attach workspaces.
 * Only org_owner can delete the org.
 */
export function OrganizationsView({ heroEyebrow }: { heroEyebrow: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const listQ = useQuery({
    queryKey: ['orgs', 'list'],
    queryFn: organizationsApi.list,
    retry: 1,
  });

  const orgs = listQ.data ?? [];
  const selectedOrg = selectedId
    ? orgs.find((o) => o.id === selectedId)
    : orgs[0];

  return (
    <motion.div
      variants={stagger(0.06, 0.05)}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
            {heroEyebrow}
          </span>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">Organizations</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            An organization groups workspaces - clinic chains, franchise networks, multi-practice
            groups. Members get access across every workspace in the org.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New organization
        </button>
      </motion.div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center rounded-3xl border border-foreground/[0.06] bg-card p-10 text-sm text-foreground/55 shadow-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
          {/* Org list */}
          <motion.div variants={fadeUp}>
            <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card p-2 shadow-sm">
              <ul className="flex flex-col gap-1">
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                        selectedOrg?.id === o.id
                          ? 'bg-teal-100 dark:bg-teal-500/[0.12]'
                          : 'hover:bg-foreground/[0.03]',
                      )}
                    >
                      <span
                        className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl text-sm font-extrabold text-white"
                        style={{ background: o.brand_color ?? '#0b7c88' }}
                      >
                        {o.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-foreground">{o.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/50">
                          <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5">{ORG_ROLE_LABEL[o.my_role]}</span>
                          <span>{o.workspace_count} ws</span>
                          <span>·</span>
                          <span>{o.member_count} members</span>
                        </div>
                      </div>
                      <ChevronRight className="mt-1.5 h-4 w-4 flex-none text-foreground/30" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Org detail */}
          <motion.div variants={fadeUp}>
            {selectedOrg && <OrgDetail org={selectedOrg} />}
          </motion.div>
        </div>
      )}

      {creating && (
        <CreateOrgDialog
          onClose={() => setCreating(false)}
          onCreated={(newOrg) => {
            setCreating(false);
            setSelectedId(newOrg.id);
            void queryClient.invalidateQueries({ queryKey: ['orgs'] });
          }}
        />
      )}
    </motion.div>
  );
}

// ─── Org detail ──────────────────────────────────────────────────────

function OrgDetail({ org }: { org: OrganizationSummary }) {
  const queryClient = useQueryClient();
  const [addingMember, setAddingMember] = useState(false);
  const canManage = org.my_role === 'org_owner' || org.my_role === 'org_admin';

  const wsQ = useQuery({
    queryKey: ['orgs', org.id, 'workspaces'],
    queryFn: () => organizationsApi.listWorkspaces(org.id),
    retry: 1,
  });

  const membersQ = useQuery({
    queryKey: ['orgs', org.id, 'members'],
    queryFn: () => organizationsApi.listMembers(org.id),
    retry: 1,
  });

  // Optimistic: the member row vanishes instantly.
  const removeMemberMut = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(org.id, memberId),
    ...optimistic<OrganizationMember[], string>(
      queryClient,
      ['orgs', org.id, 'members'],
      (old, memberId) => old.filter((m) => m.id !== memberId),
      { errorMessage: 'Could not remove member.', also: [['orgs', 'list']] },
    ),
    onSuccess: () => {
      toast.success('Member removed');
    },
  });

  const workspaces = wsQ.data ?? [];
  const members = membersQ.data ?? [];

  return (
    <div className="space-y-5">
      {/* Header tile */}
      <div className="flex flex-wrap items-start gap-4 rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
        <span
          className="grid h-12 w-12 flex-none place-items-center rounded-2xl text-lg font-extrabold text-white"
          style={{ background: org.brand_color ?? '#0b7c88' }}
        >
          {org.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">{org.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-foreground/55">
            <code className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono">{org.slug}</code>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-800 dark:bg-teal-500/[0.12] dark:text-teal-200">
              {ORG_ROLE_LABEL[org.my_role]} access
            </span>
          </div>
          {org.description && (
            <p className="mt-2 text-sm text-foreground/65">{org.description}</p>
          )}
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-2">
          <Link
            to="/organizations/dashboard"
            className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/[0.06] px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-500/[0.12] dark:text-teal-300"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Franchise dashboard
          </Link>
          <Link
            to="/organizations/activity"
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs font-semibold text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
          >
            <ScrollText className="h-3.5 w-3.5" />
            Audit log
          </Link>
        </div>
      </div>

      {/* Workspaces */}
      <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-100 dark:bg-sky-500/[0.12]">
              <Workflow className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" />
            </span>
            <h3 className="text-sm font-bold">Workspaces</h3>
            <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/50">{workspaces.length}</span>
          </div>
        </div>
        {wsQ.isLoading ? (
          <div className="p-6 text-center text-xs text-foreground/55">Loading…</div>
        ) : workspaces.length === 0 ? (
          <div className="p-6 text-center text-xs text-foreground/55">
            No workspaces attached yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 p-2.5">
            {workspaces.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] px-3.5 py-2.5">
                <div className="text-sm font-semibold text-foreground">{w.name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/45">
                  attached {formatRelative(w.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Members */}
      <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-violet-100 dark:bg-violet-500/[0.12]">
              <Users className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
            </span>
            <h3 className="text-sm font-bold">Members</h3>
            <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/50">{members.length}</span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setAddingMember(true)}
              className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold text-teal-800 transition-colors hover:bg-teal-200 dark:bg-teal-500/[0.12] dark:text-teal-200 dark:hover:bg-teal-500/[0.2]"
            >
              <UserPlus className="h-3 w-3" />
              Add
            </button>
          )}
        </div>
        {membersQ.isLoading ? (
          <div className="p-6 text-center text-xs text-foreground/55">Loading…</div>
        ) : (
          <ul className="flex flex-col gap-1.5 p-2.5">
            {members.map((m) => (
              <li key={m.id} className="group flex items-center justify-between gap-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-violet-100 text-[12px] font-extrabold text-violet-800 dark:bg-violet-500/[0.12] dark:text-violet-200">
                    {(m.email ?? m.user_id).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {m.email ?? <span className="font-mono text-foreground/55">{m.user_id.slice(0, 8)}…</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800 dark:bg-teal-500/[0.12] dark:text-teal-200">
                        {ORG_ROLE_LABEL[m.role]}
                      </span>
                      {m.status !== 'active' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-800 dark:bg-amber-500/[0.12] dark:text-amber-200">
                          {m.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && org.my_role === 'org_owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove ${m.email ?? m.user_id.slice(0, 8)} from ${org.name}?`)) {
                        removeMemberMut.mutate(m.id);
                      }
                    }}
                    className="flex-none rounded-xl p-1.5 text-foreground/35 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {addingMember && (
        <AddMemberDialog
          orgId={org.id}
          onClose={() => setAddingMember(false)}
          onAdded={() => {
            setAddingMember(false);
            void queryClient.invalidateQueries({ queryKey: ['orgs', org.id, 'members'] });
            void queryClient.invalidateQueries({ queryKey: ['orgs', 'list'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────

function CreateOrgDialog({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (org: OrganizationSummary) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const createMut = useMutation({
    mutationFn: () => organizationsApi.create({
      name: name.trim(),
      slug: slug.trim() || slugify(name),
    }),
    onSuccess: (org) => {
      toast.success(`Created ${org.name}`);
      onCreated(org);
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  return (
    <DialogShell title="New organization" onClose={onClose}>
      <div className="space-y-3">
        <FormRow label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(slugify(e.target.value));
            }}
            placeholder="e.g. Sirah Health Network"
            className={INPUT_CLASS}
          />
        </FormRow>
        <FormRow label="Slug" hint="3-64 chars: lowercase, digits, hyphens">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="sirah-health-network"
            className={cn(INPUT_CLASS, 'font-mono')}
          />
        </FormRow>
      </div>
      <DialogFooter
        primaryLabel="Create"
        primaryPending={createMut.isPending}
        primaryDisabled={!name.trim()}
        onPrimary={() => createMut.mutate()}
        onCancel={onClose}
      />
    </DialogShell>
  );
}

function AddMemberDialog({
  orgId, onClose, onAdded,
}: {
  orgId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('org_viewer');

  const addMut = useMutation({
    mutationFn: () => organizationsApi.addMember(orgId, { email: email.trim(), role }),
    onSuccess: () => {
      toast.success('Member added');
      onAdded();
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  return (
    <DialogShell title="Add member" onClose={onClose}>
      <div className="space-y-3">
        <FormRow label="Email" hint="They must have signed up already">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
            className={INPUT_CLASS}
          />
        </FormRow>
        <FormRow label="Role">
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
            <SelectTrigger aria-label="Role" className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="org_viewer" className="text-sm">Viewer - read-only across workspaces</SelectItem>
              <SelectItem value="org_admin" className="text-sm">Admin - manage members + workspaces</SelectItem>
              <SelectItem value="org_owner" className="text-sm">Owner - full control incl. billing</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>
      <DialogFooter
        primaryLabel="Add member"
        primaryPending={addMut.isPending}
        primaryDisabled={!email.trim()}
        onPrimary={() => addMut.mutate()}
        onCancel={onClose}
      />
    </DialogShell>
  );
}

// ─── Common dialog bits ──────────────────────────────────────────────

function DialogShell({
  title, children, onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 p-4 backdrop-blur-sm">
      <Glass variant="heavy" className="w-full max-w-md overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3.5">
          <h3 className="text-sm font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </Glass>
    </div>
  );
}

function DialogFooter({
  primaryLabel, onPrimary, onCancel,
  primaryPending, primaryDisabled,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onCancel: () => void;
  primaryPending: boolean;
  primaryDisabled?: boolean;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-foreground/[0.08] px-4 py-2 text-xs font-semibold text-foreground/75 hover:border-foreground/15"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryPending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-md transition hover:opacity-90',
          (primaryDisabled || primaryPending) && 'opacity-60',
        )}
      >
        {primaryPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {primaryLabel}
      </button>
    </div>
  );
}

function FormRow({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-foreground/45">{hint}</p>}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-foreground/[0.06] bg-card p-12 text-center shadow-sm">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 dark:bg-teal-500/[0.12]">
        <Building2 className="h-7 w-7 text-teal-700 dark:text-teal-300" />
      </span>
      <div className="text-sm text-foreground/60">
        You are not part of any organization yet.
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" />
        Create your first organization
      </button>
    </div>
  );
}

const INPUT_CLASS =
  'w-full rounded-xl border border-foreground/[0.08] bg-transparent px-3.5 py-2.5 text-sm placeholder:text-foreground/35 focus:border-[hsl(var(--brand-blue))]/50 focus:outline-none';

// Same look as INPUT_CLASS, minus the bits SelectTrigger already provides
// (its own border width + focus ring). h-auto lets the padding set the height,
// exactly as it did on the native <select>.
const SELECT_TRIGGER_CLASS =
  'h-auto w-full rounded-xl border-foreground/[0.08] bg-transparent px-3.5 py-2.5 text-sm focus:border-[hsl(var(--brand-blue))]/50';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
