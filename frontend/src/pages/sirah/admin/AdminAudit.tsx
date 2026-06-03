import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText, Search } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { adminApi, type AuditEntry, type ListAuditResult } from '@/modules/super-admin/api/admin';

const PAGE_SIZE = 50;

const ACTION_PREFIX_FILTERS: Array<{ value: string; label: string }> = [
  { value: '',                  label: 'All' },
  { value: 'workspace.',        label: 'Workspaces' },
  { value: 'user.',             label: 'Users' },
  { value: 'super_admin.',      label: 'Super admin' },
  { value: 'announcement.',     label: 'Announcements' },
  { value: 'config.',           label: 'Config' },
];

export default function AdminAudit() {
  const [actionPrefix, setActionPrefix] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery<ListAuditResult>({
    queryKey: ['admin', 'audit', { actionPrefix, offset }],
    queryFn: () =>
      adminApi.listAudit({
        actionPrefix: actionPrefix || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/60">Operations · Audit log</span>
          <h1 className="text-balance mt-1">Audit log</h1>
          <p className="text-pretty text-base text-foreground/65 mt-2">
            Append-only record of every super-admin action: who did what to which workspace or user.
            Append-only on the DB, retained for compliance.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
          {ACTION_PREFIX_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setActionPrefix(f.value); setOffset(0); }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                actionPrefix === f.value
                  ? 'border-violet-400/60 bg-violet-400/10 text-violet-700 dark:text-violet-200'
                  : 'border-foreground/10 bg-foreground/[0.02] text-foreground/65 hover:bg-foreground/[0.06]',
              )}
            >
              {f.label}
            </button>
          ))}
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
              {isLoading ? 'Loading…' : total === 0 ? 'No entries' : `Showing ${offset + 1}–${pageEnd} of ${total}`}
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {items.length === 0 && !isLoading && (
                <li className="flex flex-col items-center gap-3 py-12 text-center">
                  <ScrollText className="h-8 w-8 text-foreground/30" />
                  <div className="text-sm text-foreground/65">No audit entries yet. They appear here as super admins act.</div>
                </li>
              )}
              {items.map((entry) => <AuditRow key={entry.id} entry={entry} />)}
            </ul>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-5 py-3 text-xs text-foreground/65">
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

function AuditRow({ entry }: { entry: AuditEntry }) {
  const tone =
    entry.action.endsWith('.suspend') || entry.action.endsWith('.ban') || entry.action.endsWith('.soft_delete') || entry.action.endsWith('.delete') || entry.action.endsWith('.revoke')
      ? 'border-amber-300/40 bg-amber-300/10 text-amber-700 dark:text-amber-200'
    : entry.action.endsWith('.activate') || entry.action.endsWith('.unban') || entry.action.endsWith('.grant') || entry.action.endsWith('.publish')
      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200'
    : 'border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200';

  const when = new Date(entry.created_at);
  const whenLabel = `${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 px-5 py-3 hover:bg-foreground/[0.02]">
      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', tone)}>
        {entry.action}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm">
          <span className="text-foreground/65">by</span>{' '}
          <span className="font-medium">{entry.actor_email ?? '(system)'}</span>
          {entry.resource_label && (
            <>
              {' '}
              <span className="text-foreground/40">→</span>{' '}
              <span className="text-foreground/85">{entry.resource_label}</span>
            </>
          )}
        </div>
        {entry.resource_id && (
          <div className="mt-0.5 truncate font-mono text-[10px] text-foreground/45">{entry.resource_id}</div>
        )}
      </div>
      <span className="text-[11px] tabular-nums text-foreground/55">{whenLabel}</span>
    </li>
  );
}
