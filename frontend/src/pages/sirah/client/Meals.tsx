import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Camera, Mic, Sparkles, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

type RangeKey = 1 | 7 | 30;

export default function ClientMeals() {
  const [days, setDays] = useState<RangeKey>(7);
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const mealsQ = useQuery({
    queryKey: ['me', 'meals', days],
    queryFn: () => clientsApi.myMeals(days),
    staleTime: 30_000,
    retry: 1,
  });
  const programQ = useQuery({ queryKey: ['me', 'program'], queryFn: () => clientsApi.myProgram(), retry: 1 });

  const meals = mealsQ.data ?? [];
  const todayMeals = meals.filter((m) => isToday(m.logged_at));
  const todayKcal = todayMeals.reduce((s, m) => s + (m.kcal ?? 0), 0);
  const target = profileQ.data?.target_kcal ?? null;

  // Group meals by date for the history view
  const groupedByDate = meals.reduce<Record<string, typeof meals>>((acc, m) => {
    const d = m.logged_at.slice(0, 10);
    (acc[d] ??= []).push(m);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedByDate).sort().reverse();

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Nutrition · Meals</span>
          <h1 className="text-3xl font-semibold md:text-4xl">Today on your plate</h1>
          <p className="max-w-2xl text-sm text-foreground/65 md:text-base">
            What you ate, what's coming up, and where you are versus your target.
          </p>
        </motion.div>

        {/* Quick log */}
        <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <LogTile to="/portal/plate-vision" icon={Camera} title="Snap" sub="Plate Vision AI" />
          <LogTile to="/portal/voice"        icon={Mic}    title="Speak" sub="Voice log" />
          <LogTile to="/portal/programs"     icon={Sparkles} title="Plan" sub="Today's prescribed meals" />
        </motion.div>

        {/* Today summary */}
        <motion.div variants={fadeUp} className="mt-6">
          <Glass variant="heavy" className="p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Today</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums">
                  {todayKcal}
                  <span className="ml-1 text-sm font-normal text-foreground/55">
                    / {target ?? '—'} kcal
                  </span>
                </div>
              </div>
              <div className="text-sm text-foreground/65">{todayMeals.length} meals logged</div>
            </div>
            {target && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    todayKcal > target ? 'bg-rose-500' : 'bg-gradient-to-r from-blue-500 to-fuchsia-500',
                  )}
                  style={{ width: `${Math.min(100, (todayKcal / target) * 100)}%` }}
                />
              </div>
            )}
          </Glass>
        </motion.div>

        {/* History */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent</h2>
            <div className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1">
              {([1, 7, 30] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDays(r)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    days === r
                      ? 'bg-gradient-to-br from-blue-600/40 to-fuchsia-500/30 text-foreground'
                      : 'text-foreground/55',
                  )}
                >
                  {r === 1 ? 'Today' : r === 7 ? '7 days' : '30 days'}
                </button>
              ))}
            </div>
          </div>

          {meals.length === 0 && (
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <Utensils className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">Nothing logged in this window yet.</div>
            </Glass>
          )}

          <div className="space-y-5">
            {sortedDates.map((date) => (
              <div key={date}>
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                  {formatRelativeDay(date)}
                </div>
                <Glass className="p-4">
                  <ul className="divide-y divide-foreground/[0.05]">
                    {groupedByDate[date].map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          {m.photo_url ? (
                            <img
                              src={m.photo_url}
                              alt=""
                              className="h-10 w-10 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground/[0.05] text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                              {m.meal_type.slice(0, 1)}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium">{m.meal_name ?? m.meal_type}</div>
                            <div className="text-xs text-foreground/55">
                              {new Date(m.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {m.notes ? ` · ${m.notes.slice(0, 40)}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          {m.kcal ?? '—'}
                          <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Glass>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Assigned program plan hint */}
        {programQ.data && (
          <motion.div variants={fadeUp} className="mt-6">
            <Glass className="flex items-center justify-between p-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Your plan</div>
                <div className="mt-1 text-sm font-medium">
                  Week {programQ.data.week_number} · {programQ.data.total_kcal ?? '—'} kcal/day
                </div>
              </div>
              <Link to="/portal/programs" className="text-xs text-foreground/65 hover:text-foreground">
                Open plan →
              </Link>
            </Glass>
          </motion.div>
        )}
      </motion.div>
    </ClientLayout>
  );
}

function LogTile({ to, icon: Icon, title, sub }: { to: string; icon: typeof Camera; title: string; sub: string }) {
  return (
    <Link to={to}>
      <Glass className="flex flex-col items-start gap-2 p-4 transition-transform hover:scale-[1.02]">
        <Icon className="h-5 w-5 text-violet-600 dark:text-violet-300" />
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{sub}</div>
      </Glass>
    </Link>
  );
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatRelativeDay(yyyymmdd: string): string {
  const d = new Date(yyyymmdd);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isSame = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSame(d, today))     return 'Today';
  if (isSame(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}