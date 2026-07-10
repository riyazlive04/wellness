import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, ArrowUp, Info, X, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Glass } from '@/design-system';
import { Sheet } from '@/components/Sheet';
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
  /** When set, the card becomes clickable and taps open an info popup with this text. */
  detail?: string;
  /** Optional deep-link shown as a "View details" button inside the popup. */
  to?: string;
}

export function KPICard({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  sparkline,
  accent = 'indigo',
  detail,
  to,
}: KPICardProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const openable = !!detail;

  const accentColor = {
    indigo: 'text-teal-700 dark:text-teal-300',
    sage: 'text-emerald-700 dark:text-emerald-300',
    sand: 'text-amber-700 dark:text-amber-300',
  }[accent];

  const deltaColor = delta && (
    delta.direction === 'up' ? 'text-emerald-700 dark:text-emerald-300'
      : delta.direction === 'down' ? 'text-rose-700 dark:text-rose-300'
      : 'text-foreground/50'
  );

  const card = (
    <Glass className={cn('relative overflow-hidden p-6', openable && 'transition-colors hover:bg-foreground/[0.03]')}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/60">{label}</span>
        <span className="flex items-center gap-1.5">
          {openable && <Info className="h-3.5 w-3.5 text-foreground/35" />}
          <Icon className={cn('h-4 w-4', accentColor)} />
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="text-4xl font-semibold tracking-tight tabular-nums leading-none"
        >
          {value}
        </motion.div>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
              delta.direction === 'up' && 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-300',
              delta.direction === 'down' && 'bg-rose-400/15 text-rose-700 dark:text-rose-300',
              delta.direction === 'flat' && 'bg-foreground/10 text-foreground/50',
            )}
          >
            {delta.direction === 'up' && <ArrowUp className="h-2.5 w-2.5" />}
            {delta.direction === 'down' && <ArrowDown className="h-2.5 w-2.5" />}
            {delta.value}
          </span>
        )}
      </div>

      {hint && <div className="mt-1.5 text-xs text-foreground/75 dark:text-foreground/60">{hint}</div>}

      {sparkline && sparkline.length > 1 && (
        <Sparkline points={sparkline} accent={accent} />
      )}
    </Glass>
  );

  return (
    <>
      {openable ? (
        <button type="button" onClick={() => setOpen(true)} className="block w-full text-left" aria-haspopup="dialog">
          {card}
        </button>
      ) : (
        card
      )}

      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          ariaLabel={label}
          // No dim backdrop; the card gets its own elevation to read as a popup.
          className="ring-1 ring-foreground/10 sm:!max-w-md sm:rounded-3xl sm:shadow-[0_32px_80px_-18px_rgba(2,6,23,0.45)]"
          backdropClassName=""
        >
          <div className="p-6 sm:p-7">
            <div className="flex items-start gap-3.5">
              <div className={cn('grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl bg-foreground/[0.05]', accentColor)}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums">{value}</span>
                  {delta && <span className={cn('text-sm font-medium', deltaColor)}>{delta.value}</span>}
                </div>
                {hint && <div className="mt-0.5 text-xs text-foreground/55">{hint}</div>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detail && <p className="mt-5 text-sm leading-relaxed text-foreground/70">{detail}</p>}

            {to && (
              <button
                type="button"
                onClick={() => { setOpen(false); navigate(to); }}
                className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.01] cta-glow active:scale-[0.97]"
              >
                View details <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </Sheet>
      )}
    </>
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
