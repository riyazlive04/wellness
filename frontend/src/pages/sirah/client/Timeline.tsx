import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Clock, Target, PenLine, Calendar, Trophy, FileText, Loader2 } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { wellnessApi, type TimelineItem } from '@/modules/wellness/api';
import { cn } from '@/lib/utils';

const KIND_META: Record<string, { icon: typeof Clock; tint: string }> = {
  goal: { icon: Target, tint: 'bg-violet-400/15 text-violet-600 dark:text-violet-300' },
  journal: { icon: PenLine, tint: 'bg-blue-400/15 text-blue-600 dark:text-blue-300' },
  appointment: { icon: Calendar, tint: 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300' },
  milestone: { icon: Trophy, tint: 'bg-orange-400/15 text-orange-600 dark:text-orange-300' },
  report: { icon: FileText, tint: 'bg-fuchsia-400/15 text-fuchsia-600 dark:text-fuchsia-300' },
};

export default function ClientTimeline() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const timelineQ = useQuery({ queryKey: ['wellness', 'timeline'], queryFn: wellnessApi.getTimeline });
  const items = timelineQ.data ?? [];

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-2xl px-5 py-6">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-5">
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Clock className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Timeline</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your wellness journey</h1>
            <p className="mt-1 text-sm text-foreground/60">Goals, reflections, sessions and milestones — all in one place.</p>
          </motion.div>

          {timelineQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : items.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">Nothing here yet</div>
              <div className="mt-1 text-xs text-foreground/50">Set a goal, write a journal entry, or book a session to start your timeline.</div>
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp} className="relative space-y-3 pl-5">
              <div className="absolute bottom-2 left-[9px] top-2 w-px bg-foreground/[0.08]" />
              {items.map((it, i) => <TimelineRow key={i} item={it} />)}
            </motion.div>
          )}
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
      <div className={cn('absolute -left-5 top-1 grid h-[18px] w-[18px] place-items-center rounded-full ring-4 ring-canvas', meta.tint)}>
        <Icon className="h-2.5 w-2.5" />
      </div>
      <Glass className="p-3.5">
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
      </Glass>
    </div>
  );
}
