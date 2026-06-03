import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  Mic,
  Notebook,
  Sparkles,
  UtensilsCrossed,
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
import { clientsApi } from '@/modules/workspace/api/clients';

/**
 * Real client portal — pulls profile, today's meals, latest program from the
 * backend instead of hardcoded mocks. Mobile-first layout retained.
 */
export default function ClientHome() {
  const navigate = useNavigate();
  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    staleTime: 60_000,
    retry: false,
  });
  const mealsQ = useQuery({
    queryKey: ['me', 'meals', 1],
    queryFn: () => clientsApi.myMeals(1),
    staleTime: 30_000,
  });
  const programQ = useQuery({
    queryKey: ['me', 'program'],
    queryFn: () => clientsApi.myProgram(),
    staleTime: 60_000,
  });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(5),
    staleTime: 30_000,
  });

  const profile = profileQ.data;
  const meals = mealsQ.data ?? [];
  const program = programQ.data;
  const latestNudge = (messagesQ.data ?? []).find((m) => m.sender_type !== 'client');

  // Today's intake
  const consumedKcal = meals.reduce((acc, m) => acc + (m.kcal ?? 0), 0);
  const targetKcal = profile?.target_kcal ?? 1800;
  const kcalPct = Math.min(1, consumedKcal / Math.max(1, targetKcal));

  // No profile means this user isn't a client (or the invite hasn't been accepted)
  if (profileQ.error) {
    return (
      <ProfileMissing onBack={() => navigate('/auth')} />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
      <GradientOrb color="violet" size={420} position="-bottom-32 -right-20" delay={3} driftDuration={26} />
      <GradientOrb color="blue" size={360} position="top-1/3 right-1/4" delay={5} driftDuration={32} />

      <header className="relative z-10 border-b border-foreground/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/portal" className="flex items-center gap-3">
            <BrandMark size={28} animated={false} />
            <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
          </Link>
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-full bg-foreground/[0.04] text-foreground/70 transition-colors hover:bg-foreground/[0.08]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {(messagesQ.data ?? []).some((m) => !m.is_read) && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-24 pt-6 md:pt-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
          {/* Hero greeting */}
          <motion.div variants={fadeUp}>
            <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              {greetingPart()} · {formatToday()}
            </span>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {profileQ.isLoading ? 'Hi…' : `Hi ${profile?.name?.split(' ')[0] ?? 'there'}.`}
            </h1>
            <p className="mt-2 text-pretty text-foreground/75 dark:text-foreground/55">
              {profile?.workspace_name
                ? `Coached by ${profile.workspace_name}.`
                : 'Your wellness journey, on your terms.'}
            </p>
          </motion.div>

          {/* Today's intake ring */}
          <motion.div variants={fadeUp}>
            <Glass className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Today</div>
                  <div className="text-sm text-foreground/75 dark:text-foreground/55">
                    {meals.length === 0 ? 'No meals logged yet — start the day.' : `${meals.length} meal${meals.length === 1 ? '' : 's'} logged`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/voice')}
                  className="inline-flex items-center gap-1 text-xs text-foreground/75 dark:text-foreground/55 hover:text-foreground"
                >
                  Log now <ChevronRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 place-items-center">
                <ProgressRing
                  value={kcalPct}
                  label={`${Math.round(kcalPct * 100)}%`}
                  sub="Calories"
                  accent="sage"
                  size={140}
                />
              </div>
              <div className="mt-4 text-center text-[12px] text-foreground/75 dark:text-foreground/55">
                {consumedKcal.toLocaleString('en-IN')} / {targetKcal.toLocaleString('en-IN')} kcal
              </div>
            </Glass>
          </motion.div>

          {/* Quick actions */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              Log in one tap
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ClientAction icon={Mic}      label="Voice log"  tone="indigo" onClick={() => navigate('/voice')} />
              <ClientAction icon={Camera}   label="Plate scan" tone="sage"   highlighted onClick={() => navigate('/plate-vision')} />
              <ClientAction icon={Notebook} label="Journal"    tone="sand"   onClick={() => toast('Journaling lands with the messaging surface.')} />
            </div>
          </motion.div>

          {/* Today's meals */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                <div>
                  <div className="text-sm font-medium">Today's meals</div>
                  {program ? (
                    <div className="text-xs text-foreground/75 dark:text-foreground/60">
                      Program · {program.status === 'published' ? 'active' : program.status} · week {program.week_number}
                    </div>
                  ) : (
                    <div className="text-xs text-foreground/75 dark:text-foreground/60">No published program yet</div>
                  )}
                </div>
                <span className="text-xs text-foreground/75 dark:text-foreground/55">
                  {meals.length} logged
                </span>
              </div>

              {mealsQ.isLoading ? (
                <div className="grid place-items-center px-5 py-10 text-foreground/55">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : meals.length === 0 ? (
                <div className="grid place-items-center gap-2 px-5 py-10 text-center">
                  <UtensilsCrossed className="h-7 w-7 text-foreground/30" />
                  <p className="text-sm text-foreground/65">Nothing logged today yet.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/plate-vision')}
                    className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-3 py-1.5 text-xs hover:bg-foreground/[0.10]"
                  >
                    Scan a plate
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-foreground/[0.04]">
                  {meals.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm capitalize text-foreground/90">
                          {m.meal_name ?? m.meal_type.replace('_', ' ')}
                        </div>
                        {m.kcal != null && (
                          <div className="mt-0.5 text-[11px] text-foreground/75 dark:text-foreground/55">
                            {m.kcal} kcal · {m.meal_type}
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-foreground/75 dark:text-foreground/55">
                        {formatTime(m.logged_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Glass>
          </motion.div>

          {/* AI / nutritionist nudge */}
          {latestNudge && (
            <motion.div variants={fadeUp}>
              <AIGlow intensity="soft" animated>
                <Glass className="overflow-hidden p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sage-500/30 to-violet-400/20">
                      <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                        {latestNudge.sender_type === 'admin' ? 'From your coach' : 'SIRAH'}
                      </div>
                      <p className="mt-1 text-sm text-foreground/85">{latestNudge.content}</p>
                    </div>
                  </div>
                </Glass>
              </AIGlow>
            </motion.div>
          )}
        </motion.div>
      </main>

      {/* Floating voice CTA on mobile */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center md:hidden">
        <button
          type="button"
          onClick={() => navigate('/voice')}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-6 py-3 text-sm font-medium text-foreground shadow-[0_8px_24px_rgba(99,102,241,0.4)]"
        >
          <Mic className="h-4 w-4" />
          Talk to SIRAH
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ProfileMissing({ onBack }: { onBack: () => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="magenta" size={520} position="-top-32 -left-20" />
      <main className="relative z-10 mx-auto w-full max-w-md px-5 py-20">
        <Glass className="p-8 text-center">
          <Circle className="mx-auto mb-3 h-8 w-8 text-foreground/30" />
          <h1 className="text-lg font-semibold">No client profile yet</h1>
          <p className="mt-1 text-sm text-foreground/65">
            You're signed in but haven't accepted an invite from a nutritionist.
            Ask them for an invite link or sign in to a different account.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex rounded-full bg-foreground/[0.06] px-4 py-2 text-sm hover:bg-foreground/[0.10]"
          >
            Back to sign-in
          </button>
        </Glass>
      </main>
    </div>
  );
}

function ClientAction({
  icon: Icon, label, tone, highlighted, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: 'indigo' | 'sage' | 'sand';
  highlighted?: boolean;
  onClick?: () => void;
}) {
  const toneStyles = {
    indigo: 'from-violet-500/25 to-violet-500/5 text-violet-700 dark:text-violet-200',
    sage:   'from-emerald-400/25 to-emerald-400/5 text-emerald-700 dark:text-emerald-200',
    sand:   'from-amber-300/25 to-amber-300/5 text-amber-700 dark:text-amber-200',
  }[tone];

  const button = (
    <button
      type="button"
      onClick={onClick}
      className={`group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-foreground/10 bg-gradient-to-br ${toneStyles} backdrop-blur-md transition-all hover:-translate-y-0.5`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-xs font-medium text-foreground">{label}</span>
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

function formatToday(): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  } catch {
    return '';
  }
}