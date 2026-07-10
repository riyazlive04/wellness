import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Check,
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  adminApi,
  type AdminUserListItem,
  type ListUsersResult,
} from '@/modules/super-admin/api/admin';

const PAGE_SIZE = 25;

export default function AdminUsers() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const debouncedQ = useDebounced(q, 300);

  const { data, isLoading, error } = useQuery<ListUsersResult>({
    queryKey: ['admin', 'users', { q: debouncedQ, offset }],
    queryFn: () => adminApi.listUsers({ q: debouncedQ || undefined, limit: PAGE_SIZE, offset }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const resetPw = useMutation({
    mutationFn: (id: string) => adminApi.resetPassword(id),
    onSuccess: () => toast.success('Password recovery email sent.'),
    onError: onErr,
  });
  const ban   = useMutation({ mutationFn: (id: string) => adminApi.banUser(id),   onSuccess: () => { toast.success('User banned.');   invalidate(); }, onError: onErr });
  const unban = useMutation({ mutationFn: (id: string) => adminApi.unbanUser(id), onSuccess: () => { toast.success('User unbanned.'); invalidate(); }, onError: onErr });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">Platform · Users</span>
          <h1 className="text-balance mt-1">All users</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 mt-2">
            Every <code>auth.users</code> row across the platform — nutritionists, clients, Sirah Digital staff.
            Reset passwords or ban bad-actor accounts.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="flex justify-end">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setOffset(0); }}
              placeholder="Search email…"
              className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/75 dark:text-foreground/60 focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
            />
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            {error && (
              <div className="border-b border-rose-400/40 bg-rose-400/5 px-5 py-3 text-sm text-rose-700 dark:text-rose-200">
                {(error as Error).message}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              <span>{isLoading ? 'Loading…' : total === 0 ? 'No users' : `Showing ${offset + 1}–${pageEnd} of ${total}`}</span>
            </div>

            <ul className="divide-y divide-foreground/[0.04]">
              {items.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <Users className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/80 dark:text-foreground/65">
                    {q ? 'No users match your search.' : 'No users yet.'}
                  </div>
                </li>
              )}
              {items.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  busy={resetPw.isPending || ban.isPending || unban.isPending}
                  onResetPw={() => resetPw.mutate(u.id)}
                  onBan={() => { if (confirm(`Ban ${u.email}? They won't be able to sign in.`)) ban.mutate(u.id); }}
                  onUnban={() => unban.mutate(u.id)}
                />
              ))}
            </ul>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/80 dark:text-foreground/65">
                <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30">
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={pageEnd >= total}
                  className="inline-flex items-center gap-1 rounded-lg border border-foreground/10 px-2.5 py-1 hover:bg-foreground/[0.04] disabled:opacity-30">
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function UserRow({
  u, busy, onResetPw, onBan, onUnban,
}: { u: AdminUserListItem; busy: boolean; onResetPw: () => void; onBan: () => void; onUnban: () => void }) {
  const isSuperAdmin = u.roles.includes('super_admin');
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3 hover:bg-foreground/[0.02] md:grid-cols-[2fr_1fr_1fr_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {isSuperAdmin && <ShieldCheck className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" aria-label="Super admin" />}
          <span className="truncate text-sm font-medium">{u.email ?? '(no email)'}</span>
          {u.banned && (
            <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-rose-700 dark:text-rose-200">
              Banned
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-foreground/75 dark:text-foreground/55">
          {u.workspace_count} {u.workspace_count === 1 ? 'workspace' : 'workspaces'} · {u.roles.length > 0 ? u.roles.join(', ') : 'no roles'}
        </div>
      </div>
      <div className="hidden text-xs text-foreground/75 dark:text-foreground/55 md:block">
        {u.last_sign_in_at ? `last seen ${new Date(u.last_sign_in_at).toLocaleDateString()}` : 'never signed in'}
      </div>
      <div className="hidden text-xs text-foreground/75 dark:text-foreground/55 md:block">
        joined {new Date(u.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="flex items-center gap-1">
        <ActionBtn label="Reset pw" icon={KeyRound} tone="info" onClick={onResetPw} disabled={busy} />
        {u.banned
          ? <ActionBtn label="Unban" icon={Check} tone="ok"     onClick={onUnban} disabled={busy} />
          : <ActionBtn label="Ban"   icon={Ban}   tone="danger" onClick={onBan}   disabled={busy} />
        }
      </div>
    </li>
  );
}

function ActionBtn({ icon: Icon, label, tone, onClick, disabled }: {
  icon: typeof Ban; label: string; tone: 'info' | 'ok' | 'danger'; onClick: () => void; disabled?: boolean
}) {
  const cls = {
    info:   'text-teal-700 dark:text-teal-300 hover:bg-teal-400/10',
    ok:     'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-400/10',
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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
