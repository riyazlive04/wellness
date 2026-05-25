import { useState } from 'react';
import { MessageCircle, Wallet, Calendar, Sparkles, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { INTEGRATIONS } from '../data/mockSettings';
import { SectionHeader } from './GeneralSection';
import { cn } from '@/lib/utils';
import type { Integration, IntegrationKey } from '../types';

const ICONS: Record<IntegrationKey, React.ComponentType<{ className?: string }>> = {
  whatsapp:  MessageCircle,
  razorpay:  Wallet,
  calendar:  Calendar,
  openai:    Sparkles,
  anthropic: Sparkles,
};

const ACCENT_BG: Record<Integration['accent'], string> = {
  sage:   'from-emerald-400/25 to-emerald-400/5 text-emerald-200',
  indigo: 'from-violet-400/25 to-violet-400/5 text-violet-200',
  sand:   'from-amber-300/25 to-amber-300/5 text-amber-200',
  coral:  'from-rose-400/25 to-rose-400/5 text-rose-200',
};

const STATUS_CHIP: Record<Integration['status'], string> = {
  connected:    'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  disconnected: 'border-foreground/15 bg-foreground/[0.04] text-foreground/55',
  error:        'border-rose-400/40 bg-rose-400/10 text-rose-200',
};

const STATUS_DOT: Record<Integration['status'], string> = {
  connected:    'bg-emerald-400',
  disconnected: 'bg-foreground/40',
  error:        'bg-rose-400',
};

export function IntegrationsSection() {
  const [list, setList] = useState<Integration[]>(INTEGRATIONS);

  function disconnect(key: IntegrationKey) {
    setList((l) => l.map((i) => (i.key === key ? { ...i, status: 'disconnected', meta: undefined } : i)));
    toast.success('Integration disconnected.');
  }

  function connect(key: IntegrationKey) {
    setList((l) => l.map((i) => (i.key === key ? { ...i, status: 'connected', meta: 'Just connected' } : i)));
    toast.success('Integration connected.');
  }

  return (
    <SectionHeader
      title="Integrations"
      subtitle="Third-party services that power messaging, billing, scheduling, and AI."
    >
      <div className="space-y-3">
        {list.map((i) => {
          const Icon = ICONS[i.key];
          const connected = i.status === 'connected';
          return (
            <Glass key={i.key} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br', ACCENT_BG[i.accent])}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{i.name}</span>
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', STATUS_CHIP[i.status])}>
                        <span className={cn('h-1 w-1 rounded-full', STATUS_DOT[i.status])} />
                        {i.status === 'disconnected' ? 'Not connected' : i.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/55">{i.description}</p>
                    {i.meta && <div className="mt-1 text-[11px] text-foreground/65">{i.meta}</div>}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {connected && (
                    <button
                      type="button"
                      onClick={() => toast(`${i.name} settings open here.`)}
                      className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]"
                    >
                      Configure
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                  {connected ? (
                    <button
                      type="button"
                      onClick={() => disconnect(i.key)}
                      className="rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-400/[0.1]"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connect(i.key)}
                      className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-xs font-medium text-foreground hover:scale-[1.02]"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </Glass>
          );
        })}
      </div>

      <div className="text-[11px] text-foreground/55">
        AI keys are stored in the backend's secret store, never in the frontend. Per-request budget caps + rate limits apply to all model calls.
      </div>
    </SectionHeader>
  );
}
