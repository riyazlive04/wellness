import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, LabelList,
} from 'recharts';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, Utensils, Droplet, Moon, Activity, Smile, Ruler,
  BookOpen, ShieldCheck, AlertCircle, CalendarDays, Wand2 } from 'lucide-react';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { Glass, fadeUp, stagger } from '@/design-system';
import { clientsApi } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Nutritionist's client wellness deep-dive.
 *
 * Single-page tabbed view giving the nutritionist everything the client has
 * logged: meals (with engine-backed nutrition + audit trail), daily habits,
 * body measurements, and the full nutrition audit log.
 *
 * Mount at /dashboard/clients/:id/wellness.
 */
type Tab = 'meals' | 'habits' | 'body' | 'cycle' | 'nutrition';

export default function OwnerClientWellness() {
  const { id = '' } = useParams<{ id: string }>();
  const workspace = readWorkspaceSummary();
  const [tab, setTab] = useState<Tab>('meals');

  const clientQ = useQuery({
    queryKey: ['workspaces', 'clients', id],
    queryFn: () => clientsApi.list({ q: '', limit: 200 }).then((r) => r.items.find((c) => c.id === id) ?? null),
    retry: 1,
  });

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={clientQ.data?.name ?? 'Client wellness'}
    >
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <Link to={`/clients/${id}`}
            className="inline-flex items-center gap-1.5 text-xs text-foreground/65 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to client
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {clientQ.data?.name ?? 'Client'} · wellness
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Everything this client has logged. Every nutrition value is sourced from IFCT 2017 via the Nutrition Engine - click any meal for the audit trail.
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="flex flex-wrap gap-1 border-b border-foreground/[0.07]">
            <TabButton active={tab === 'meals'}      onClick={() => setTab('meals')}      icon={Utensils} label="Meals" />
            <TabButton active={tab === 'habits'}     onClick={() => setTab('habits')}     icon={Droplet}  label="Habits" />
            <TabButton active={tab === 'body'}       onClick={() => setTab('body')}       icon={Ruler}    label="Body" />
            <TabButton active={tab === 'cycle'}      onClick={() => setTab('cycle')}      icon={CalendarDays} label="Cycle" />
            <TabButton active={tab === 'nutrition'}  onClick={() => setTab('nutrition')}  icon={BookOpen} label="Nutrition audit" />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          {tab === 'meals'     && <MealsTab     clientId={id} />}
          {tab === 'habits'    && <HabitsTab    clientId={id} />}
          {tab === 'body'      && <BodyTab      clientId={id} />}
          {tab === 'cycle'     && <CycleTab     clientId={id} />}
          {tab === 'nutrition' && <NutritionTab clientId={id} />}
        </motion.div>
      </motion.div>
    </OwnerLayout>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function MealsTab({ clientId }: { clientId: string }) {
  // "From when the client started" has no stored start date - only
  // created_at, which is when the RECORD was made, not when the programme
  // began, and meals are routinely backdated before it. So the range is a
  // choice, defaulting to everything, and the heading names the first day
  // that actually has data.
  const [days, setDays] = useState(365);

  const trendsQ = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'trends', days],
    queryFn: () => clientsApi.clientWorkspaceNutritionTrends(clientId, days),
    retry: 1,
  });

  // Weight lives with the daily habits, not with meals. Joined by date below.
  const habitsQ = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'habits', days],
    queryFn: () => clientsApi.clientWorkspaceHabits(clientId, days),
    retry: 1,
  });
  const mealsQ = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'meals'],
    queryFn: () => clientsApi.clientWorkspaceMeals(clientId, 30),
    retry: 1,
  });

  const trendTotals = useMemo(() => {
    const t = trendsQ.data ?? [];
    if (t.length === 0) return null;
    const sumK = t.reduce((s, r) => s + r.total_kcal, 0);
    const sumM = t.reduce((s, r) => s + r.meals_count, 0);
    return {
      avgKcalPerDay: Math.round(sumK / t.length),
      totalMeals: sumM,
      days: t.length,
      firstDay: t[t.length - 1]?.date ?? null,
    };
  }, [trendsQ.data]);

  /**
   * One row per day, oldest first, with weight joined on.
   *
   * Only days with a meal become rows: a weigh-in on a day nobody logged food
   * would otherwise draw a calorie bar of zero, which reads as "ate nothing"
   * rather than "did not log".
   */
  const dayRows = useMemo(() => {
    const weightByDate = new Map<string, number>();
    for (const h of habitsQ.data ?? []) {
      if (h.weight_kg != null && h.weight_kg > 0) weightByDate.set(h.date, h.weight_kg);
    }
    return [...(trendsQ.data ?? [])]
      .reverse()
      .map((r) => ({
        date: r.date,
        total_kcal: Math.round(r.total_kcal),
        total_protein_g: Math.round(r.total_protein_g),
        weight_kg: weightByDate.get(r.date) ?? null,
      }));
  }, [trendsQ.data, habitsQ.data]);

  return (
    <div className="space-y-5">
      {/* Trend tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Days logged" value={trendTotals?.days ?? 0} unit="d" />
        {/* "Meals (14d)" lied once the range became selectable, and the
            average is the thing the brief asked to replace - it is kept only
            as a one-line summary beside the per-day chart below, not as the
            headline number. */}
        <StatTile label="Meals logged" value={trendTotals?.totalMeals ?? 0} unit="" />
        <StatTile label="Typical day" value={trendTotals?.avgKcalPerDay ?? 0} unit="kcal" />
        <StatTile label="With nutrition" value={
          (mealsQ.data ?? []).filter(
            (m) => m.resolution_status === 'resolved' || m.resolution_status === 'ai_estimated',
          ).length
        } unit="" />
      </div>

      {/* Calories and weight on one timeline, then protein below it. */}
      {/* Always rendered once the client has ANY meal history. An earlier
          version hid the whole card when the selected range was empty, which
          also hid the range switch - so picking 30d on a client who last
          logged six weeks ago left no way back to 3m or All. */}
      {(trendsQ.isLoading || dayRows.length > 0 || (trendTotals?.days ?? 0) > 0 || days !== 365) && (
        <Glass className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
              Calories &amp; weight · per day
              {trendTotals?.firstDay && (
                <span className="ml-2 normal-case tracking-normal text-foreground/40">
                  from {dayTick(trendTotals.firstDay)}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {([[30, '30d'], [90, '3m'], [365, 'All']] as const).map(([d, lbl]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                    days === d
                      ? 'border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                      : 'border-foreground/10 text-foreground/55 hover:bg-foreground/[0.04]',
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          {dayRows.length > 0 ? (
            <CaloriesWeightChart rows={dayRows} />
          ) : (
            <div className="grid h-24 place-items-center text-center text-xs text-foreground/50">
              No meals logged in this range. Try a longer one.
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-foreground/45">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[#0F766E]" /> Calories (kcal)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-[#C2410C]" /> Weight (kg)
            </span>
            <span>A break in the weight line is a day with no weigh-in, not a missing value.</span>
          </div>
        </Glass>
      )}

      {dayRows.some((r) => r.total_protein_g > 0) && (
        <Glass className="p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            Protein · per day
          </div>
          <ProteinChart rows={dayRows} />
        </Glass>
      )}

      {/* Meals list */}
      <Glass className="overflow-hidden">
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-foreground/55">
          Recent meals · last 30 days
        </div>
        {mealsQ.isLoading ? (
          <div className="flex items-center justify-center p-8 text-xs text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (mealsQ.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-xs text-foreground/55">
            <Utensils className="h-6 w-6 text-foreground/35" />
            No meals logged in the last 30 days.
          </div>
        ) : (
          <ul className="divide-y divide-foreground/[0.04]">
            {(mealsQ.data ?? []).map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {m.meal_name ?? m.detected_name ?? m.meal_type}
                      </span>
                      <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0 text-[9px] uppercase tracking-[0.16em] text-foreground/65">
                        {m.meal_type}
                      </span>
                      {m.resolution_status === 'resolved' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0 text-[9px] text-emerald-700 dark:text-emerald-300">
                          <ShieldCheck className="h-2.5 w-2.5" /> traceable
                        </span>
                      )}
                      {m.resolution_status === 'ai_estimated' && (
                        <span
                          title="Estimated by the vision model from a photo — approximate, not a database lookup."
                          className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0 text-[9px] text-violet-700 dark:text-violet-300"
                        >
                          <Wand2 className="h-2.5 w-2.5" /> estimate
                        </span>
                      )}
                      {m.resolution_status === 'manual_review' && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] text-amber-700 dark:text-amber-300">
                          <AlertCircle className="h-2.5 w-2.5" /> needs review
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-foreground/55">
                      {new Date(m.logged_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {m.cooking_method && <> · {m.cooking_method.replace(/_/g, ' ')}</>}
                      {m.ai_confidence != null && <> · {Math.round(m.ai_confidence * 100)}% AI conf</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {m.kcal ?? '-'}
                      <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
                    </div>
                    {m.audit_id && (
                      <div className="mt-0.5 text-[10px] text-foreground/35" title={m.audit_id}>
                        audit {m.audit_id.slice(0, 8)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Glass>
    </div>
  );
}

const CYCLE_EVENT_META: Record<string, { label: string; tone: string }> = {
  period_start: { label: 'Period started', tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  period_end:   { label: 'Period ended',   tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-200' },
  ovulation:    { label: 'Ovulation',      tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200' },
  pms:          { label: 'PMS',            tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-200' },
  cramps:       { label: 'Cramps',         tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-200' },
  spotting:     { label: 'Spotting',       tone: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' },
};

function CycleTab({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'cycle'],
    queryFn: () => clientsApi.clientWorkspaceCycle(clientId, 180),
    retry: 1,
  });
  if (q.isLoading) {
    return <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </Glass>;
  }
  const events = q.data ?? [];
  if (events.length === 0) {
    return <Glass className="flex flex-col items-center gap-2 p-10 text-center text-sm text-foreground/55">
      <CalendarDays className="h-6 w-6 text-foreground/35" />
      No cycle events logged yet.
    </Glass>;
  }
  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <span className="text-sm font-medium">Menstrual cycle</span>
        <span className="text-[11px] text-foreground/45">{events.length} event{events.length === 1 ? '' : 's'} · last 180 days</span>
      </div>
      <ul className="divide-y divide-foreground/[0.05]">
        {events.map((e) => {
          const meta = CYCLE_EVENT_META[e.event_type] ?? { label: e.event_type, tone: 'bg-foreground/[0.06] text-foreground/70' };
          return (
            <li key={e.id} className="flex items-start gap-4 px-5 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground/60">
                {new Date(`${e.event_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', meta.tone)}>{meta.label}</span>
                  {e.flow_level != null && <span className="text-[11px] text-foreground/55">flow {e.flow_level}/5</span>}
                </div>
                {e.notes && <div className="mt-1 text-xs text-foreground/70">{e.notes}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}

function HabitsTab({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'habits'],
    queryFn: () => clientsApi.clientWorkspaceHabits(clientId, 30),
    retry: 1,
  });
  if (q.isLoading) {
    return <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </Glass>;
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <Glass className="flex flex-col items-center gap-2 p-10 text-center text-sm text-foreground/55">
      <Droplet className="h-6 w-6 text-foreground/35" />
      No habit logs yet.
    </Glass>;
  }
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/55">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-right"><Droplet className="inline h-3 w-3" /> Water</th>
              <th className="px-4 py-2 text-right"><Moon className="inline h-3 w-3" /> Sleep</th>
              <th className="px-4 py-2 text-right"><Activity className="inline h-3 w-3" /> Move</th>
              <th className="px-4 py-2 text-right"><Smile className="inline h-3 w-3" /> Mood</th>
              <th className="px-4 py-2 text-right">Energy</th>
              <th className="px-4 py-2 text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-foreground/[0.04] last:border-0">
                <td className="px-4 py-2 text-xs text-foreground/65">
                  {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.water_ml ? `${(r.water_ml / 1000).toFixed(1)}L` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.sleep_hours != null ? `${r.sleep_hours}h` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.exercise_minutes ? `${r.exercise_minutes}m` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.mood ?? '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.energy ?? '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.weight_kg != null ? `${r.weight_kg}kg` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

function BodyTab({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'measurements'],
    queryFn: () => clientsApi.clientWorkspaceMeasurements(clientId),
    retry: 1,
  });
  if (q.isLoading) {
    return <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </Glass>;
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <Glass className="flex flex-col items-center gap-2 p-10 text-center text-sm text-foreground/55">
      <Ruler className="h-6 w-6 text-foreground/35" />
      No measurements logged yet.
    </Glass>;
  }
  return (
    <Glass className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-foreground/[0.06] bg-foreground/[0.02] text-[10px] uppercase tracking-[0.16em] text-foreground/55">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-right">Arm</th>
              <th className="px-4 py-2 text-right">Chest</th>
              <th className="px-4 py-2 text-right">Waist</th>
              <th className="px-4 py-2 text-right">Hip</th>
              <th className="px-4 py-2 text-right">Thigh</th>
              <th className="px-4 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-foreground/[0.04] last:border-0">
                <td className="px-4 py-2 text-xs text-foreground/65">
                  {new Date(r.recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.arm_inches != null ? `${r.arm_inches}"` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.chest_inches != null ? `${r.chest_inches}"` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.waist_inches != null ? `${r.waist_inches}"` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.hip_inches != null ? `${r.hip_inches}"` : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.thigh_inches != null ? `${r.thigh_inches}"` : '-'}</td>
                <td className="px-4 py-2 text-xs text-foreground/65">{r.notes ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

function NutritionTab({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'nutrition-audit'],
    queryFn: () => clientsApi.clientWorkspaceNutritionAudit(clientId, 50),
    retry: 1,
  });
  if (q.isLoading) {
    return <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
    </Glass>;
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <Glass className="flex flex-col items-center gap-2 p-10 text-center text-sm text-foreground/55">
      <BookOpen className="h-6 w-6 text-foreground/35" />
      No Nutrition Engine calculations yet for this client.
    </Glass>;
  }
  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-foreground/[0.06] bg-foreground/[0.02] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-foreground/55">
        Audit log · every kcal traced to its source
      </div>
      <ul className="divide-y divide-foreground/[0.04]">
        {rows.map((a) => {
          const inputs = (a.inputs ?? {}) as Record<string, unknown>;
          const outputs = (a.outputs ?? {}) as Record<string, unknown>;
          const nutrients = (outputs.nutrients ?? {}) as Record<string, unknown>;
          const kcal = typeof nutrients.energy_kcal === 'number' ? nutrients.energy_kcal : null;
          return (
            <li key={a.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.food_name ?? '-'}</span>
                    {a.food_source && (
                      <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0 text-[9px] uppercase tracking-[0.14em] text-foreground/75">
                        {a.food_source}
                      </span>
                    )}
                    <span className="text-[10px] text-foreground/45">{a.target_type}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-foreground/55">
                    {new Date(a.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    {typeof inputs.quantity_g === 'number' && <> · {inputs.quantity_g}g</>}
                    {typeof inputs.cooking_method === 'string' && <> · {(inputs.cooking_method as string).replace(/_/g, ' ')}</>}
                    {a.ai_confidence != null && <> · {Math.round(a.ai_confidence * 100)}% AI conf</>}
                  </div>
                  <div className="mt-1 text-[10px] text-foreground/45">
                    engine {a.engine_version} · {a.database_version}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {kcal != null ? Math.round(kcal) : '-'}
                    <span className="ml-0.5 text-[10px] font-normal text-foreground/55">kcal</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-foreground/35">{a.id.slice(0, 8)}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Glass>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Utensils; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-teal-500 text-foreground'
          : 'border-transparent text-foreground/55 hover:text-foreground/85',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function StatTile({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <Glass className="p-3">
      <div className="text-[9px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value}{unit && <span className="ml-0.5 text-[10px] font-normal text-foreground/55">{unit}</span>}
      </div>
    </Glass>
  );
}

interface DayRow {
  date: string;
  total_kcal: number;
  total_protein_g: number;
  weight_kg: number | null;
}

/** Short tick label: 5 Nov. The year is in the range heading above. */
function dayTick(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

/**
 * Calories and weight on one chart, per day.
 *
 * A practice asked to see "if taking certain calorie levels led to weight
 * loss or gain", which only reads if both sit on the same timeline. They need
 * SEPARATE axes: calories run 1200-2500 and weight 60-90, so on one scale the
 * weight line flattens onto the floor and answers nothing.
 *
 * Days with a meal but no weigh-in are ordinary - clients log food daily and
 * step on the scale weekly - so the weight line breaks across those rather
 * than inventing a value. connectNulls stays false for exactly that reason.
 *
 * Values are printed on the points, not hidden behind a hover: this is a
 * chart a coach reads at a glance, and the same request was made of the blood
 * sugar charts.
 */
function CaloriesWeightChart({ rows }: { rows: DayRow[] }) {
  // Cap the label COUNT, not the step: a fixed "every 3rd" still collides
  // once the range is long enough. Learned on the sugar charts.
  // Thinning has to happen in the DATA, not in the formatter. Recharts calls
  // `formatter(label)` with the value and nothing else - no index, no entry -
  // so any rule that needs to know WHICH point this is cannot work there.
  // Two extra fields carry the label text; LabelList just prints them.
  const every = Math.max(1, Math.ceil(rows.length / 10));
  const data = rows.map((r, i) => ({
    ...r,
    kcalLabel: i % every === 0 && r.total_kcal > 0 ? String(Math.round(r.total_kcal)) : '',
    kgLabel: i % every === 0 && r.weight_kg != null ? String(r.weight_kg) : '',
  }));

  const anyWeight = rows.some((r) => r.weight_kg != null);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: 2, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-foreground/10" />
          <XAxis
            dataKey="date"
            tickFormatter={dayTick}
            tick={{ fontSize: 10 }}
            minTickGap={22}
            stroke="currentColor"
            className="text-foreground/40"
          />
          <YAxis
            yAxisId="kcal"
            tick={{ fontSize: 10 }}
            stroke="currentColor"
            className="text-foreground/40"
          />
          {anyWeight && (
            <YAxis
              yAxisId="kg"
              orientation="right"
              domain={['dataMin - 2', 'dataMax + 2']}
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-foreground/40"
              width={34}
            />
          )}
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 10 }}
            labelFormatter={(d: string) => dayTick(d)}
            formatter={(v: number, name: string) =>
              (name === 'weight_kg' ? [`${v} kg`, 'Weight'] : [`${Math.round(v)} kcal`, 'Calories'])}
          />
          <Bar yAxisId="kcal" dataKey="total_kcal" name="total_kcal" fill="#0F766E" fillOpacity={0.55} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="kcalLabel" position="top" fontSize={9} fill="currentColor"
              className="text-foreground/70" />
          </Bar>
          {anyWeight && (
            <Line
              yAxisId="kg"
              type="monotone"
              dataKey="weight_kg"
              name="weight_kg"
              stroke="#C2410C"
              strokeWidth={2}
              dot={{ r: 2.5 }}
              // A client weighs weekly and eats daily: the gap is the truth.
              connectNulls={false}
            >
              <LabelList dataKey="kgLabel" position="top" offset={9} fontSize={9} fill="#C2410C" />
            </Line>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Protein per day. Its own chart: grams share no axis with calories. */
function ProteinChart({ rows }: { rows: DayRow[] }) {
  const every = Math.max(1, Math.ceil(rows.length / 10));
  const data = rows.map((r, i) => ({
    ...r,
    gLabel: i % every === 0 && r.total_protein_g > 0 ? String(Math.round(r.total_protein_g)) : '',
  }));

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: 2, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-foreground/10" />
          <XAxis dataKey="date" tickFormatter={dayTick} tick={{ fontSize: 10 }} minTickGap={22}
            stroke="currentColor" className="text-foreground/40" />
          <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-foreground/40" />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 10 }}
            labelFormatter={(d: string) => dayTick(d)}
            formatter={(v: number) => [`${Math.round(v)} g`, 'Protein']}
          />
          <Bar dataKey="total_protein_g" fill="#7E22CE" fillOpacity={0.55} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="gLabel" position="top" fontSize={9} fill="currentColor"
              className="text-foreground/70" />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
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
