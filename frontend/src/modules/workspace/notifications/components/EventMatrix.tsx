import { useMemo } from 'react';
import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import type { ChannelKey, EventDef } from '../types';

interface EventMatrixProps {
  events: EventDef[];
  channelLabels: Record<ChannelKey, string>;
  /** Channels currently enabled at the master level */
  enabledChannels: Set<ChannelKey>;
  onToggle: (eventKey: EventDef['key'], channel: ChannelKey, next: boolean) => void;
}

const CHANNEL_ORDER: ChannelKey[] = ['email', 'push', 'whatsapp', 'inapp'];

const CATEGORY_LABEL: Record<EventDef['category'], string> = {
  client:  'Client signals',
  billing: 'Billing',
  team:    'Team',
  system:  'System',
};

const CATEGORY_ORDER: EventDef['category'][] = ['client', 'billing', 'team', 'system'];

export function EventMatrix({ events, channelLabels, enabledChannels, onToggle }: EventMatrixProps) {
  const grouped = useMemo(() => {
    const out: Record<EventDef['category'], EventDef[]> = {
      client: [], billing: [], team: [], system: [],
    };
    events.forEach((e) => out[e.category].push(e));
    return out;
  }, [events]);

  return (
    <Glass className="overflow-hidden">
      {/* Header row */}
      <div className="hidden grid-cols-[1.7fr_repeat(4,80px)] items-center gap-2 border-b border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/55 md:grid">
        <div>Event</div>
        {CHANNEL_ORDER.map((c) => {
          const disabled = !enabledChannels.has(c);
          return (
            <div
              key={c}
              className={cn(
                'text-center transition-opacity',
                disabled && 'opacity-30',
              )}
            >
              {channelLabels[c]}
            </div>
          );
        })}
      </div>

      {/* Rows by category */}
      {CATEGORY_ORDER.map((cat) => {
        const rows = grouped[cat];
        if (rows.length === 0) return null;
        return (
          <div key={cat}>
            <div className="border-b border-foreground/[0.04] bg-foreground/[0.01] px-5 py-2 text-[10px] uppercase tracking-[0.18em] text-foreground/60">
              {CATEGORY_LABEL[cat]}
            </div>
            <ul className="divide-y divide-foreground/[0.03]">
              {rows.map((evt) => (
                <li
                  key={evt.key}
                  className="grid grid-cols-[1fr] items-start gap-3 px-5 py-3 md:grid-cols-[1.7fr_repeat(4,80px)] md:items-center"
                >
                  {/* Label + description */}
                  <div className="min-w-0">
                    <div className="text-sm text-foreground">{evt.label}</div>
                    <div className="text-[11px] text-foreground/60">{evt.description}</div>
                  </div>

                  {/* Channel toggles */}
                  <div className="grid grid-cols-4 gap-2 md:contents">
                    {CHANNEL_ORDER.map((c) => {
                      const disabled = !enabledChannels.has(c);
                      const checked = evt.channels[c] && !disabled;
                      return (
                        <div key={c} className="flex flex-col items-center md:items-center">
                          {/* mobile-only channel label */}
                          <span className="mb-1 text-[9px] uppercase tracking-[0.16em] text-foreground/35 md:hidden">
                            {channelLabels[c]}
                          </span>
                          <Cell
                            disabled={disabled}
                            checked={checked}
                            onClick={() => !disabled && onToggle(evt.key, c, !checked)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Glass>
  );
}

function Cell({ checked, onClick, disabled }: { checked: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'mx-auto grid h-6 w-6 place-items-center rounded-md border transition-all',
        disabled && 'cursor-not-allowed border-foreground/[0.06] bg-foreground/[0.02] opacity-40',
        !disabled && checked && 'border-emerald-400/60 bg-emerald-400/20 text-emerald-700 dark:text-emerald-200',
        !disabled && !checked && 'border-foreground/15 bg-foreground/[0.04] text-transparent hover:bg-foreground/[0.08]',
      )}
      aria-pressed={checked}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
