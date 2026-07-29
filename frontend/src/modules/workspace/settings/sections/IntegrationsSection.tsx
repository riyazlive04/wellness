import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Database,
  ExternalLink,
  KeyRound,
  Mail,
  MessageCircle,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Glass } from '@/design-system';
import {
  workspacesApi,
  type IntegrationCategory,
  type IntegrationStatus,
  type WorkspaceIntegration,
} from '@/modules/workspace/api/workspaces';
import { SectionHeader } from './GeneralSection';
import { ApiKeysPanel } from './ApiKeysPanel';
import { cn } from '@/lib/utils';

// Category → icon + tile accent. The status pill colour is driven separately.
const CATEGORY: Record<IntegrationCategory, { icon: LucideIcon; accent: string }> = {
  payments:   { icon: Wallet,        accent: 'from-amber-300/25 to-amber-300/5 text-amber-700 dark:text-amber-200' },
  ai:         { icon: Sparkles,      accent: 'from-teal-400/25 to-teal-400/5 text-teal-700 dark:text-teal-200' },
  email:      { icon: Mail,          accent: 'from-blue-400/25 to-blue-400/5 text-blue-700 dark:text-blue-200' },
  messaging:  { icon: MessageCircle, accent: 'from-emerald-400/25 to-emerald-400/5 text-emerald-700 dark:text-emerald-200' },
  monitoring: { icon: Activity,      accent: 'from-rose-400/25 to-rose-400/5 text-rose-700 dark:text-rose-200' },
  analytics:  { icon: BarChart3,     accent: 'from-cyan-400/25 to-cyan-400/5 text-cyan-700 dark:text-cyan-200' },
  storage:    { icon: Database,      accent: 'from-teal-400/25 to-teal-400/5 text-teal-700 dark:text-teal-200' },
  auth:       { icon: KeyRound,      accent: 'from-cyan-400/25 to-cyan-400/5 text-cyan-700 dark:text-cyan-200' },
};

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected:      'Connected',
  partial:        'Partial',
  not_configured: 'Not connected',
};

const STATUS_CHIP: Record<IntegrationStatus, string> = {
  connected:      'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
  partial:        'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
  not_configured: 'border-foreground/15 bg-foreground/[0.04] text-foreground/75 dark:text-foreground/55',
};

const STATUS_DOT: Record<IntegrationStatus, string> = {
  connected:      'bg-emerald-400',
  partial:        'bg-amber-400',
  not_configured: 'bg-foreground/40',
};

export function IntegrationsSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspace', 'integrations'],
    queryFn: () => workspacesApi.integrations(),
    staleTime: 60 * 1000,
  });

  return (
    <SectionHeader
      title="Integrations"
      subtitle="Third-party services that power messaging, billing, scheduling, and AI. Status reflects your backend configuration."
    >
      {/* Summary strip */}
      {data && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <SummaryPill tone="connected" count={data.summary.connected} label="connected" />
          <SummaryPill tone="partial" count={data.summary.partial} label="partial" />
          <SummaryPill tone="not_configured" count={data.summary.missing} label="not connected" />
        </div>
      )}

      <div className="space-y-3">
        {isLoading && [0, 1, 2, 3].map((i) => (
          <Glass key={i} className="h-[88px] animate-pulse p-5" />
        ))}

        {isError && (
          <Glass className="p-5 text-sm text-foreground/70">
            Couldn't load integration status. Make sure you're signed in as the workspace owner.
          </Glass>
        )}

        {data?.items.map((i) => (
          <IntegrationRow key={i.key} integration={i} />
        ))}
      </div>

      <div className="text-[11px] text-foreground/75 dark:text-foreground/55">
        Status is derived from the backend's environment - only whether each key is present, never the
        secret values. Keys are stored server-side and never reach the browser. Add missing keys in
        <code className="mx-1 rounded bg-foreground/[0.06] px-1 py-0.5">backend/.env.local</code>
        to enable a service.
      </div>

      {/* Developer API keys (Scale Pro) */}
      <ApiKeysPanel />
    </SectionHeader>
  );
}

function IntegrationRow({ integration: i }: { integration: WorkspaceIntegration }) {
  const { icon: Icon, accent } = CATEGORY[i.category];
  return (
    <Glass className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br', accent)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{i.name}</span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', STATUS_CHIP[i.status])}>
                <span className={cn('h-1 w-1 rounded-full', STATUS_DOT[i.status])} />
                {STATUS_LABEL[i.status]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/75 dark:text-foreground/55">{i.detail}</p>
            {i.env_keys.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.env_keys.map((k) => {
                  const present = i.env_present.includes(k);
                  return (
                    <span
                      key={k}
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 font-mono text-[10px]',
                        present
                          ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-300'
                          : 'border-foreground/10 bg-foreground/[0.03] text-foreground/45',
                      )}
                      title={present ? 'Set' : 'Missing'}
                    >
                      {present ? '✓' : '○'} {k}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {i.docs_url && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <a
              href={i.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]"
            >
              Setup guide
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </Glass>
  );
}

function SummaryPill({ tone, count, label }: { tone: IntegrationStatus; count: number; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1', STATUS_CHIP[tone])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[tone])} />
      <span className="font-semibold tabular-nums">{count}</span>
      {label}
    </span>
  );
}
