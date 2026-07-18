import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { X, ArrowUpRight, ArrowDownRight, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { billingApi, type Plan } from '@/modules/workspace/billing/api';
import { cn } from '@/lib/utils';

interface ChangePlanModalProps {
  target: Plan;
  onClose: () => void;
}

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/**
 * Confirm dialog for an upgrade / downgrade. Fetches the proration preview, shows
 * the money movement, then commits. Rendered as a centered panel with NO dimmed
 * backdrop (per the app-wide popup preference) — just a light click-catcher.
 */
export function ChangePlanModal({ target, onClose }: ChangePlanModalProps) {
  const queryClient = useQueryClient();

  const previewQ = useQuery({
    queryKey: ['billing', 'change-plan', 'preview', target.key],
    queryFn: () => billingApi.changePlanPreview(target.key),
    retry: 0,
  });

  const changeMut = useMutation({
    mutationFn: () => billingApi.changePlan(target.key),
    onSuccess: (res) => {
      toast.success(
        res.timing === 'now'
          ? `You're now on ${target.name}.`
          : `Downgrade to ${target.name} scheduled for your next cycle.`,
      );
      queryClient.invalidateQueries({ queryKey: ['billing', 'me', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['tenancy', 'limits'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not change plan.'),
  });

  const p = previewQ.data?.preview;
  const isUpgrade = p?.direction === 'upgrade';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Transparent click-catcher - no dimming */}
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <Glass variant="heavy" className="overflow-hidden p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2">
              <div className={cn('grid h-8 w-8 place-items-center rounded-lg', isUpgrade ? 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-300' : 'bg-amber-400/15 text-amber-600 dark:text-amber-300')}>
                {isUpgrade ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              </div>
              <div className="text-sm font-semibold">
                {p ? (isUpgrade ? 'Upgrade' : 'Downgrade') : 'Change'} to {target.name}
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1 text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-5">
            {previewQ.isLoading && (
              <div className="py-8 text-center text-sm text-foreground/55"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            )}
            {previewQ.isError && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-400/[0.06] p-3 text-sm text-rose-700 dark:text-rose-200">
                {(previewQ.error as Error).message}
              </div>
            )}
            {p && (
              <>
                <div className="space-y-2.5 text-sm">
                  <Line label="New plan price" value={`${inr(p.newPricePaise)}/mo`} />
                  <Line label="Days left this cycle" value={`${p.daysRemaining} of ${p.periodDays}`} />
                  {p.timing === 'now' ? (
                    <>
                      <Line label="Unused credit (current plan)" value={`− ${inr(p.unusedCreditPaise)}`} muted />
                      <Line label="New plan, prorated" value={inr(p.newProratedPaise)} muted />
                      <div className="my-2 border-t border-foreground/[0.08]" />
                      <Line label="Charged now" value={inr(p.immediateChargePaise)} emphasis />
                    </>
                  ) : (
                    <>
                      <div className="my-2 border-t border-foreground/[0.08]" />
                      <Line label="Charged now" value="₹0" emphasis />
                      <div className="rounded-lg bg-foreground/[0.03] p-3 text-xs text-foreground/70">
                        You keep your current plan until the cycle ends, then switch to {target.name}. Your next
                        invoice will be {inr(p.nextCyclePaise)}.
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-foreground/70 hover:bg-foreground/[0.05]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => changeMut.mutate()}
                    disabled={changeMut.isPending}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-60',
                      isUpgrade ? 'bg-gradient-to-br from-emerald-500 to-emerald-400' : 'bg-gradient-to-br from-amber-500 to-amber-400',
                    )}
                  >
                    {changeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {p.timing === 'now' ? `Confirm - pay ${inr(p.immediateChargePaise)}` : 'Confirm downgrade'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}

function Line({ label, value, emphasis, muted }: { label: string; value: string; emphasis?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-foreground/70', muted && 'text-foreground/55')}>{label}</span>
      <span className={cn('tabular-nums', emphasis ? 'text-base font-semibold text-foreground' : 'text-foreground/85')}>{value}</span>
    </div>
  );
}
