import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Clock, Target, PenLine, Calendar, Trophy, FileText, Loader2, ArrowRight, type LucideIcon,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type TimelineItem } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const KIND_META: Record<string, { icon: LucideIcon; tint: string }> = {
  goal: { icon: Target, tint: 'bg-violet-400/15 text-violet-600 dark:text-violet-300' },
  journal: { icon: PenLine, tint: 'bg-blue-400/15 text-blue-600 dark:text-blue-300' },
  appointment: { icon: Calendar, tint: 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300' },
  milestone: { icon: Trophy, tint: 'bg-orange-400/15 text-orange-600 dark:text-orange-300' },
  report: { icon: FileText, tint: 'bg-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-300' },
};

const STATS: Array<{ kind: string; label: string; icon: LucideIcon; tint: string }> = [
  { kind: 'goal', label: 'Goals', icon: Target, tint: 'text-violet-600 dark:text-violet-300' },
  { kind: 'journal', label: 'Reflections', icon: PenLine, tint: 'text-blue-600 dark:text-blue-300' },
  { kind: 'appointment', label: 'Sessions', icon: Calendar, tint: 'text-emerald-600 dark:text-emerald-300' },
  { kind: 'milestone', label: 'Milestones', icon: Trophy, tint: 'text-orange-600 dark:text-orange-300' },
];

const QUICK_ADD: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/portal/goals', label: 'Set a goal', icon: Target },
  { to: '/portal/journal', label: 'Write a reflection', icon: PenLine },
  { to: '/portal/appointments', label: 'Book a session', icon: Calendar },
  { to: '/portal/reports', label: 'View reports', icon: FileText },
];

export default function ClientTimeline() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const timelineQ = useQuery({ queryKey: ['wellness', 'timeline'], queryFn: wellnessApi.getTimeline });
  const items = timelineQ.data ?? [];

  const counts = items.reduce<Record<string, number>>((acc, it) => {
    acc[it.kind] = (acc[it.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Clock className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Timeline</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Your wellness journey</h1>
            <p className="mt-1.5 text-sm text-foreground/60">Goals, reflections, sessions and milestones — all in one place.</p>
          </motion.div>

          {/* Stat strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <Glass key={s.kind} className="p-4">
                <div className="flex items-center gap-2">
                  <s.icon className={cn('h-3.5 w-3.5', s.tint)} strokeWidth={1.8} />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{s.label}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{counts[s.kind] ?? 0}</div>
              </Glass>
            ))}
          </motion.div>

          {/* Body: timeline + side panel */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Timeline */}
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">Activity</span>
                  <span className="text-[11px] text-foreground/45">{items.length} {items.length === 1 ? 'entry' : 'entries'}</span>
                </div>

                {timelineQ.isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <Clock className="h-8 w-8 text-foreground/25" />
                    <div className="mt-3 text-sm text-foreground/70">Nothing here yet</div>
                    <div className="mt-1 text-xs text-foreground/50">Set a goal, write a journal entry, or book a session to start your timeline.</div>
                  </div>
                ) : (
                  <div className="relative space-y-3 py-5 pl-9 pr-5">
                    <div className="absolute bottom-6 left-[26px] top-6 w-px bg-foreground/[0.08]" />
                    {items.map((it, i) => <TimelineRow key={i} item={it} />)}
                  </div>
                )}
              </Glass>
            </motion.div>

            {/* Side: quick add */}
            <motion.div variants={fadeUp} className="space-y-5">
              <Glass className="overflow-hidden">
                <div className="border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">Add to your journey</span>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  {QUICK_ADD.map((q) => (
                    <Link
                      key={q.to}
                      to={q.to}
                      className="group flex items-center gap-3 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 transition-all hover:-translate-y-px hover:bg-foreground/[0.05]"
                    >
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-700 dark:text-violet-300">
                        <q.icon className="h-4 w-4" />
                      </div>
                      <span className="flex-1 text-sm font-medium">{q.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-foreground/30 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  ))}
                </div>
              </Glass>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const meta = KIND_META[item.kind] ?? KIND_META.journal;
  const Icon = meta.icon;
  const when = item.at
    ? new Date(item.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  return (
    <div className="relative">
      <div className={cn('absolute -left-[26px] top-2 grid h-[22px] w-[22px] place-items-center rounded-full ring-4 ring-canvas', meta.tint)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] p-4 transition-colors hover:bg-foreground/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium capitalize">{item.title}</span>
              {item.variant && item.variant !== 'scheduled' && (
                <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/55">{item.variant}</span>
              )}
            </div>
            {item.detail && <div className="mt-0.5 line-clamp-2 text-xs text-foreground/55">{item.detail}</div>}
          </div>
          <span className="flex-shrink-0 text-[11px] text-foreground/40">{when}</span>
        </div>
      </div>
    </div>
  );
}
