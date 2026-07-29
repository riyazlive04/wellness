import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, Copy, Loader2, ShieldCheck, SlidersHorizontal, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { RolePermissionsTable } from '@/modules/workspace/team/components/RolePermissionsTable';
import { PermissionEditorDialog } from '@/modules/workspace/team/PermissionEditorDialog';
import {
  tenancyApi, INVITABLE_ROLES, ROLE_LABEL,
  type TeamMember, type WorkspaceInvite,
} from '@/modules/workspace/api/tenancy';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';

// Warm avatar-chip palette (index-cycled), matching the wellness owner pages.
const AVATAR = ['#E4749B', '#5AA9D6', '#D9A15C', '#3FAE88', '#9B7BD6'];

export default function OwnerTeam() {
  const workspace = readWorkspace();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const [permMember, setPermMember] = useState<{ id: string; label: string } | null>(null);

  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, retry: 1 });
  const membersQ = useQuery({ queryKey: ['tenancy', 'members'], queryFn: tenancyApi.listMembers, retry: 1 });
  const invitesQ = useQuery({ queryKey: ['tenancy', 'invites'], queryFn: tenancyApi.listInvites, retry: 1 });

  const members = membersQ.data ?? [];
  const invites = invitesQ.data ?? [];
  const pending = invites.filter((i) => i.status === 'pending');
  const active = members.filter((m) => m.status === 'active');

  const teamLimit = limitsQ.data?.limits.maxTeam ?? null;
  const seatsUsed = limitsQ.data?.usage.team ?? active.length + pending.length;
  const planName = limitsQ.data?.plan ?? 'trial';
  const atCap = teamLimit != null && seatsUsed >= teamLimit;
  const seatPct = teamLimit != null ? Math.min(100, (seatsUsed / teamLimit) * 100) : 0;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tenancy'] });
  };

  // Optimistic: the role dropdown reflects the new role instantly.
  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => tenancyApi.updateMemberRole(id, role),
    ...optimistic<TeamMember[], { id: string; role: string }>(
      queryClient,
      ['tenancy', 'members'],
      (old, { id, role }) => old.map((m) => (m.id === id ? { ...m, role } : m)),
      { errorMessage: 'Could not update role.', also: [['tenancy', 'limits'], ['tenancy', 'invites']] },
    ),
    onSuccess: () => { toast.success('Role updated'); },
  });

  // Optimistic: the member row vanishes instantly (frees a seat → also refresh limits).
  const removeMut = useMutation({
    mutationFn: (id: string) => tenancyApi.removeMember(id),
    ...optimistic<TeamMember[], string>(
      queryClient,
      ['tenancy', 'members'],
      (old, id) => old.filter((m) => m.id !== id),
      { errorMessage: 'Could not remove member.', also: [['tenancy', 'limits'], ['tenancy', 'invites']] },
    ),
    onSuccess: () => { toast.success('Member removed'); },
  });

  // Optimistic: the pending invite vanishes instantly.
  const revokeMut = useMutation({
    mutationFn: (id: string) => tenancyApi.revokeInvite(id),
    ...optimistic<WorkspaceInvite[], string>(
      queryClient,
      ['tenancy', 'invites'],
      (old, id) => old.filter((i) => i.id !== id),
      { errorMessage: 'Could not revoke invite.', also: [['tenancy', 'limits'], ['tenancy', 'members']] },
    ),
    onSuccess: () => { toast.success('Invite revoked'); },
  });

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${active.length} active · ${pending.length} pending`}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Team</span>
              <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">Your practice's people</h1>
              <p className="mt-1.5 text-sm text-foreground/55">
                Invite staff, assign roles, and control who sees what. Seats are governed by your plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={atCap}
              className={cn(
                'inline-flex w-fit items-center gap-2 self-start rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow',
                atCap && 'opacity-50',
              )}
              title={atCap ? 'Team seat limit reached - upgrade to add more' : undefined}
            >
              <UserPlus className="h-4 w-4" />
              Invite member
            </button>
          </motion.div>

          {/* Seat usage banner */}
          <motion.div variants={fadeUp}>
            <div className={cn('overflow-hidden rounded-3xl border p-5 shadow-sm md:p-6',
              atCap ? 'border-amber-300/40 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/[0.08]' : 'border-foreground/[0.06] bg-card')}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn('grid h-12 w-12 flex-none place-items-center rounded-2xl',
                    atCap ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.15] dark:text-amber-200' : 'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-200')}>
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">Team seats</div>
                    <div className="mt-0.5 text-base font-medium text-foreground">
                      <span className="text-2xl font-extrabold tabular-nums">{seatsUsed}</span>
                      <span className="ml-1 capitalize text-foreground/55">
                        of {teamLimit ?? '∞'} on the {planName} plan
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-3 md:items-end">
                  {teamLimit != null && (
                    <div className="h-2 w-48 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          atCap ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]')}
                        style={{ width: `${seatPct}%` }}
                      />
                    </div>
                  )}
                  {atCap ? (
                    <Link to="/billing" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]">
                      Upgrade to add more <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : teamLimit != null ? (
                    <span className="text-xs text-foreground/55">{teamLimit - seatsUsed} {teamLimit - seatsUsed === 1 ? 'seat' : 'seats'} remaining</span>
                  ) : (
                    <span className="text-xs text-foreground/55">Unlimited seats</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard icon={Users} label="Active members" value={String(active.length)} hint="in this workspace" accent="sage" />
            <KPICard icon={UserPlus} label="Pending invites" value={String(pending.length)} hint={pending.length === 0 ? 'none waiting' : 'awaiting acceptance'} accent="sand" />
            <KPICard icon={ShieldCheck} label="AI calls (mo)" value={limitsQ.data ? String(limitsQ.data.usage.aiCallsThisMonth) : '-'} hint={limitsQ.data?.limits.aiCallsPerMonth ? `of ${limitsQ.data.limits.aiCallsPerMonth.toLocaleString()}` : 'this month'} accent="indigo" />
          </motion.div>

          {/* Members */}
          <motion.div variants={fadeUp}>
            <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm md:p-5">
              <div className="mb-4 px-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">Team</div>
                <h3 className="mt-0.5 text-sm font-extrabold">Members</h3>
                <p className="text-xs text-foreground/55">Active team accounts</p>
              </div>
              {membersQ.isLoading ? (
                <div className="p-8 text-center text-sm text-foreground/55"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {members.map((m, i) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-foreground/[0.05] bg-foreground/[0.02] px-3.5 py-3 transition hover:bg-foreground/[0.04]">
                      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl text-[13px] font-extrabold text-white" style={{ background: AVATAR[i % AVATAR.length] }}>
                        {(m.email ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{m.email ?? m.user_id.slice(0, 8)}</div>
                        <div className="text-[11px] text-foreground/50">joined {formatDate(m.joined_at)}</div>
                      </div>
                      <Select
                        value={m.role}
                        onValueChange={(role) => roleMut.mutate({ id: m.id, role })}
                      >
                        <SelectTrigger
                          aria-label="Role"
                          className="h-auto w-[136px] rounded-full border-foreground/[0.1] bg-foreground/[0.03] px-3 py-1.5 text-xs font-semibold focus:border-teal-500/40"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(ROLE_LABEL).map((r) => <SelectItem key={r} value={r} className="text-xs">{ROLE_LABEL[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {m.role !== 'owner' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPermMember({ id: m.id, label: m.email ?? m.user_id.slice(0, 8) })}
                            className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/40 bg-teal-100 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-200 dark:bg-teal-500/[0.12] dark:text-teal-200 dark:hover:bg-teal-500/[0.2]"
                            title="Choose which features this member can use"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Permissions
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (confirm(`Remove ${m.email ?? 'this member'}?`)) removeMut.mutate(m.id); }}
                            className="rounded-xl border border-foreground/10 p-2 text-foreground/35 transition-colors hover:border-rose-500/40 hover:bg-rose-500/[0.08] hover:text-rose-500"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>

          {/* Pending invites */}
          {pending.length > 0 && (
            <motion.div variants={fadeUp}>
              <div className="overflow-hidden rounded-3xl border border-foreground/[0.06] bg-card p-4 shadow-sm md:p-5">
                <div className="mb-4 px-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/40">Awaiting</div>
                  <h3 className="mt-0.5 text-sm font-extrabold">Pending invites</h3>
                </div>
                <ul className="flex flex-col gap-2">
                  {pending.map((inv) => (
                    <PendingInviteRow key={inv.id} invite={inv} onCopy={copyInviteLink} onRevoke={(id) => revokeMut.mutate(id)} revoking={revokeMut.isPending} />
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Permissions matrix (informational) */}
          <motion.div variants={fadeUp}>
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Permissions</div>
              <div className="mt-0.5 text-sm font-extrabold text-foreground">What each role can do</div>
            </div>
            <RolePermissionsTable />
          </motion.div>
        </motion.div>
      </div>

      {inviteOpen && (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvited={() => { invalidate(); }}
        />
      )}

      {permMember && (
        <PermissionEditorDialog
          memberId={permMember.id}
          memberLabel={permMember.label}
          onClose={() => setPermMember(null)}
        />
      )}
    </OwnerLayout>
  );
}

// ─── Invite dialog ───────────────────────────────────────────────────

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [mode, setMode] = useState<'invite' | 'login'>('invite');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('nutritionist');
  const [created, setCreated] = useState<WorkspaceInvite | null>(null);
  const [createdLogin, setCreatedLogin] = useState<{ email: string; created: boolean } | null>(null);
  const loginUrl = `${window.location.origin}/auth`;

  const inviteMut = useMutation({
    mutationFn: () => tenancyApi.invite({ email: email.trim(), role }),
    onSuccess: (inv) => { setCreated(inv); onInvited(); toast.success('Invite created'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const createMemberMut = useMutation({
    mutationFn: () => tenancyApi.createMember({ email: email.trim(), password, role }),
    onSuccess: (r) => { setCreatedLogin({ email: r.email, created: r.created }); onInvited(); toast.success('Team member created'); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const genPassword = () => {
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    setPassword(btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12));
  };
  const copyText = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Copied'); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
      <Glass variant="heavy" className="w-full max-w-md overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.15] dark:text-teal-200">
              <UserPlus className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-extrabold">Add a team member</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {createdLogin ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/70">
                <span className="font-medium">{createdLogin.email}</span> can now sign in as {ROLE_LABEL[role]}.
              </p>
              {createdLogin.created ? (
                <div className="space-y-2 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-3.5 text-xs">
                  <Cred label="Login link" value={loginUrl} onCopy={() => copyText(loginUrl)} />
                  <Cred label="Email" value={createdLogin.email} onCopy={() => copyText(createdLogin.email)} />
                  <Cred label="Password" value={password} mono onCopy={() => copyText(password)} />
                </div>
              ) : (
                <p className="rounded-2xl border border-amber-300/40 bg-amber-50 p-3.5 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-200">
                  This email already had an account, so they were added with their <b>existing</b> password (the one you set wasn't applied). They sign in at {loginUrl}.
                </p>
              )}
              <p className="text-[11px] text-foreground/45">Share these securely - ask them to change the password after first sign-in.</p>
              <button type="button" onClick={onClose} className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01] active:scale-[0.98] cta-glow">Done</button>
            </div>
          ) : created ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/70">
                Invite for <span className="font-bold">{created.email}</span> as {ROLE_LABEL[created.role]} created. Share this link:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-xl bg-foreground/[0.05] px-3 py-2 text-xs">{inviteLink(created.token)}</code>
                <button type="button" onClick={() => copyInviteLink(created.token)} className="rounded-xl border border-foreground/[0.1] p-2 transition-colors hover:bg-foreground/[0.04]" aria-label="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-foreground/45">The link expires in 14 days. They'll join after signing in and accepting.</p>
              <button type="button" onClick={onClose} className="w-full rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01] active:scale-[0.98] cta-glow">Done</button>
            </div>
          ) : (
            <>
              {/* Mode toggle: email invite vs. create-a-login-now */}
              <div className="flex rounded-full border border-foreground/[0.1] bg-foreground/[0.02] p-1 text-xs">
                <button type="button" onClick={() => setMode('invite')} className={cn('flex-1 rounded-full py-1.5 font-bold transition-colors', mode === 'invite' ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/60 hover:text-foreground')}>Send invite link</button>
                <button type="button" onClick={() => setMode('login')} className={cn('flex-1 rounded-full py-1.5 font-bold transition-colors', mode === 'login' ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/60 hover:text-foreground')}>Create login now</button>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-500/50 focus:outline-none" />
              </div>

              {mode === 'login' && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">Password</span>
                    <button type="button" onClick={genPassword} className="text-[11px] font-bold text-teal-600 hover:underline dark:text-teal-300">Generate</button>
                  </div>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="mt-1.5 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 font-mono text-sm focus:border-teal-500/50 focus:outline-none" />
                  <p className="mt-1 text-[11px] text-foreground/45">You'll share this with them; they can change it after signing in.</p>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">Role</span>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger
                    aria-label="Role"
                    className="mt-1.5 h-auto w-full rounded-xl border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-500/50"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map((r) => <SelectItem key={r} value={r} className="text-sm">{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="rounded-full border border-foreground/[0.1] px-4 py-2 text-xs font-semibold text-foreground/75 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.03]">Cancel</button>
                {mode === 'invite' ? (
                  <button
                    type="button"
                    disabled={!email.trim() || inviteMut.isPending}
                    onClick={() => inviteMut.mutate()}
                    className={cn('inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow', (!email.trim() || inviteMut.isPending) && 'opacity-60')}
                  >
                    {inviteMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create invite
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!email.trim() || password.trim().length < 8 || createMemberMut.isPending}
                    onClick={() => createMemberMut.mutate()}
                    className={cn('inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow', (!email.trim() || password.trim().length < 8 || createMemberMut.isPending) && 'opacity-60')}
                  >
                    {createMemberMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create login
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Glass>
    </div>
  );
}

function Cred({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex-shrink-0 text-foreground/55">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('truncate', mono && 'font-mono')}>{value}</span>
        <button type="button" onClick={onCopy} className="flex-shrink-0 text-foreground/40 hover:text-foreground" aria-label={`Copy ${label}`}><Copy className="h-3 w-3" /></button>
      </span>
    </div>
  );
}

function PendingInviteRow({ invite, onCopy, onRevoke, revoking }: {
  invite: WorkspaceInvite; onCopy: (t: string) => void; onRevoke: (id: string) => void; revoking: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 px-3.5 py-3 dark:border-amber-500/20 dark:bg-amber-500/[0.07]">
      <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/[0.18] dark:text-amber-200">
        <UserPlus className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{invite.email}</div>
        <div className="text-[11px] text-foreground/55">
          <span className="mr-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/[0.18] dark:text-amber-200">Pending</span>
          {ROLE_LABEL[invite.role] ?? invite.role} · expires {formatDate(invite.expires_at)}
        </div>
      </div>
      <button type="button" onClick={() => onCopy(invite.token)} className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.1] bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground/70 transition-colors hover:bg-foreground/[0.04]">
        <Copy className="h-3 w-3" /> Link
      </button>
      <button type="button" disabled={revoking} onClick={() => onRevoke(invite.id)} className="rounded-xl border border-foreground/10 bg-card p-2 text-foreground/35 transition-colors hover:border-rose-500/40 hover:bg-rose-500/[0.08] hover:text-rose-500" aria-label="Revoke">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function inviteLink(token: string): string {
  return `${window.location.origin}/team-invite/${token}`;
}
function copyInviteLink(token: string): void {
  void navigator.clipboard.writeText(inviteLink(token));
  toast.success('Invite link copied');
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
