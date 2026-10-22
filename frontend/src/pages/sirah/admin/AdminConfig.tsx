import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Flag, IndianRupee, Loader2, Lock, Save, Settings, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type PlatformConfig } from '@/modules/super-admin/api/admin';
import { AdminHeader } from './AdminHeader';

export default function AdminConfig() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<PlatformConfig>({
    queryKey: ['admin', 'config'],
    queryFn: () => adminApi.getConfig(),
  });

  // Editable mirror of the trial-days field. Other sections are read-only for now.
  const [trialDays, setTrialDays] = useState<number>(30);
  useEffect(() => { if (data?.trial_days != null) setTrialDays(data.trial_days); }, [data?.trial_days]);

  const save = useMutation({
    mutationFn: () => adminApi.updateConfig({ trial_days: trialDays }),
    onSuccess: () => {
      toast.success('Config saved.');
      qc.invalidateQueries({ queryKey: ['admin', 'config'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : (err as Error).message),
  });

  if (isLoading) return <Shell><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></Shell>;
  if (error)     return <Shell><div className="text-rose-700 dark:text-rose-300">{(error as Error).message}</div></Shell>;
  if (!data)     return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
        <motion.div variants={fadeUp}>
          <AdminHeader
            eyebrow="Configuration · Platform"
            title="Platform config"
            subtitle="System-wide settings: trial length, plan definitions, AI quotas, feature flags. Changes apply globally to all new workspaces and AI calls."
          />
        </motion.div>

        {/* Trial length - the one thing on this page that actually saves. */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
              <CalendarClock className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                Trial length
              </span>
              <span className="ml-auto rounded-full border border-teal-400/40 bg-teal-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-teal-700 dark:text-teal-200">
                Editable
              </span>
            </div>

            <div className="px-5 py-5">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={trialDays}
                    onChange={(e) => setTrialDays(parseInt(e.target.value || '0', 10))}
                    className="w-28 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-right text-2xl font-semibold tabular-nums focus:border-teal-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                  />
                </div>
                <div className="pb-1">
                  <div className="text-sm font-medium">days for new practices</div>
                  {/* A date is easier to sanity-check than a number of days. */}
                  <div className="mt-0.5 text-[11px] text-foreground/55">
                    Someone signing up today would get until{' '}
                    <b className="text-foreground/75">
                      {new Date(Date.now() + trialDays * 86_400_000).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
                      })}
                    </b>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-foreground/55">
                Only new signups are affected — every existing practice keeps the trial end date it
                already has, including any a super admin extended by hand.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-foreground/[0.06] px-5 py-3">
              <div className="text-[10px] text-foreground/45">
                Last updated {new Date(data.updated_at).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={save.isPending || trialDays === data.trial_days}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-medium text-white transition-transform',
                  save.isPending && 'opacity-60',
                  !save.isPending && trialDays !== data.trial_days && 'hover:scale-[1.02] cta-glow',
                  trialDays === data.trial_days && 'opacity-40 cursor-not-allowed',
                )}
              >
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </Glass>
        </motion.div>

        {/* Plans (read-only for now - full editor lives in the Billing module once billing lands) */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
              <Lock className="h-3.5 w-3.5 text-foreground/40" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                Plans
              </span>
              <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/55">
                Read-only
              </span>
              {/* The old note promised an editor on /admin/billing that does not
                  exist. Say where the numbers really come from instead. */}
              <span className="ml-auto text-[10px] text-foreground/45">
                Defined in code · changing a price is a deploy
              </span>
            </div>
            {/* One card per plan rather than rows: a plan is a thing you
                compare against its neighbours, and a tier's price belongs
                next to what that price buys, not in a column far right. */}
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {data.plans.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 transition-colors hover:border-teal-400/30 hover:bg-teal-400/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <code className="mt-0.5 block text-[10px] text-foreground/45">{p.id}</code>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="inline-flex items-baseline gap-0.5 text-xl font-semibold tabular-nums">
                        <IndianRupee className="h-4 w-4 self-center text-foreground/45" />
                        {p.monthly_inr.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-foreground/45">per month</div>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-500/[0.12] px-2.5 py-1 text-[11px] font-medium tabular-nums text-teal-800 dark:text-teal-200">
                    <Sparkles className="h-3 w-3" />
                    {p.ai_calls.toLocaleString('en-IN')} AI calls a month
                  </div>

                  <div className="mt-3 border-t border-foreground/[0.06] pt-3">
                    <div className="mb-1.5 text-[9px] uppercase tracking-[0.16em] text-foreground/40">
                      Includes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.features.map((f) => (
                        <span
                          key={f}
                          className="rounded-full border border-foreground/10 bg-canvas px-2 py-0.5 text-[10px] text-foreground/65"
                        >
                          {f.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Glass>
        </motion.div>

        {/* Feature flags */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
              <Flag className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
                Feature flags
              </span>
              <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/55">
                Read-only
              </span>
            </div>
            {/* A JSON dump made the reader parse braces to answer "is X on?".
                One row per flag answers it at a glance; the raw value is kept
                for anything that is not a simple boolean. */}
            <FlagList flags={data.feature_flags} />
          </Glass>
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * Feature flags, one row each.
 *
 * Booleans get an on/off pill; anything else (a number, a list of workspace
 * ids) shows its JSON, because the shape is not fixed and guessing at it would
 * hide values rather than explain them.
 */
function FlagList({ flags }: { flags: unknown }) {
  const entries =
    flags && typeof flags === 'object' && !Array.isArray(flags)
      ? Object.entries(flags as Record<string, unknown>)
      : [];

  if (entries.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-[12px] text-foreground/50">
        No flags set. Every practice gets whatever their plan includes.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-foreground/[0.04]">
      {entries.map(([key, value]) => (
        <li key={key} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
          <code className="text-[12px] text-foreground/80">{key}</code>
          <span className="ml-auto">
            {typeof value === 'boolean' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]',
                  value
                    ? 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200'
                    : 'border-foreground/15 bg-foreground/[0.04] text-foreground/50',
                )}
              >
                <span className={cn('h-1 w-1 rounded-full', value ? 'bg-teal-400' : 'bg-foreground/35')} />
                {value ? 'On' : 'Off'}
              </span>
            ) : (
              <code className="rounded bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-foreground/65">
                {JSON.stringify(value)}
              </code>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
      <Settings className="mx-auto mb-3 h-6 w-6 text-foreground/30" />
      <div className="text-sm">{children}</div>
    </div>
  );
}
