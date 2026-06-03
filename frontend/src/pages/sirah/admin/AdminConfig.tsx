import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, IndianRupee, Loader2, Save, Settings, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { adminApi, type PlatformConfig } from '@/modules/super-admin/api/admin';

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
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">Configuration · Platform</span>
          <h1 className="text-balance mt-1">Platform config</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 mt-2">
            System-wide settings: trial length, plan definitions, AI quotas, feature flags.
            Changes apply globally to all new workspaces and AI calls.
          </p>
        </motion.div>

        {/* Trial length (editable) */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Trial length</div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={trialDays}
                  onChange={(e) => setTrialDays(parseInt(e.target.value || '0', 10))}
                  className="w-24 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2 text-sm text-right font-mono focus:border-violet-400/60 focus:bg-foreground/[0.06] focus:outline-none"
                />
                <span className="text-sm text-foreground/80 dark:text-foreground/65">days for new workspaces</span>
              </div>
              <div className="mt-1.5 text-[11px] text-foreground/75 dark:text-foreground/55">
                Existing workspaces keep their original trial end date — only new signups are affected.
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-foreground/[0.06] pt-4">
              <div className="text-[10px] text-foreground/45">
                Last updated {new Date(data.updated_at).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={save.isPending || trialDays === data.trial_days}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white transition-transform',
                  save.isPending && 'opacity-60',
                  !save.isPending && trialDays !== data.trial_days && 'hover:scale-[1.02]',
                  trialDays === data.trial_days && 'opacity-40 cursor-not-allowed',
                )}
              >
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </Glass>
        </motion.div>

        {/* Plans (read-only for now — full editor lives in the Billing module once billing lands) */}
        <motion.div variants={fadeUp}>
          <Glass className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Plans</div>
              <span className="text-[10px] text-foreground/45">read-only · edit via /admin/billing when wired</span>
            </div>
            <ul className="divide-y divide-foreground/[0.04]">
              {data.plans.map((p) => (
                <li key={p.id} className="grid grid-cols-[2fr_1fr_1fr_2fr] items-center gap-4 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{p.id}</div>
                  </div>
                  <div className="inline-flex items-center gap-1 text-sm tabular-nums">
                    <IndianRupee className="h-3.5 w-3.5 text-foreground/75 dark:text-foreground/55" />
                    {p.monthly_inr.toLocaleString('en-IN')}<span className="text-foreground/75 dark:text-foreground/55">/mo</span>
                  </div>
                  <div className="inline-flex items-center gap-1 text-sm tabular-nums">
                    <Sparkles className="h-3.5 w-3.5 text-violet-700 dark:text-violet-300" />
                    {p.ai_calls.toLocaleString()}<span className="text-foreground/75 dark:text-foreground/55">/mo</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.features.map((f) => (
                      <span key={f} className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0 text-[10px] text-foreground/70">
                        {f}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>

        {/* Feature flags */}
        <motion.div variants={fadeUp}>
          <Glass className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
              <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Feature flags</div>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-[11px] text-foreground/75">
{JSON.stringify(data.feature_flags, null, 2)}
            </pre>
            <div className="mt-2 text-[11px] text-foreground/75 dark:text-foreground/55">
              Currently a JSON blob; per-flag UI (toggle, scope to specific workspaces) wires up next.
            </div>
          </Glass>
        </motion.div>
      </motion.div>
    </div>
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
