import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users, Flame, Award } from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';

const CHALLENGES = [
  { id: '1', title: '7-day water streak', participants: 124, days: 7, accent: 'from-sky-400 to-blue-500' },
  { id: '2', title: 'Sugar-free week',    participants: 56,  days: 7, accent: 'from-rose-400 to-pink-500' },
  { id: '3', title: '10k steps daily',    participants: 89,  days: 30, accent: 'from-orange-400 to-rose-500' },
];

export default function ClientCommunity() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Together · Community</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">You're not alone.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">Challenges and groups from your wellness community.</p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="p-5">
              <Award className="h-5 w-5 text-amber-500" />
              <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">Featured</div>
              <div className="mt-1 text-lg font-semibold">{CHALLENGES[0].title}</div>
              <div className="mt-1 text-sm text-foreground/65">Join {CHALLENGES[0].participants} others — accountability built in.</div>
            </Glass>
          </AIGlow>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Active challenges</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {CHALLENGES.map((c) => (
              <Glass key={c.id} className="p-5">
                <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${c.accent}`} />
                <div className="mt-3 text-base font-semibold">{c.title}</div>
                <div className="mt-2 flex items-center gap-3 text-xs text-foreground/65">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.participants}</span>
                  <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> {c.days}d</span>
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-full border border-foreground/10 px-3 py-1.5 text-xs font-medium hover:bg-foreground/[0.05]"
                >
                  Join
                </button>
              </Glass>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-foreground/45">
            Community persistence ships in the next phase — joining writes to /api/v1/me/challenges.
          </p>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}