import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /** 0..1 — fractional progress */
  value: number;
  /** Centered big label */
  label: string;
  /** Bottom small label */
  sub: string;
  size?: number;
  thickness?: number;
  accent?: 'sage' | 'indigo' | 'sand' | 'coral';
  className?: string;
}

/**
 * ProgressRing — a single SVG circle with an animated arc, used for
 * client KPIs (calories, water, activity). Calm motion, no jiggle.
 */
export function ProgressRing({
  value,
  label,
  sub,
  size = 140,
  thickness = 10,
  accent = 'sage',
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  const stroke = {
    sage:   '#7DBE9D',
    indigo: '#8087FF',
    sand:   '#E5C58C',
    coral:  '#F87171',
  }[accent];

  const glow = {
    sage:   'rgba(125,190,157,0.45)',
    indigo: 'rgba(128,135,255,0.45)',
    sand:   'rgba(229,197,140,0.45)',
    coral:  'rgba(248,113,113,0.45)',
  }[accent];

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <svg width={size} height={size} className="relative">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {/* Arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 8px ${glow})` }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tracking-tight text-foreground">{label}</span>
        <span className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-foreground/45">{sub}</span>
      </div>
    </div>
  );
}
