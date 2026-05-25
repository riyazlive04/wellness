import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUp, ArrowDown, Minus, Sparkles, Save, MessageCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { AIBlock, CTA, Stat, ToneKey } from '../types';

const TONE_CHIP: Record<ToneKey, string> = {
  sage:    'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  amber:   'border-amber-300/40 bg-amber-300/10 text-amber-200',
  rose:    'border-rose-400/40 bg-rose-400/10 text-rose-200',
  indigo:  'border-violet-400/40 bg-violet-400/10 text-violet-200',
  neutral: 'border-white/10 bg-white/[0.04] text-white/65',
};

const TONE_DOT: Record<ToneKey, string> = {
  sage:    'bg-emerald-400',
  amber:   'bg-amber-300',
  rose:    'bg-rose-400',
  indigo:  'bg-violet-400',
  neutral: 'bg-white/40',
};

const TONE_STAT: Record<ToneKey, string> = {
  sage:    'text-emerald-300',
  amber:   'text-amber-300',
  rose:    'text-rose-300',
  indigo:  'text-violet-300',
  neutral: 'text-white',
};

export function StructuredBlock({ block }: { block: AIBlock }) {
  if (block.kind === 'snapshot') return <SnapshotCard block={block} />;
  if (block.kind === 'list')     return <ListCard block={block} />;
  if (block.kind === 'program')  return <ProgramCard block={block} />;
  return <RecommendationCard block={block} />;
}

// ─── Snapshot ────────────────────────────────────────────────────────────

function SnapshotCard({ block }: { block: Extract<AIBlock, { kind: 'snapshot' }> }) {
  return (
    <Glass className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{block.title}</div>
          {block.subtitle && (
            <div className="mt-0.5 text-[11px] text-white/45">{block.subtitle}</div>
          )}
        </div>
        {block.cta && <CTAButton cta={block.cta} variant="ghost" />}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {block.stats.map((s) => (
          <StatCell key={s.label} stat={s} />
        ))}
      </div>
    </Glass>
  );
}

function StatCell({ stat }: { stat: Stat }) {
  const tone = stat.tone ?? 'neutral';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">{stat.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-lg font-semibold tabular-nums', TONE_STAT[tone])}>
          {stat.value}
        </span>
        {stat.delta && <DeltaChip delta={stat.delta} />}
      </div>
    </div>
  );
}

function DeltaChip({ delta }: { delta: string }) {
  const isUp = delta.startsWith('+');
  const isDown = delta.startsWith('-') || delta.startsWith('−') || delta.startsWith('↓');
  const Arrow = isUp ? ArrowUp : isDown ? ArrowDown : Minus;
  const color = isUp ? 'text-emerald-300 bg-emerald-400/15' : isDown ? 'text-rose-300 bg-rose-400/15' : 'text-white/55 bg-white/10';
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px]', color)}>
      <Arrow className="h-2.5 w-2.5" />
      {delta.replace(/^[−+↓↑]/, '')}
    </span>
  );
}

// ─── List ────────────────────────────────────────────────────────────────

function ListCard({ block }: { block: Extract<AIBlock, { kind: 'list' }> }) {
  return (
    <Glass className="overflow-hidden">
      <div className="border-b border-white/[0.06] px-5 py-3">
        <div className="text-sm font-medium text-white">{block.title}</div>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {block.items.map((item, i) => {
          const tone = item.tone ?? 'neutral';
          const content = (
            <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]">
              <span className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full', TONE_DOT[tone])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">{item.title}</span>
                  {item.badge && (
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em]', TONE_CHIP[tone])}>
                      {item.badge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-white/45">{item.subtitle}</div>
              </div>
              {item.href && <ArrowRight className="h-3.5 w-3.5 text-white/30" />}
            </div>
          );
          return (
            <li key={i}>
              {item.href ? <Link to={item.href}>{content}</Link> : content}
            </li>
          );
        })}
      </ul>
      {block.cta && (
        <div className="border-t border-white/[0.04] px-5 py-3">
          <CTAButton cta={block.cta} variant="ghost" />
        </div>
      )}
    </Glass>
  );
}

// ─── Program ─────────────────────────────────────────────────────────────

function ProgramCard({ block }: { block: Extract<AIBlock, { kind: 'program' }> }) {
  return (
    <Glass variant="heavy" className="overflow-hidden">
      <div className="border-b border-white/[0.06] bg-gradient-to-br from-emerald-400/[0.06] via-emerald-400/[0.02] to-transparent px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-200">
            {block.specialization}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white/65">
            {block.duration}
          </span>
        </div>
        <div className="mt-2 text-base font-semibold tracking-tight text-white">{block.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {block.goals.map((g) => (
            <span key={g} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70">
              {g}
            </span>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {block.weeks.map((w) => (
          <li key={w.week} className="flex items-start gap-4 px-5 py-3.5">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/25 to-fuchsia-500/15 text-[11px] font-semibold text-white">
              W{w.week}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{w.theme}</div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-white/65">
                {w.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
      {block.cta && (
        <div className="border-t border-white/[0.06] px-5 py-3">
          <CTAButton cta={block.cta} variant="primary" />
        </div>
      )}
    </Glass>
  );
}

// ─── Recommendation ──────────────────────────────────────────────────────

function RecommendationCard({ block }: { block: Extract<AIBlock, { kind: 'recommendation' }> }) {
  return (
    <Glass className="overflow-hidden border-violet-400/20 bg-violet-400/[0.04]">
      <div className="flex items-start gap-3 p-5">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-violet-200">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.18em] text-violet-300">
            Recommendation
          </div>
          <div className="mt-1 text-sm font-medium text-white">{block.headline}</div>
          <p className="mt-1 text-sm leading-relaxed text-white/75">{block.body}</p>
          {block.cta && (
            <div className="mt-3">
              <CTAButton cta={block.cta} variant="ghost" />
            </div>
          )}
        </div>
      </div>
    </Glass>
  );
}

// ─── CTAs ────────────────────────────────────────────────────────────────

function CTAButton({ cta, variant }: { cta: CTA; variant: 'primary' | 'ghost' }) {
  const Icon = {
    open_client:    ExternalLink,
    open_program:   ExternalLink,
    create_program: Sparkles,
    open_messaging: MessageCircle,
    save_template:  Save,
    view_full:      ArrowRight,
  }[cta.intent];

  const cls = variant === 'primary'
    ? 'inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-white hover:scale-[1.02]'
    : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/85 hover:bg-white/[0.06]';

  // Targets that are real routes get rendered as Links, others as buttons
  const href =
    cta.intent === 'open_client'    && cta.target ? `/clients/${cta.target}` :
    cta.intent === 'open_program'   && cta.target ? `/programs/${cta.target}` :
    cta.intent === 'view_full'      && cta.target ? `/appointments/${cta.target}` :
    cta.intent === 'open_messaging'                ? `/messaging` :
    null;

  if (href) {
    return (
      <Link to={href} className={cls}>
        <Icon className="h-3.5 w-3.5" />
        {cta.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => toast.success(`${cta.label} — action queued.`)}
      className={cls}
    >
      <Icon className="h-3.5 w-3.5" />
      {cta.label}
    </button>
  );
}
