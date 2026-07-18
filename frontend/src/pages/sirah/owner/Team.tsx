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
  type WorkspaceInvite,
} from '@/modules/workspace/api/tenancy';
import { cn } from '@/lib/utils';

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

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => tenancyApi.updateMemberRole(id, role),
    onSuccess: () => { toast.success('Role updated'); invalidate(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => tenancyApi.removeMember(id),
    onSuccess: () => { toast.success('Member removed'); invalidate(); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => tenancyApi.revokeInvite(id),
    onSuccess: () => { toast.success('Invite revoked'); invalidate(); },
    onError: (e: unknown) => toast.error((e as Error).message),
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
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">Team</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Your practice's people</h1>
              <p className="mt-1 text-sm text-foreground/60">
                Invite staff, assign roles, and control who sees what. Seats are governed by your plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              disabled={atCap}
              className={cn(
                'inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow',
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
            <Glass className={cn('overflow-hidden p-5 md:p-6', atCap && 'border-amber-300/30 bg-amber-300/[0.04]')}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Team seats</div>
                    <div className="mt-0.5 text-base font-medium text-foreground">
                      <span className="text-2xl font-semibold tabular-nums">{seatsUsed}</span>
                      <span className="ml-1 capitalize text-foreground/60">
                        of {teamLimit ?? '∞'} on the {planName} plan
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-3 md:items-end">
                  {teamLimit != null && (
                    <div className="h-1.5 w-48 overflow-hidden rounded-full bg-foreground/[0.05]">
                      <div
                        className={cn('h-full rounded-full transition-all',
                          atCap ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]')}
                        style={{ width: `${seatPct}%` }}
                      />
                    </div>
                  )}
                  {atCap ? (
                    <Link to="/billing" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:scale-[1.02] cta-glow active:scale-[0.97]">
                      Upgrade to add more <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : teamLimit != null ? (
                    <span className="text-xs text-foreground/60">{teamLimit - seatsUsed} {teamLimit - seatsUsed === 1 ? 'seat' : 'seats'} remaining</span>
                  ) : (
                    <span className="text-xs text-foreground/60">Unlimited seats</span>
                  )}
                </div>
              </div>
            </Glass>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard icon={Users} label="Active members" value={String(active.length)} hint="in this workspace" accent="sage" />
            <KPICard icon={UserPlus} label="Pending invites" value={String(pending.length)} hint={pending.length === 0 ? 'none waiting' : 'awaiting acceptance'} accent="sand" />
            <KPICard icon={ShieldCheck} label="AI calls (mo)" value={limitsQ.data ? String(limitsQ.data.usage.aiCallsThisMonth) : '-'} hint={limitsQ.data?.limits.aiCallsPerMonth ? `of ${limitsQ.data.limits.aiCallsPerMonth.toLocaleString()}` : 'this month'} accent="indigo" />
          </motion.div>

          {/* Members */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="border-b border-foreground/[0.06] px-5 py-4">
                <div className="text-sm font-medium">Members</div>
                <div className="text-xs text-foreground/60">Active team accounts</div>
              </div>
              {membersQ.isLoading ? (
                <div className="p-8 text-center text-sm text-foreground/55"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
              ) : (
                <ul className="divide-y divide-foreground/[0.05]">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-foreground/[0.06] text-xs font-medium text-foreground/70">
                        {(m.email ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.email ?? m.user_id.slice(0, 8)}</div>
                        <div className="text-[11px] text-foreground/50">joined {formatDate(m.joined_at)}</div>
                      </div>
                      <Select
                        value={m.role}
                        disabled={roleMut.isPending}
                        onValueChange={(role) => roleMut.mutate({ id: m.id, role })}
                      >
                        <SelectTrigger
                          aria-label="Role"
                          className="h-auto w-[132px] rounded-lg border-foreground/[0.1] bg-transparent px-2 py-1 text-xs focus:border-teal-500/40"
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
                            className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/40 bg-teal-400/[0.08] px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-400/[0.15] dark:text-teal-200"
                            title="Choose which features this member can use"
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Permissions
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (confirm(`Remove ${m.email ?? 'this member'}?`)) removeMut.mutate(m.id); }}
                            className="rounded-md p-1.5 text-foreground/35 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
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
            </Glass>
          </motion.div>

          {/* Pending invites */}
          {pending.length > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-5 py-4 text-sm font-medium">Pending invites</div>
                <ul className="divide-y divide-foreground/[0.05]">
                  {pending.map((inv) => (
                    <PendingInviteRow key={inv.id} invite={inv} onCopy={copyInviteLink} onRevoke={(id) => revokeMut.mutate(id)} revoking={revokeMut.isPending} />
                  ))}
                </ul>
              </Glass>
            </motion.div>
          )}

          {/* Permissions matrix (informational) */}
          <motion.div variants={fadeUp}>
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Permissions</div>
              <div className="text-sm font-medium text-foreground">What each role can do</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 ">
      <Glass className="w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
          <h3 className="text-sm font-medium">Add a team member</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.05]">
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
                <div className="space-y-2 rounded-lg border border-foreground/[0.1] bg-foreground/[0.03] p-3 text-xs">
                  <Cred label="Login link" value={loginUrl} onCopy={() => copyText(loginUrl)} />
                  <Cred label="Email" value={createdLogin.email} onCopy={() => copyText(createdLogin.email)} />
                  <Cred label="Password" value={password} mono onCopy={() => copyText(password)} />
                </div>
              ) : (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 text-xs text-amber-700 dark:text-amber-200">
                  This email already had an account, so they were added with their <b>existing</b> password (the one you set wasn't applied). They sign in at {loginUrl}.
                </p>
              )}
              <p className="text-[11px] text-foreground/45">Share these securely - ask them to change the password after first sign-in.</p>
              <button type="button" onClick={onClose} className="w-full rounded-full bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600">Done</button>
            </div>
          ) : created ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground/70">
                Invite for <span className="font-medium">{created.email}</span> as {ROLE_LABEL[created.role]} created. Share this link:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-foreground/[0.05] px-3 py-2 text-xs">{inviteLink(created.token)}</code>
                <button type="button" onClick={() => copyInviteLink(created.token)} className="rounded-lg border border-foreground/[0.1] p-2 hover:bg-foreground/[0.04]" aria-label="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-foreground/45">The link expires in 14 days. They'll join after signing in and accepting.</p>
              <button type="button" onClick={onClose} className="w-full rounded-full bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600">Done</button>
            </div>
          ) : (
            <>
              {/* Mode toggle: email invite vs. create-a-login-now */}
              <div className="flex rounded-lg border border-foreground/[0.1] p-0.5 text-xs">
                <button type="button" onClick={() => setMode('invite')} className={cn('flex-1 rounded-md py-1.5 font-medium transition-colors', mode === 'invite' ? 'bg-teal-500 text-white' : 'text-foreground/60 hover:text-foreground')}>Send invite link</button>
                <button type="button" onClick={() => setMode('login')} className={cn('flex-1 rounded-md py-1.5 font-medium transition-colors', mode === 'login' ? 'bg-teal-500 text-white' : 'text-foreground/60 hover:text-foreground')}>Create login now</button>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" className="mt-1.5 w-full rounded-lg border border-foreground/[0.1] bg-transparent px-3 py-2 text-sm focus:border-teal-500/40 focus:outline-none" />
              </div>

              {mode === 'login' && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Password</span>
                    <button type="button" onClick={genPassword} className="text-[11px] font-medium text-teal-600 hover:underline dark:text-teal-300">Generate</button>
                  </div>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="mt-1.5 w-full rounded-lg border border-foreground/[0.1] bg-transparent px-3 py-2 font-mono text-sm focus:border-teal-500/40 focus:outline-none" />
                  <p className="mt-1 text-[11px] text-foreground/45">You'll share this with them; they can change it after signing in.</p>
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Role</span>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger
                    aria-label="Role"
                    className="mt-1.5 h-auto w-full rounded-lg border-foreground/[0.1] bg-transparent px-3 py-2 text-sm focus:border-teal-500/40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map((r) => <SelectItem key={r} value={r} className="text-sm">{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 hover:border-foreground/15">Cancel</button>
                {mode === 'invite' ? (
                  <button
                    type="button"
                    disabled={!email.trim() || inviteMut.isPending}
                    onClick={() => inviteMut.mutate()}
                    className={cn('inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-600', (!email.trim() || inviteMut.isPending) && 'opacity-60')}
                  >
                    {inviteMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Create invite
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!email.trim() || password.trim().length < 8 || createMemberMut.isPending}
                    onClick={() => createMemberMut.mutate()}
                    className={cn('inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-600', (!email.trim() || password.trim().length < 8 || createMemberMut.isPending) && 'opacity-60')}
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
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{invite.email}</div>
        <div className="text-[11px] text-foreground/50">{ROLE_LABEL[invite.role] ?? invite.role} · expires {formatDate(invite.expires_at)}</div>
      </div>
      <button type="button" onClick={() => onCopy(invite.token)} className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.1] px-2.5 py-1 text-[11px] text-foreground/70 hover:bg-foreground/[0.04]">
        <Copy className="h-3 w-3" /> Link
      </button>
      <button type="button" disabled={revoking} onClick={() => onRevoke(invite.id)} className="rounded-md p-1.5 text-foreground/35 hover:bg-rose-500/10 hover:text-rose-500" aria-label="Revoke">
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
