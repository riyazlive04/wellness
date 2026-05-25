import { motion } from 'framer-motion';
import type { DistributionBand } from '../types';
import { cn } from '@/lib/utils';

interface DistributionBarsProps {
  bands: DistributionBand[];
  /** Total used for percentage calc; defaults to sum of counts */
  total?: number;
}

export function DistributionBars({ bands, total }: DistributionBarsProps) {
  const denom = total ?? bands.reduce((a, b) => a + b.count, 0);
  const maxBar = Math.max(...bands.map((b) => b.count), 1);

  return (
    <div className="space-y-2.5">
      {bands.map((band, i) => {
        const widthPct = (band.count / maxBar) * 100;
        const sharePct = denom > 0 ? Math.round((band.count / denom) * 100) : 0;

        // Color tier: rose < 0.3, amber 0.3-0.6, sage > 0.6
        const colorClass =
          band.band < 0.3
            ? 'from-rose-400 to-rose-500'
            : band.band < 0.6
              ? 'from-amber-400 to-amber-500'
              : 'from-emerald-400 to-emerald-500';

        return (
          <div key={band.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-foreground/65">{band.label}</span>
              <span className="text-foreground/60 tabular-nums">
                {band.count}
                <span className="ml-1 text-foreground/30">({sharePct}%)</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
              <motion.div
                className={cn('h-full rounded-full bg-gradient-to-r', colorClass)}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
