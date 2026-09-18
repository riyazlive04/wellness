import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Mail, Trash2, Users } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

/**
 * Abandoned-trial retention: who is scheduled for deletion, and when.
 *
 * Read-only on purpose. Warning emails and the purge itself are the next
 * phases; this page exists first so the list can be checked against reality
 * before anything irreversible runs.
 */

interface PurgeCandidate {
  workspaceId: string;
  name: string;
  status: string;
  ownerEmail: string | null;
  trialEndedAt: string;
  dueAt: string;
  daysUntilDue: number;
  clients: number;
  programs: number;
  members: number;
}

interface PurgeQueue {
  retentionMonths: number;
  items: PurgeCandidate[];
  dueNow: number;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function AdminRetention() {
  const { data, isLoading, isError } = useQuery<PurgeQueue>({
    queryKey: ['admin', 'retention', 'purge-queue'],
    queryFn: () => api.get<PurgeQueue>('/api/v1/admin/retention/purge-queue'),
  });

  const items = data?.items ?? [];
  const months = data?.retentionMonths ?? 6;
  const soon = items.filter((i) => i.daysUntilDue > 0 && i.daysUntilDue <= 30).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Operations · Retention
          </span>
          <h1 className="text-balance mt-1">Abandoned trials</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Workspaces whose {months === 6 ? '14-day' : ''} trial ended without a plan. Their data is
            kept for {months} months from the day the trial ended, then deleted. Nothing is deleted
            automatically yet - this list is the record of what is coming.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat icon={Users} label="Abandoned trials" value={items.length} />
          <Stat icon={CalendarClock} label="Due within 30 days" value={soon} tone={soon ? 'warn' : undefined} />
          <Stat icon={Trash2} label="Past their date" value={data?.dueNow ?? 0} tone={data?.dueNow ? 'danger' : undefined} />
        </motion.div>

        <motion.div variants={fadeUp}>
          {isError ? (
            <Glass className="p-8 text-center text-sm text-foreground/65">Could not load the retention list.</Glass>
          ) : isLoading ? (
            <Glass className="p-8 text-center text-sm text-foreground/60">Loading…</Glass>
          ) : !items.length ? (
            <Glass className="p-10 text-center text-sm text-foreground/65">
              No abandoned trials. Every workspace either still has time left or is on a paid plan.
            </Glass>
          ) : (
            <div className="space-y-3">
              {items.map((w) => {
                const overdue = w.daysUntilDue <= 0;
                const soonish = !overdue && w.daysUntilDue <= 30;
                return (
                  <Glass key={w.workspaceId} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-foreground">{w.name}</span>
                          {w.status !== 'active' && (
                            <span className="rounded-full bg-foreground/[0.07] px-2.5 py-0.5 text-[11px] text-foreground/60">
                              {w.status}
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                              overdue
                                ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                                : soonish
                                  ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                                  : 'bg-teal-500/12 text-teal-800 dark:text-teal-200',
                            )}
                          >
                            {overdue
                              ? `${Math.abs(w.daysUntilDue)} days past due`
                              : `${w.daysUntilDue} days left`}
                          </span>
                        </div>
                        {w.ownerEmail && (
                          <a
                            href={`mailto:${w.ownerEmail}`}
                            className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
                          >
                            <Mail className="h-3.5 w-3.5" /> {w.ownerEmail}
                          </a>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/50">
                          <span>Trial ended {fmt(w.trialEndedAt)}</span>
                          <span>Delete on {fmt(w.dueAt)}</span>
                          <span>{w.clients} clients</span>
                          <span>{w.programs} programs</span>
                          <span>{w.members} team members</span>
                        </div>
                      </div>
                    </div>
                  </Glass>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div variants={fadeUp}>
          <Glass className="flex items-start gap-3 p-5 text-xs leading-relaxed text-foreground/60">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <span>
              Coming next: warning emails 30, 7 and 1 day before the date, a download-my-data button
              on the trial lock screen, and the deletion job itself - which keeps a snapshot for 30
              days, keeps anonymous counts for analytics, and disables the practice's client logins.
            </span>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'warn' | 'danger';
}) {
  return (
    <Glass className="p-5">
      <span
        className={cn(
          'grid h-10 w-10 place-items-center rounded-xl',
          tone === 'danger'
            ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
            : tone === 'warn'
              ? 'bg-amber-500/12 text-amber-600 dark:text-amber-300'
              : 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-foreground/55">{label}</div>
    </Glass>
  );
}
