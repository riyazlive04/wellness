import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Building2, ChevronRight, Loader2, Plus, ScrollText, Trash2, UserPlus, Users, Workflow, X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  ORG_ROLE_LABEL,
  organizationsApi,
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
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">
            {heroEyebrow}
          </span>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Organizations</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            An organization groups workspaces — clinic chains, franchise networks, multi-practice
            groups. Members get access across every workspace in the org.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600"
        >
          <Plus className="h-3.5 w-3.5" />
          New organization
        </button>
      </motion.div>

      {listQ.isLoading ? (
        <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Glass>
      ) : orgs.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
          {/* Org list */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <ul className="divide-y divide-foreground/[0.05]">
                {orgs.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                        selectedOrg?.id === o.id
                          ? 'bg-violet-500/[0.07]'
                          : 'hover:bg-foreground/[0.02]',
                      )}
                    >
                      <span
                        className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-xs font-medium text-white"
                        style={{ background: o.brand_color ?? '#7c3aed' }}
                      >
                        {o.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{o.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                          <span>{ORG_ROLE_LABEL[o.my_role]}</span>
                          <span>·</span>
                          <span>{o.workspace_count} ws</span>
                          <span>·</span>
                          <span>{o.member_count} members</span>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-foreground/30" />
                    </button>
                  </li>
                ))}
              </ul>
            </Glass>
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

  const removeMemberMut = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(org.id, memberId),
    onSuccess: () => {
      toast.success('Member removed');
      void queryClient.invalidateQueries({ queryKey: ['orgs', org.id, 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['orgs', 'list'] });
    },
    onError: (err: unknown) => toast.error((err as Error).message),
  });

  const workspaces = wsQ.data ?? [];
  const members = membersQ.data ?? [];

  return (
    <div className="space-y-5">
      {/* Header tile */}
      <Glass className="flex items-start gap-4 p-5">
        <span
          className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white"
          style={{ background: org.brand_color ?? '#7c3aed' }}
        >
          {org.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-medium tracking-tight text-foreground">{org.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/55">
            <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono">{org.slug}</code>
            <span>·</span>
            <span>{ORG_ROLE_LABEL[org.my_role]} access</span>
          </div>
          {org.description && (
            <p className="mt-2 text-sm text-foreground/65">{org.description}</p>
          )}
        </div>
        <Link
          to="/organizations/activity"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
        >
          <ScrollText className="h-3.5 w-3.5" />
          Audit log
        </Link>
      </Glass>

      {/* Workspaces */}
      <Glass className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-3.5 w-3.5 text-foreground/45" />
            <h3 className="text-sm font-medium">Workspaces</h3>
            <span className="text-[11px] tabular-nums text-foreground/45">{workspaces.length}</span>
          </div>
        </div>
        {wsQ.isLoading ? (
          <div className="p-6 text-center text-xs text-foreground/55">Loading…</div>
        ) : workspaces.length === 0 ? (
          <div className="p-6 text-center text-xs text-foreground/55">
            No workspaces attached yet.
          </div>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {workspaces.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="text-sm text-foreground">{w.name}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                  attached {formatRelative(w.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Glass>

      {/* Members */}
      <Glass className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-foreground/45" />
            <h3 className="text-sm font-medium">Members</h3>
            <span className="text-[11px] tabular-nums text-foreground/45">{members.length}</span>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setAddingMember(true)}
              className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.08] px-2.5 py-1 text-[11px] text-foreground/75 hover:border-foreground/15"
            >
              <UserPlus className="h-3 w-3" />
              Add
            </button>
          )}
        </div>
        {membersQ.isLoading ? (
          <div className="p-6 text-center text-xs text-foreground/55">Loading…</div>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {members.map((m) => (
              <li key={m.id} className="group flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">
                    {m.email ?? <span className="font-mono text-foreground/55">{m.user_id.slice(0, 8)}…</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                    {ORG_ROLE_LABEL[m.role]}
                    {m.status !== 'active' && <> · {m.status}</>}
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
                    className="rounded-md p-1.5 text-foreground/35 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Glass>

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
          <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className={INPUT_CLASS}>
            <option value="org_viewer">Viewer — read-only across workspaces</option>
            <option value="org_admin">Admin — manage members + workspaces</option>
            <option value="org_owner">Owner — full control incl. billing</option>
          </select>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <h3 className="text-sm font-medium">{title}</h3>
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
        className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryPending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600',
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
      <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-foreground/45">{hint}</p>}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Glass className="flex flex-col items-center gap-3 p-12 text-center">
      <Building2 className="h-8 w-8 text-foreground/30" />
      <div className="text-sm text-foreground/60">
        You are not part of any organization yet.
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-violet-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600"
      >
        <Plus className="h-3.5 w-3.5" />
        Create your first organization
      </button>
    </Glass>
  );
}

const INPUT_CLASS =
  'w-full rounded-lg border border-foreground/[0.08] bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-violet-500/40 focus:outline-none';

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
