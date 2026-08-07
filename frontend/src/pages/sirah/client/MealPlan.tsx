import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarRange, Flame, Loader2, UtensilsCrossed } from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { cn } from '@/lib/utils';
import {
  SLOT_LABELS, cardsByDay, dayDate, mealPlansApi, type MealCard,
} from '@/modules/workspace/api/mealPlans';

/** Index (1-7) of the day within the plan week that is "today", or null. */
function todayIndex(startDate: string, endDate: string): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (today < start || today > end) return null;
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

/**
 * The client's published meal plan, as a day timeline — which is what a day of
 * eating actually is. Opens on today when the plan covers today, because "what
 * do I eat now" is the only question this page exists to answer.
 */
export default function ClientMealPlan() {
  const { t } = useTranslation('clientMealPlan');
  const planQ = useQuery({
    queryKey: ['me', 'meal-plan'],
    queryFn: () => mealPlansApi.myCurrent(),
    staleTime: 60_000,
  });

  const plan = planQ.data;
  const today = plan ? todayIndex(plan.start_date, plan.end_date) : null;
  const [day, setDay] = useState<number | null>(null);
  const activeDay = day ?? today ?? 1;

  const byDay = useMemo(() => cardsByDay(plan?.cards), [plan?.cards]);
  const cards = byDay.get(activeDay) ?? [];
  const dayKcal = cards.reduce((s, c) => s + (c.kcal ?? 0), 0);

  if (planQ.isLoading) {
    return (
      <ClientLayout>
        <Shell>
          <div className="grid place-items-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
          </div>
        </Shell>
      </ClientLayout>
    );
  }

  if (!plan) {
    return (
      <ClientLayout onRefresh={() => planQ.refetch()}>
        <Shell>
          <Glass className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)]">
              <CalendarRange className="h-6 w-6 text-teal-700 dark:text-teal-300" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-medium tracking-tight">{t('empty.title')}</h3>
              <p className="mx-auto max-w-xs text-sm text-foreground/60">
                {t('empty.description')}
              </p>
            </div>
          </Glass>
        </Shell>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout onRefresh={() => planQ.refetch()}>
      <Shell>
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-5">
          {/* ── Hero: which week, and today's load ─────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.06] bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.10)] via-transparent to-[hsl(var(--brand-magenta)_/_0.08)] p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                    <CalendarRange className="h-3 w-3" />
                    {t('hero.eyebrow')}
                  </div>
                  <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{t('hero.week', { number: plan.week_number })}</h1>
                  <p className="mt-0.5 text-xs text-foreground/55">
                    {fmtRange(plan.start_date, plan.end_date)}
                  </p>
                </div>
                {dayKcal > 0 && (
                  <div className="rounded-xl border border-foreground/[0.06] bg-surface-1/60 px-3.5 py-2 text-right backdrop-blur">
                    <div className="flex items-center gap-1.5 text-lg font-semibold leading-none">
                      <Flame className="h-4 w-4 text-amber-500" />
                      {dayKcal.toLocaleString('en-IN')}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                      kcal · {activeDay === today ? t('hero.today') : t('hero.dayN', { n: activeDay })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Day switcher ───────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {Array.from({ length: 7 }, (_, i) => {
              const n = i + 1;
              const d = dayDate(plan.start_date, n);
              const isToday = today === n;
              const active = activeDay === n;
              const count = (byDay.get(n) ?? []).length;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDay(n)}
                  className={cn(
                    'group relative flex min-w-[64px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-3 py-2.5 transition-all',
                    active
                      ? 'border-teal-400/60 bg-teal-400/10 shadow-[0_6px_18px_-8px_rgba(14,154,168,0.5)]'
                      : 'border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/15 hover:bg-foreground/[0.05]',
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-medium uppercase tracking-wide',
                      active ? 'text-teal-700 dark:text-teal-300' : 'text-foreground/45',
                    )}
                  >
                    {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </span>
                  <span className={cn('text-base font-semibold leading-none', !active && 'text-foreground/80')}>
                    {d.getDate()}
                  </span>
                  {/* Meals-planned dots, so an empty day reads as empty at a glance. */}
                  <span className="mt-1 flex h-1 items-center gap-0.5">
                    {count > 0 ? (
                      Array.from({ length: Math.min(count, 4) }, (_, k) => (
                        <span
                          key={k}
                          className={cn('h-1 w-1 rounded-full', active ? 'bg-teal-500' : 'bg-foreground/20')}
                        />
                      ))
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-transparent" />
                    )}
                  </span>
                  {isToday && (
                    <span className="absolute -top-1 right-2 rounded-full bg-teal-500 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-white">
                      {t('daySwitcher.todayBadge')}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>

          {/* ── The day, as a timeline ─────────────────────────────── */}
          {cards.length === 0 ? (
            <motion.div variants={fadeUp}>
              <Glass className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <UtensilsCrossed className="h-5 w-5 text-foreground/25" />
                <p className="text-sm text-foreground/55">{t('day.empty')}</p>
              </Glass>
            </motion.div>
          ) : (
            <motion.ol variants={fadeUp} className="space-y-2.5">
              {cards.map((c, i) => (
                <li key={c.id} className="flex gap-3">
                  {/* Rail: dot + connector. Flexbox, not magic offsets. */}
                  <div className="flex w-3 shrink-0 flex-col items-center pt-5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] ring-4 ring-teal-400/10" />
                    {i < cards.length - 1 && <span className="mt-1 w-px flex-1 bg-foreground/10" />}
                  </div>
                  <MealRow card={c} />
                </li>
              ))}
            </motion.ol>
          )}
        </motion.div>
      </Shell>
    </ClientLayout>
  );
}

/**
 * Page container. ClientLayout deliberately doesn't constrain width — each page
 * brings its own. A day's meals is a reading column, so this is narrower than
 * the dashboard's max-w-5xl.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">{children}</div>;
}

function MealRow({ card }: { card: MealCard }) {
  return (
    <Glass className="flex-1 p-4 transition-colors hover:bg-foreground/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
            {SLOT_LABELS[card.meal_type]}
          </div>
          <div className="mt-1 text-[15px] font-medium leading-snug">
            {card.meal_name}
            {card.quantity != null && (
              <span className="ml-1.5 text-xs font-normal text-foreground/50">
                {card.quantity}{card.unit ? ` ${card.unit}` : ''}
              </span>
            )}
          </div>
          {card.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/60">{card.description}</p>
          )}
          {card.ingredients && (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.ingredients
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 6)
                .map((ing) => (
                  <span
                    key={ing}
                    className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] text-foreground/55"
                  >
                    {ing}
                  </span>
                ))}
            </div>
          )}
        </div>
        {card.kcal > 0 && (
          <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            {card.kcal} kcal
          </span>
        )}
      </div>
    </Glass>
  );
}

function fmtRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: sameMonth ? undefined : 'short' })} - ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
