import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ShieldCheck, UserMinus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type AdminTeamMember } from '@/modules/super-admin/api/admin';

export default function AdminTeam() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data, isLoading } = useQuery<{ items: AdminTeamMember[] }>({
    queryKey: ['admin', 'team'],
    queryFn: () => adminApi.listTeam(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'team'] });

  const invite = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      adminApi.inviteSuperAdmin(email, password),
    onSuccess: (r) => {
      toast.success(`Granted super_admin to ${r.email}.`);
      invalidate();
      setShowInvite(false);
    },
    onError: onErr,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeSuperAdmin(id),
    onSuccess: () => { toast.success('Super admin revoked.'); invalidate(); },
    onError: onErr,
  });

  const members = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">Configuration · Sirah team</span>
            <h1 className="text-balance mt-1">Sirah Digital staff</h1>
            <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 mt-2">
              Internal team with platform-wide super admin access. They can see all workspaces,
              manage subscriptions, ban users — but don&apos;t belong to any workspace themselves.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-4 w-4" /> Add super admin
          </button>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              {isLoading ? 'Loading…' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {members.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <ShieldCheck className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/80 dark:text-foreground/65">No super admins yet.</div>
                </li>
              )}
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-foreground/[0.02]">
                  <ShieldCheck className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.email ?? '(no email)'}</div>
                    <div className="text-[11px] text-foreground/75 dark:text-foreground/55">
                      joined {new Date(m.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (members.length === 1) {
                        toast.error('Cannot revoke the last super admin.');
                        return;
                      }
                      if (confirm(`Revoke super admin from ${m.email}? Their auth account stays, just the role is removed.`)) {
                        revoke.mutate(m.id);
                      }
                    }}
                    disabled={revoke.isPending}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"
                    title="Revoke"
                  >
                    {revoke.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Revoke</span>
                  </button>
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>
      </motion.div>

      {showInvite && (
        <InviteDialog
          loading={invite.isPending}
          onClose={() => setShowInvite(false)}
          onSubmit={(email, password) => invite.mutate({ email, password })}
        />
      )}
    </div>
  );
}

function InviteDialog({
  loading, onClose, onSubmit,
}: { loading: boolean; onClose: () => void; onSubmit: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { toast.error('Valid email required.'); return; }
    if (password.length < 8)  { toast.error('Password must be at least 8 chars.'); return; }
    onSubmit(email.trim(), password);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 ">
      <Glass variant="heavy" className="w-full max-w-md p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Add super admin</h2>
            <p className="mt-1 text-xs text-foreground/80 dark:text-foreground/65">
              Creates the auth user (no email confirmation needed) and grants the super_admin role.
            </p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-foreground/75 dark:text-foreground/55 hover:bg-foreground/[0.06]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Email</div>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus
              placeholder="staff@sirahdigital.in"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-foreground/80 dark:text-foreground/65">Temporary password</div>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars — they'll change it"
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-foreground/75 dark:text-foreground/55">
              They can change this at /auth → Forgot password? Sirah Digital domain is recommended.
            </div>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-full border border-foreground/10 px-4 py-2 text-xs text-foreground/80 dark:text-foreground/65 hover:bg-foreground/[0.04]">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className={cn('inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white transition-transform', !loading && 'hover:scale-[1.02]', loading && 'opacity-60')}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create + grant super admin
            </button>
          </div>
        </form>
      </Glass>
    </div>
  );
}

function onErr(err: unknown) {
  toast.error(err instanceof ApiError ? err.message : (err as Error).message);
}
