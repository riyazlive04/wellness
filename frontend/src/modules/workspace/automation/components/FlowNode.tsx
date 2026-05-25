import {
  Timer,
  BellOff,
  Camera,
  CreditCard,
  Trophy,
  MessageSquare,
  Bell,
  Mail,
  Sparkles,
  Flag,
  Calendar,
  MessageCircle,
  GitBranch,
  ChevronRight,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { FlowNode as FlowNodeData } from '../types';

const ICONS: Record<FlowNodeData['icon'], React.ComponentType<{ className?: string }>> = {
  timer:      Timer,
  silent:     BellOff,
  photo:      Camera,
  card:       CreditCard,
  milestone:  Trophy,
  message:    MessageSquare,
  bell:       Bell,
  mail:       Mail,
  sparkles:   Sparkles,
  flag:       Flag,
  calendar:   Calendar,
  whatsapp:   MessageCircle,
  split:      GitBranch,
};

const KIND_LABEL: Record<FlowNodeData['kind'], string> = {
  trigger:   'Trigger',
  condition: 'Condition',
  action:    'Action',
};

const KIND_STYLE: Record<
  FlowNodeData['kind'],
  { border: string; bg: string; iconBg: string; iconText: string; chip: string }
> = {
  trigger: {
    border:   'border-violet-400/45',
    bg:       'bg-violet-400/[0.06]',
    iconBg:   'bg-gradient-to-br from-violet-500/30 to-violet-500/[0.05]',
    iconText: 'text-violet-200',
    chip:     'border-violet-400/40 bg-violet-400/10 text-violet-200',
  },
  condition: {
    border:   'border-amber-300/45',
    bg:       'bg-amber-300/[0.06]',
    iconBg:   'bg-gradient-to-br from-amber-300/30 to-amber-300/[0.05]',
    iconText: 'text-amber-200',
    chip:     'border-amber-300/40 bg-amber-300/10 text-amber-200',
  },
  action: {
    border:   'border-emerald-400/45',
    bg:       'bg-emerald-400/[0.06]',
    iconBg:   'bg-gradient-to-br from-emerald-400/30 to-emerald-400/[0.05]',
    iconText: 'text-emerald-200',
    chip:     'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  },
};

interface FlowNodeProps {
  node: FlowNodeData;
  compact?: boolean;
}

export function FlowNode({ node, compact = false }: FlowNodeProps) {
  const Icon = ICONS[node.icon];
  const style = KIND_STYLE[node.kind];

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-start gap-2.5 rounded-xl border px-3 py-2.5',
        style.border,
        style.bg,
        compact ? 'min-w-[160px] max-w-[200px]' : 'min-w-[200px] max-w-[260px]',
      )}
    >
      <div className={cn('grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg', style.iconBg, style.iconText)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[9px] uppercase tracking-[0.18em]', style.iconText)}>
          {KIND_LABEL[node.kind]}
        </div>
        <div className="mt-0.5 text-xs font-medium leading-tight text-foreground">{node.label}</div>
        {!compact && node.detail && (
          <div className="mt-0.5 text-[10px] leading-tight text-foreground/60">{node.detail}</div>
        )}
      </div>
    </div>
  );
}

/**
 * FlowChain — renders a row/column of flow nodes connected by chevrons.
 * On desktop: horizontal layout. On mobile: vertical with rotated chevrons.
 */
export function FlowChain({ nodes, compact }: { nodes: FlowNodeData[]; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-1.5">
      {nodes.map((n, i) => (
        <div key={i} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-1.5">
          <FlowNode node={n} compact={compact} />
          {i < nodes.length - 1 && (
            <ChevronRight
              className="rotate-90 self-center text-foreground/25 md:rotate-0 md:h-3.5 md:w-3.5"
              aria-hidden
            />
          )}
        </div>
      ))}
    </div>
  );
}
