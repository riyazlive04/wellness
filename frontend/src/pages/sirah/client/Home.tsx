import { motion } from 'framer-motion';
import {
  Mic,
  Camera,
  Notebook,
  Sparkles,
  Circle,
  CheckCircle2,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  AIGlow,
  BrandMark,
  Glass,
  GradientOrb,
  fadeUp,
  stagger,
} from '@/design-system';
import { ProgressRing } from '@/modules/client/components/ProgressRing';

/**
 * The client-facing home — calm, motivating, AI-guided. The companion
 * experience to the workspace-owner dashboard. Lives at /sirah/me.
 */
export default function ClientHome() {
  const name = readClientName();
  const greeting = greetingPart();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0C10] text-white">
      <GradientOrb color="sage" size={520} position="-top-32 -left-20" />
      <GradientOrb color="sand" size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      <GradientOrb color="indigo" size={360} position="top-1/3 right-1/4" delay={5} driftDuration={32} />

      {/* Mobile-first topbar */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/sirah" className="flex items-center gap-3">
            <BrandMark size={28} animated={false} />
            <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
          </Link>
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-full bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-24 pt-6 md:pt-10">
        <motion.div
          variants={stagger(0.06, 0.05)}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Hero greeting */}
          <motion.div variants={fadeUp}>
            <span className="text-xs uppercase tracking-[0.18em] text-white/40">
              {greeting} · Tuesday, 14 May
            </span>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Hi {name}.
            </h1>
            <p className="mt-2 text-pretty text-white/55">
              You're 2 days into your streak. A small, steady win — let's hold it.
            </p>
          </motion.div>

          {/* Progress rings */}
          <motion.div variants={fadeUp}>
            <Glass className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-white/40">Today</div>
                  <div className="text-sm text-white/55">Three quiet wins to chase.</div>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-white/55 hover:text-white"
                >
                  Details <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2">
                <ProgressRing
                  value={1240 / 1800}
                  label="69%"
                  sub="Calories"
                  accent="sage"
                  size={120}
                />
                <ProgressRing
                  value={1.5 / 3}
                  label="50%"
                  sub="Water"
                  accent="indigo"
                  size={120}
                />
                <ProgressRing
                  value={32 / 45}
                  label="71%"
                  sub="Activity"
                  accent="sand"
                  size={120}
                />
              </div>

              {/* Caption row */}
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-white/55">
                <div>1,240 / 1,800 kcal</div>
                <div>1.5 / 3 L</div>
                <div>32 / 45 min</div>
              </div>
            </Glass>
          </motion.div>

          {/* Quick actions */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">
              Log in one tap
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ClientAction
                icon={Mic}
                label="Voice log"
                tone="indigo"
                onClick={() => toast('Voice AI ships next.')}
              />
              <ClientAction
                icon={Camera}
                label="Plate scan"
                tone="sage"
                highlighted
                onClick={() => navigate('/sirah/plate-vision')}
              />
              <ClientAction
                icon={Notebook}
                label="Journal"
                tone="sand"
                onClick={() => toast('Journaling lands with the Voice AI surface.')}
              />
            </div>
          </motion.div>

          {/* Today's plan */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div>
                  <div className="text-sm font-medium">Today's plan</div>
                  <div className="text-xs text-white/45">Set by Dr. Sharma · PCOS reset</div>
                </div>
                <span className="text-xs text-white/40">3 / 5 done</span>
              </div>

              <ul className="divide-y divide-white/[0.04]">
                {plan.map((item) => (
                  <li key={item.title} className="flex items-start gap-3 px-5 py-3">
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-white/25" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm ${
                          item.done ? 'text-white/40 line-through' : 'text-white/90'
                        }`}
                      >
                        {item.title}
                      </div>
                      {item.detail && (
                        <div className="mt-0.5 text-[11px] text-white/40">{item.detail}</div>
                      )}
                    </div>
                    <span className="text-[11px] text-white/40">{item.time}</span>
                  </li>
                ))}
              </ul>
            </Glass>
          </motion.div>

          {/* AI nudge */}
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated>
              <Glass className="overflow-hidden p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sage-500/30 to-indigo-400/20">
                    <Sparkles className="h-4 w-4 text-emerald-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                      Insight from your coach + SIRAH
                    </div>
                    <p className="mt-1 text-sm text-white/85">
                      Your fiber's been a touch low this week. Try adding one fruit at breakfast —
                      a guava or an apple goes further than you'd think for PCOS balance.
                    </p>
                  </div>
                </div>
              </Glass>
            </AIGlow>
          </motion.div>
        </motion.div>
      </main>

      {/* Floating voice CTA on mobile */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center md:hidden">
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-400 px-6 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(99,102,241,0.4)]"
        >
          <Mic className="h-4 w-4" />
          Talk to SIRAH
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components & data ───────────────────────────────────────────────

const plan = [
  { time: '8:00 AM',  title: 'Breakfast — Vegetable poha + curd', detail: '420 kcal · high protein', done: true },
  { time: '11:00 AM', title: 'Hydration check', detail: '2 glasses of water', done: true },
  { time: '01:30 PM', title: 'Lunch — Mixed dal, rice, sabzi', detail: '520 kcal · balanced macros', done: true },
  { time: '04:00 PM', title: '30-min brisk walk', detail: 'Aerobic · lifestyle', done: false },
  { time: '08:00 PM', title: 'Dinner — Grilled paneer salad', detail: '380 kcal · light & filling', done: false },
];

function ClientAction({
  icon: Icon,
  label,
  tone,
  highlighted,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: 'indigo' | 'sage' | 'sand';
  highlighted?: boolean;
  onClick?: () => void;
}) {
  const toneStyles = {
    indigo: 'from-indigo-500/25 to-indigo-500/5 text-indigo-200',
    sage:   'from-emerald-400/25 to-emerald-400/5 text-emerald-200',
    sand:   'from-amber-300/25 to-amber-300/5 text-amber-200',
  }[tone];

  const button = (
    <button
      type="button"
      onClick={onClick}
      className={`group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-br ${toneStyles} backdrop-blur-md transition-all hover:-translate-y-0.5`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium text-white">{label}</span>
    </button>
  );

  if (highlighted) {
    return (
      <AIGlow intensity="soft" animated={false} className="aspect-square">
        {button}
      </AIGlow>
    );
  }
  return button;
}

function greetingPart(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function readClientName(): string {
  // Placeholder — later this comes from the authenticated client profile.
  return 'Priya';
}
