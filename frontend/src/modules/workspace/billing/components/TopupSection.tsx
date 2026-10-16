import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Topup } from '../api';

const INR = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const NUM = (n: number) => n.toLocaleString('en-IN');
/** Prices are GST-inclusive: Razorpay charges exactly priceInr. */
const GST_RATE = 0.18;
const exGst = (inclusive: number) => Math.round(inclusive / (1 + GST_RATE));
/** "₹0.90" — two decimals only when the price per credit isn't whole. */
const perCredit = (t: Topup) => {
  const v = t.priceInr / t.units;
  return `₹${v.toFixed(v < 1 || v % 1 !== 0 ? 2 : 0)}`;
};

interface Props {
  topups: Topup[];
  /** Plan allowance for the month; null = unlimited, undefined = unknown. */
  allowance: number | null | undefined;
  /** AI calls already made this month. */
  used: number | undefined;
  onBuy: (topup: Topup) => void;
  pendingKey: string | null;
  disabled?: boolean;
  /** The shared coupon field, so a ₹1 test can be run from here too. */
  couponSlot?: ReactNode;
  /** A test coupon is applied: the charge is ₹1, credits are unchanged. */
  testCoupon?: boolean;
}

/**
 * AI top-ups: how many credits are left this month, then pick a pack and see
 * exactly what you pay before the Razorpay window opens.
 */
export function TopupSection({ topups, allowance, used, onBuy, pendingKey, disabled, couponSlot, testCoupon }: Props) {
  const { t } = useTranslation('ownerBilling');
  const [selected, setSelected] = useState<string | null>(null);

  // Default to the pack marked popular, once the catalog has loaded.
  useEffect(() => {
    if (!selected && topups.length) setSelected((topups.find((x) => x.popular) ?? topups[0]).key);
  }, [topups, selected]);

  if (!topups.length) return null;
  const pack = topups.find((x) => x.key === selected) ?? topups[0];

  const unlimited = allowance === null;
  const known = allowance != null && used != null;
  const left = known ? Math.max(0, allowance - used) : null;
  const pctUsed = known && allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
  const low = known && pctUsed >= 80;
  // Credits reset on the 1st of next month.
  const reset = new Date();
  reset.setMonth(reset.getMonth() + 1, 1);
  const resetLabel = reset.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div>
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('topups.eyebrow')}</div>
        <h2 className="mt-1 text-xl font-extrabold">{t('topups.heading')}</h2>
        <p className="mt-1 max-w-xl text-xs text-foreground/65">{t('topups.description')}</p>
      </div>

      {/* Credits left this month */}
      {(known || unlimited) && (
        <div className="mb-4 grid gap-2.5 rounded-2xl bg-foreground/[0.03] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <b className="text-sm">{t('topups.meterTitle')}</b>
            {unlimited ? (
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('topups.meterUnlimited')}</span>
            ) : (
              <span className="text-sm tabular-nums"><b>{NUM(used!)}</b> <span className="text-foreground/60">{t('topups.meterUsed', { total: NUM(allowance!) })}</span></span>
            )}
          </div>
          {!unlimited && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div className={cn('h-full rounded-full transition-all', low ? 'bg-amber-500' : 'bg-emerald-600')} style={{ width: `${Math.max(pctUsed, used! > 0 ? 2 : 0)}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-foreground/55">{t('topups.meterResets', { date: resetLabel })}</span>
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', low ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300')}>
                  {t('topups.meterLeft', { left: NUM(left!) })}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pick a pack, then the receipt */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid gap-2.5" role="radiogroup" aria-label={t('topups.heading')}>
          {topups.map((x) => {
            const on = x.key === pack.key;
            return (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(x.key)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors',
                  on ? 'border-emerald-600 bg-emerald-500/[0.06]' : 'border-foreground/[0.08] hover:bg-foreground/[0.02]',
                )}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-emerald-600' : 'border-foreground/20')}>
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <Zap className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="text-sm font-extrabold">{x.name}</b>
                    {x.popular && <span className="rounded-full bg-[#123a0b] px-2 py-0.5 text-[10.5px] font-semibold text-[#dff3c8]">{t('topups.popular')}</span>}
                    {!!x.savePct && <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">{t('topups.save', { pct: x.savePct })}</span>}
                  </span>
                  <span className="block truncate text-xs text-foreground/60">{x.description}</span>
                </span>
                <span className="shrink-0 text-right">
                  <b className="block text-base font-extrabold">{INR(x.priceInr)}</b>
                  <span className="text-[11px] text-foreground/50">{t('topups.perCredit', { amount: perCredit(x) })}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid content-start gap-3 rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] p-4">
          <b className="text-sm">{t('topups.summaryTitle')}</b>
          <div className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3"><span>{pack.name}</span><span className="tabular-nums">{INR(pack.priceInr)}</span></div>
            <div className="flex justify-between gap-3 text-xs text-foreground/55"><span>{t('topups.subtotal')}</span><span className="tabular-nums">{INR(exGst(pack.priceInr))}</span></div>
            <div className="flex justify-between gap-3 text-xs text-foreground/55"><span>{t('topups.gst')}</span><span className="tabular-nums">{INR(pack.priceInr - exGst(pack.priceInr))}</span></div>
            {testCoupon && (
              <div className="flex justify-between gap-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <span>Test coupon</span><span className="tabular-nums">−{INR(pack.priceInr - 1)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-3 border-t border-foreground/10 pt-2 text-base font-extrabold">
              <span>{t('topups.total')}</span><span className="tabular-nums">{INR(testCoupon ? 1 : pack.priceInr)}</span>
            </div>
          </div>
          {known && !unlimited && (
            <p className="text-xs text-foreground/60">{t('topups.takesYouTo', { total: NUM(left! + pack.units) })}</p>
          )}
          <button
            type="button"
            onClick={() => onBuy(pack)}
            disabled={disabled || pendingKey === pack.key}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#123a0b] px-4 py-2.5 text-sm font-bold text-[#eaf6dc] transition-colors hover:bg-[#1b4f12] disabled:opacity-50"
          >
            {pendingKey === pack.key && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('topups.pay', { amount: INR(testCoupon ? 1 : pack.priceInr) })}
          </button>
          <p className="text-[11px] leading-relaxed text-foreground/50">{t('topups.rule')}</p>
          {couponSlot && <div className="border-t border-foreground/[0.07] pt-3">{couponSlot}</div>}
        </div>
      </div>
    </div>
  );
}
