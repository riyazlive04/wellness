import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UsageMetric } from '../types';

interface UsageBarProps {
  metric: UsageMetric;
}

/** Render a metric value — bytes as GB/MB, everything else as a grouped count. */
function fmtValue(n: number, unit?: 'bytes'): string {
  if (unit !== 'bytes') return n.toLocaleString('en-IN');
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
  const mb = n / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const kb = n / 1024;
  return kb >= 1 ? `${Math.round(kb)} KB` : `${n} B`;
}

export function UsageBar({ metric }: UsageBarProps) {
  const isUnlimited = metric.limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, (metric.used / metric.limit!) * 100);

  // Color tier: emerald < 70%, amber 70-90%, rose ≥ 90%
  const barColor = isUnlimited || pct < 70
    ? 'from-emerald-400 to-emerald-500'
    : pct < 90
      ? 'from-amber-400 to-amber-500'
      : 'from-rose-400 to-rose-500';

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-foreground/75 dark:text-foreground/55">{metric.label}</span>
        <span className="text-xs tabular-nums text-foreground/85">
          {fmtValue(metric.used, metric.unit)}
          <span className="text-foreground/75 dark:text-foreground/55">
            {' / '}
            {isUnlimited ? '∞' : fmtValue(metric.limit!, metric.unit)}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r', barColor)}
          initial={{ width: 0 }}
          animate={{ width: isUnlimited ? '15%' : `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {!isUnlimited && pct >= 90 && (
        <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-300">
          You're nearing the cap - consider upgrading.
        </div>
      )}
    </div>
  );
}
