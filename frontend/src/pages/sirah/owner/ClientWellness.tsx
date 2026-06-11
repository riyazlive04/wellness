import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Loader2, Utensils, Droplet, Moon, Activity, Smile, Ruler,
  BookOpen, ShieldCheck, AlertCircle,
} from 'lucide-react';

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
type Tab = 'meals' | 'habits' | 'body' | 'nutrition';

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
            Everything this client has logged. Every nutrition value is sourced from IFCT 2017 via the Nutrition Engine — click any meal for the audit trail.
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={fadeUp} className="mt-6">
          <div className="flex flex-wrap gap-1 border-b border-foreground/[0.07]">
            <TabButton active={tab === 'meals'}      onClick={() => setTab('meals')}      icon={Utensils} label="Meals" />
            <TabButton active={tab === 'habits'}     onClick={() => setTab('habits')}     icon={Droplet}  label="Habits" />
            <TabButton active={tab === 'body'}       onClick={() => setTab('body')}       icon={Ruler}    label="Body" />
            <TabButton active={tab === 'nutrition'}  onClick={() => setTab('nutrition')}  icon={BookOpen} label="Nutrition audit" />
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          {tab === 'meals'     && <MealsTab     clientId={id} />}
          {tab === 'habits'    && <HabitsTab    clientId={id} />}
          {tab === 'body'      && <BodyTab      clientId={id} />}
          {tab === 'nutrition' && <NutritionTab clientId={id} />}
        </motion.div>
      </motion.div>
    </OwnerLayout>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────

function MealsTab({ clientId }: { clientId: string }) {
  const trendsQ = useQuery({
    queryKey: ['workspaces', 'clients', clientId, 'trends'],
    queryFn: () => clientsApi.clientWorkspaceNutritionTrends(clientId, 14),
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
    };
  }, [trendsQ.data]);

  return (
    <div className="space-y-5">
      {/* Trend tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Days logged" value={trendTotals?.days ?? 0} unit="d" />
        <StatTile label="Meals (14d)" value={trendTotals?.totalMeals ?? 0} unit="" />
        <StatTile label="Avg kcal/day" value={trendTotals?.avgKcalPerDay ?? 0} unit="kcal" />
        <StatTile label="Resolved" value={
          (mealsQ.data ?? []).filter((m) => m.resolution_status === 'resolved').length
        } unit="" />
      </div>

      {/* 14-day kcal bars */}
      {(trendsQ.data?.length ?? 0) > 0 && (
        <Glass className="p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55">
            Calories · last 14 days
          </div>
          <KcalBarChart data={trendsQ.data ?? []} />
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
                      {m.kcal ?? '—'}
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
                <td className="px-4 py-2 text-right tabular-nums">{r.water_ml ? `${(r.water_ml / 1000).toFixed(1)}L` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.sleep_hours != null ? `${r.sleep_hours}h` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.exercise_minutes ? `${r.exercise_minutes}m` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.mood ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.energy ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.weight_kg != null ? `${r.weight_kg}kg` : '—'}</td>
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
                <td className="px-4 py-2 text-right tabular-nums">{r.arm_inches != null ? `${r.arm_inches}"` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.chest_inches != null ? `${r.chest_inches}"` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.waist_inches != null ? `${r.waist_inches}"` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.hip_inches != null ? `${r.hip_inches}"` : '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.thigh_inches != null ? `${r.thigh_inches}"` : '—'}</td>
                <td className="px-4 py-2 text-xs text-foreground/65">{r.notes ?? '—'}</td>
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
                    <span className="font-medium">{a.food_name ?? '—'}</span>
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
                    {kcal != null ? Math.round(kcal) : '—'}
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
          ? 'border-violet-500 text-foreground'
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

function KcalBarChart({ data }: { data: Array<{ date: string; total_kcal: number }> }) {
  // Newest-first → oldest-left when reversed
  const ordered = useMemo(() => [...data].reverse(), [data]);
  const max = Math.max(...ordered.map((d) => d.total_kcal), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {ordered.map((d, i) => {
        const h = Math.max(4, Math.round((d.total_kcal / max) * 96));
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${Math.round(d.total_kcal)} kcal`}>
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-500/40 to-blue-500/60"
              style={{ height: `${h}px` }}
            />
            <div className="text-[8px] text-foreground/45 tabular-nums">
              {new Date(d.date).getDate()}
            </div>
          </div>
        );
      })}
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
