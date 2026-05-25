import { Link } from 'react-router-dom';
import { Sparkles, Users, Clock, ArrowUpRight } from 'lucide-react';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import { ACCENT_STYLES, formatDuration, relativeDate } from './helpers';
import type { Program } from './types';

export function ProgramCard({ program }: { program: Program }) {
  const accent = ACCENT_STYLES[program.accent];

  return (
    <Link to={`/programs/${program.id}`} className="group block">
      <Glass interactive className="relative h-full overflow-hidden">
        {/* Top accent strip */}
        <div className={cn('h-20 bg-gradient-to-br', accent.header)} />

        {/* Floating chip row over header */}
        <div className="absolute right-4 top-4 flex items-center gap-1.5">
          {program.aiAssisted && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-canvas/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-violet-200 backdrop-blur">
              <Sparkles className="h-3 w-3" />
              AI
            </span>
          )}
          {program.isTemplate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-canvas/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-foreground/70 backdrop-blur">
              Template
            </span>
          )}
        </div>

        <div className="px-5 pb-5 pt-3">
          {/* Specialization tag */}
          <span className={cn('inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]', accent.chip)}>
            {program.specialization}
          </span>

          {/* Name */}
          <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
            {program.name}
          </h3>

          {/* Description */}
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground/55">
            {program.description}
          </p>

          {/* Meta row */}
          <div className="mt-4 flex items-center gap-4 text-[11px] text-foreground/55">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatDuration(program.durationWeeks)}
            </span>
            {!program.isTemplate ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                {program.enrolledCount} {program.enrolledCount === 1 ? 'client' : 'clients'}
              </span>
            ) : (
              <span className="text-foreground/55">No one enrolled yet</span>
            )}
            <span className="ml-auto text-foreground/35">Updated {relativeDate(program.updatedAt)}</span>
          </div>

          {/* Goals */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {program.goals.slice(0, 3).map((g) => (
              <span
                key={g}
                className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-foreground/65"
              >
                {g}
              </span>
            ))}
            {program.goals.length > 3 && (
              <span className="text-[10px] text-foreground/35">+{program.goals.length - 3}</span>
            )}
          </div>

          {/* Footer stats — only show if active */}
          {!program.isTemplate && program.enrolledCount > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-foreground/[0.06] pt-4">
              <Stat label="Adherence" value={`${program.avgCompliance}%`} />
              <Stat label="Completion" value={`${program.completionRate}%`} />
            </div>
          )}

          {/* Hover arrow */}
          <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-foreground/30 transition-colors group-hover:text-foreground" />
        </div>
      </Glass>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
