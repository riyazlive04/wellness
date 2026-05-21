import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  hint?: string;
  /** Render a tiny SVG sparkline. Pass 6-12 numeric points. */
  sparkline?: number[];
  accent?: 'indigo' | 'sage' | 'sand';
}

export function KPICard({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  sparkline,
  accent = 'indigo',
}: KPICardProps) {
  const accentColor = {
    indigo: 'text-indigo-300',
    sage: 'text-emerald-300',
    sand: 'text-amber-300',
  }[accent];

  return (
    <Glass className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">{label}</span>
        <Icon className={cn('h-4 w-4', accentColor)} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="text-3xl font-semibold tracking-tight"
        >
          {value}
        </motion.div>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              delta.direction === 'up' && 'bg-emerald-400/15 text-emerald-300',
              delta.direction === 'down' && 'bg-rose-400/15 text-rose-300',
              delta.direction === 'flat' && 'bg-white/10 text-white/50',
            )}
          >
            {delta.direction === 'up' && <ArrowUp className="h-2.5 w-2.5" />}
            {delta.direction === 'down' && <ArrowDown className="h-2.5 w-2.5" />}
            {delta.value}
          </span>
        )}
      </div>

      {hint && <div className="mt-1 text-[11px] text-white/40">{hint}</div>}

      {sparkline && sparkline.length > 1 && (
        <Sparkline points={sparkline} accent={accent} />
      )}
    </Glass>
  );
}

function Sparkline({ points, accent }: { points: number[]; accent: 'indigo' | 'sage' | 'sand' }) {
  const w = 100;
  const h = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const step = w / (points.length - 1);

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - ((p - min) / range) * h}`)
    .join(' ');

  const stroke = {
    indigo: '#A5ABFF',
    sage: '#8FC7A8',
    sand: '#E5C58C',
  }[accent];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${accent}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#spark-${accent})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
