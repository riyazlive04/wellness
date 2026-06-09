import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Download, Sparkles, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';

export default function ClientReports() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Insights · Reports</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Your wellness story.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            AI-generated reports + downloadable progress summaries you can share.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600 dark:text-violet-200" />
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                    AI summary · This week
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">
                    Your wellness story for the past 7 days appears here once SIRAH has enough data to draft it.
                    The legacy Sheizen platform generated PDF summaries — that flow rebuilds in this surface next.
                  </p>
                </div>
              </div>
            </Glass>
          </AIGlow>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6 grid gap-3 sm:grid-cols-2">
          <Glass className="p-5">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Progress</div>
            <div className="mt-1 text-base font-semibold">Weekly progress report</div>
            <p className="mt-1 text-xs text-foreground/65">
              Trends across meals, habits, and activity over the past 7 days.
            </p>
            <button
              type="button"
              onClick={() => toast.message('PDF export ships with the Reports module.')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
            >
              <Download className="h-3 w-3" /> Generate
            </button>
          </Glass>

          <Glass className="p-5">
            <FileText className="h-5 w-5 text-violet-600 dark:text-violet-300" />
            <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">Wellness</div>
            <div className="mt-1 text-base font-semibold">Monthly wellness summary</div>
            <p className="mt-1 text-xs text-foreground/65">
              The big picture — weight, sleep, mood, and milestones.
            </p>
            <button
              type="button"
              onClick={() => toast.message('PDF export ships with the Reports module.')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
            >
              <Download className="h-3 w-3" /> Generate
            </button>
          </Glass>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}