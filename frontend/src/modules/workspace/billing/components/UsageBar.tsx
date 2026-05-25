import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { UsageMetric } from '../types';

interface UsageBarProps {
  metric: UsageMetric;
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
        <span className="text-xs text-foreground/55">{metric.label}</span>
        <span className="text-xs tabular-nums text-foreground/85">
          {metric.used.toLocaleString('en-IN')}
          <span className="text-foreground/55">
            {' / '}
            {isUnlimited ? '∞' : metric.limit!.toLocaleString('en-IN')}
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
        <div className="mt-1 text-[10px] text-rose-300">
          You're nearing the cap — consider upgrading.
        </div>
      )}
    </div>
  );
}
