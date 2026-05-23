import { FileText, ArrowRight, Calendar, User, ClipboardList, Wallet, BarChart3, Sparkles } from 'lucide-react';

import { Glass } from '@/design-system';
import { ACCENT_STYLES } from '../helpers';
import { cn } from '@/lib/utils';
import type { ReportTemplate } from '../types';

interface TemplateCardProps {
  template: ReportTemplate;
  onGenerate: () => void;
  onSchedule: () => void;
}

const ICON_MAP: Record<ReportTemplate['kind'], React.ComponentType<{ className?: string }>> = {
  client_health:       FileText,
  client_monthly:      User,
  program_performance: ClipboardList,
  workspace_digest:    BarChart3,
  billing_gst:         Wallet,
};

export function TemplateCard({ template, onGenerate, onSchedule }: TemplateCardProps) {
  const accent = ACCENT_STYLES[template.accent];
  const Icon = ICON_MAP[template.kind];

  return (
    <Glass interactive className="relative h-full overflow-hidden">
      {/* Top accent strip */}
      <div className={cn('h-14 bg-gradient-to-br', accent.header)} />

      {/* Icon floats over header */}
      <div className="absolute left-5 top-5">
        <div className={cn('grid h-9 w-9 place-items-center rounded-xl bg-[#0A0C10]/80 backdrop-blur-md', accent.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="px-5 pb-5 pt-2">
        {/* Title + tag */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight text-white">{template.name}</h3>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', accent.chip)}>
            {template.estimatedPages}
          </span>
        </div>

        <p className="mt-1 text-sm text-white/55">{template.description}</p>

        {/* Contents */}
        <ul className="mt-4 space-y-1.5">
          {template.contents.map((c) => (
            <li key={c} className="flex items-start gap-2 text-xs text-white/75">
              <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-indigo-300/80" />
              {c}
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onSchedule}
            className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white"
          >
            <Calendar className="h-3 w-3" />
            Schedule
          </button>
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-400 px-4 py-1.5 text-xs font-medium text-white transition-transform hover:scale-[1.03]"
          >
            Generate
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </Glass>
  );
}
