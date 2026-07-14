import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, Info, Megaphone } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { adminApi, type MyAnnouncement } from '@/modules/super-admin/api/admin';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';

/**
 * Announcements inbox for workspace members. Shows every published
 * announcement targeted to the current member (by workspace + role),
 * current and past, newest first. The dismissable banner at the top of
 * the shell can be closed; this page is the durable record.
 */
export default function OwnerAnnouncements() {
  const ws = readWorkspaceSummary();
  const { data, isLoading, error } = useQuery<{ items: MyAnnouncement[] }>({
    queryKey: ['announcements', 'mine'],
    queryFn: () => adminApi.myAnnouncements(),
    retry: 1,
  });
  const items = data?.items ?? [];
  const activeCount = items.filter((a) => a.is_active).length;

  return (
    <OwnerLayout
      practiceName={ws.practiceName}
      ownerName={ws.ownerName}
      initials={ws.initials}
      trialDaysLeft={28}
      topbarContext="Workspace · Announcements"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-8 md:px-10 md:py-12">
        <motion.div variants={stagger(0.07, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* Hero */}
          <motion.div variants={fadeUp} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-600 dark:text-teal-300">
                <Megaphone className="h-4 w-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/60">Workspace</span>
            </div>
            <h1 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
              Announcements
            </h1>
            <p className="text-pretty text-sm text-foreground/65 md:text-base">
              Notices from the NUSI team for your workspace — current and past, newest first.
            </p>
            {items.length > 0 && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-foreground/55">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {activeCount} active
                </span>
                <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1">{items.length} total</span>
              </div>
            )}
          </motion.div>

          {error && (
            <motion.div variants={fadeUp}>
              <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
                Couldn't load announcements: {(error as Error).message}
              </Glass>
            </motion.div>
          )}

          {/* Loading skeletons */}
          {isLoading && (
            <motion.div variants={fadeUp} className="space-y-3">
              {[0, 1].map((i) => (
                <Glass key={i} className="h-24 animate-pulse bg-foreground/[0.03]" />
              ))}
            </motion.div>
          )}

          {/* Empty */}
          {!isLoading && !error && items.length === 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-3 py-16 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.10)]">
                  <Megaphone className="h-6 w-6 text-teal-500/70" />
                </span>
                <div className="text-sm font-medium text-foreground/80">You're all caught up</div>
                <div className="max-w-xs text-xs text-foreground/55">
                  New announcements from the NUSI team will appear here and as a banner at the top of your dashboard.
                </div>
              </Glass>
            </motion.div>
          )}

          {/* List — auto-fit grid: cards always stretch to fill the row,
              so the layout fills the page width for any number of items. */}
          {!isLoading && items.length > 0 && (
            <motion.div
              variants={fadeUp}
              className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]"
            >
              {items.map((a) => <Card key={a.id} a={a} />)}
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

const SEVERITY = {
  critical: {
    Icon: AlertOctagon,
    stripe: 'bg-gradient-to-b from-rose-500 to-rose-400',
    chip: 'bg-rose-400/15 text-rose-700 dark:text-rose-200',
    icon: 'bg-rose-400/15 text-rose-600 dark:text-rose-300',
  },
  warning: {
    Icon: AlertTriangle,
    stripe: 'bg-gradient-to-b from-amber-500 to-amber-300',
    chip: 'bg-amber-300/15 text-amber-700 dark:text-amber-200',
    icon: 'bg-amber-300/15 text-amber-600 dark:text-amber-300',
  },
  info: {
    Icon: Info,
    stripe: 'bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
    chip: 'bg-teal-400/15 text-teal-700 dark:text-teal-200',
    icon: 'bg-teal-400/15 text-teal-600 dark:text-teal-300',
  },
} as const;

function Card({ a }: { a: MyAnnouncement }) {
  const s = SEVERITY[a.severity];
  return (
    <Glass
      className={cn(
        'group relative overflow-hidden p-0 transition-all duration-200 hover:shadow-[0_12px_36px_-16px_rgba(14,154,168,0.45)]',
        !a.is_active && 'opacity-65 saturate-[0.85]',
      )}
    >
      {/* Severity stripe */}
      <span className={cn('absolute inset-y-0 left-0 w-1', s.stripe)} aria-hidden />

      <div className="flex items-start gap-3.5 py-4 pl-5 pr-4">
        <span className={cn('mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl', s.icon)}>
          <s.Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{a.title}</span>
            <span className={cn('rounded-full px-2 py-0 text-[9px] font-semibold uppercase tracking-[0.14em]', s.chip)}>
              {a.severity}
            </span>
            {a.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            ) : (
              <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Expired
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-foreground/75">{a.body}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground/45">
            <span>{relativeTime(a.published_at)}</span>
            <span className="text-foreground/25">·</span>
            <span>{new Date(a.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {a.ends_at && (
              <>
                <span className="text-foreground/25">·</span>
                <span>{a.is_active ? 'ends' : 'ended'} {new Date(a.ends_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }

function readWorkspaceSummary(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
