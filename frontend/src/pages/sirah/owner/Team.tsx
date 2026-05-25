import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Users, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { MemberRow } from '@/modules/workspace/team/components/MemberRow';
import { InviteMemberDialog } from '@/modules/workspace/team/components/InviteMemberDialog';
import { RolePermissionsTable } from '@/modules/workspace/team/components/RolePermissionsTable';
import { MOCK_TEAM } from '@/modules/workspace/team/data/mockTeam';
import type { MemberRole, TeamMember } from '@/modules/workspace/team/types';
import { cn } from '@/lib/utils';

// Mirrors the Subscription page — Pro plan currently allows 3 team seats.
const PLAN_SEATS = 3;
const PLAN_NAME = 'Pro';

export default function OwnerTeam() {
  const workspace = readWorkspace();
  const [team, setTeam] = useState<TeamMember[]>(MOCK_TEAM);
  const [inviteOpen, setInviteOpen] = useState(false);

  const active = useMemo(() => team.filter((m) => m.status === 'active'), [team]);
  const pending = useMemo(() => team.filter((m) => m.status === 'invited'), [team]);

  const seatsUsed = active.length + pending.length;
  const seatPct = Math.min(100, (seatsUsed / PLAN_SEATS) * 100);

  function changeRole(id: string, role: MemberRole) {
    setTeam((t) => t.map((m) => (m.id === id ? { ...m, role } : m)));
    toast.success('Role updated.');
  }

  function removeMember(id: string) {
    setTeam((t) => t.filter((m) => m.id !== id));
    toast.success('Member removed.');
  }

  async function handleInvite(p: { name: string; email: string; role: MemberRole }) {
    await new Promise((r) => setTimeout(r, 500));
    setTeam((t) => [
      ...t,
      {
        id: `tm_${Math.random().toString(36).slice(2, 8)}`,
        name: p.name,
        email: p.email,
        role: p.role,
        status: 'invited',
        joinedAt: new Date().toISOString(),
        assignedClients: 0,
        specializations: [],
      },
    ]);
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${active.length} active · ${pending.length} pending`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/40">Team</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Your practice's people
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                Invite managers and coaches, assign roles, and control who sees what.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <UserPlus className="h-4 w-4" />
              Invite member
            </button>
          </motion.div>

          {/* Seat usage banner */}
          <motion.div variants={fadeUp}>
            <Glass className={cn('overflow-hidden p-5 md:p-6', seatsUsed >= PLAN_SEATS && 'border-amber-300/30 bg-amber-300/[0.04]')}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-blue-600/25 to-fuchsia-500/20 text-violet-200">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                      Team seats
                    </div>
                    <div className="mt-0.5 text-base font-medium text-foreground">
                      <span className="text-2xl font-semibold tabular-nums">{seatsUsed}</span>
                      <span className="ml-1 text-foreground/45">of {PLAN_SEATS} on the {PLAN_NAME} plan</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-stretch gap-3 md:items-end">
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-foreground/[0.05]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${seatPct}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(
                        'h-full rounded-full',
                        seatsUsed >= PLAN_SEATS
                          ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                          : 'bg-gradient-to-r from-blue-600 to-fuchsia-500',
                      )}
                    />
                  </div>

                  {seatsUsed >= PLAN_SEATS ? (
                    <Link
                      to="/subscription"
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-medium text-elevated transition-transform hover:scale-[1.02]"
                    >
                      Upgrade to add more
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-xs text-foreground/45">
                      {PLAN_SEATS - seatsUsed} {PLAN_SEATS - seatsUsed === 1 ? 'seat' : 'seats'} remaining
                    </span>
                  )}
                </div>
              </div>
            </Glass>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard
              icon={Users}
              label="Active members"
              value={String(active.length)}
              hint={`${active.filter((m) => m.role === 'manager').length} managers · ${active.filter((m) => m.role === 'coach').length} coaches`}
              accent="sage"
            />
            <KPICard
              icon={UserPlus}
              label="Pending invites"
              value={String(pending.length)}
              hint={pending.length === 0 ? 'none waiting' : 'awaiting acceptance'}
              accent="sand"
            />
            <KPICard
              icon={ShieldCheck}
              label="Total client load"
              value={String(active.reduce((a, m) => a + m.assignedClients, 0))}
              hint="across the workspace"
              accent="indigo"
            />
          </motion.div>

          {/* Members table */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                <div>
                  <div className="text-sm font-medium">Members</div>
                  <div className="text-xs text-foreground/45">Active and pending team accounts</div>
                </div>
              </div>

              {/* Header */}
              <div className="hidden grid-cols-[auto_1fr_140px_120px_120px_36px] gap-4 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/40 md:grid">
                <div className="w-10" />
                <div>Name</div>
                <div>Role</div>
                <div>Load</div>
                <div className="text-right">Status</div>
                <div></div>
              </div>

              <ul>
                {team.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onRoleChange={changeRole}
                    onRemove={removeMember}
                  />
                ))}
              </ul>
            </Glass>
          </motion.div>

          {/* Permissions matrix */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">Permissions</div>
                <div className="text-sm font-medium text-foreground">What each role can do</div>
              </div>
              <button
                type="button"
                onClick={() => toast('Custom roles ship with the Enterprise plan.')}
                className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/70 hover:bg-foreground/[0.06]"
              >
                Create custom role
              </button>
            </div>
            <RolePermissionsTable />
            <div className="mt-3 flex items-center gap-4 text-[10px] text-foreground/45">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Full access
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                Partial / scoped
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-foreground/30" />
                No access
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
        seatsUsed={seatsUsed}
        seatsTotal={PLAN_SEATS}
      />
    </OwnerLayout>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
