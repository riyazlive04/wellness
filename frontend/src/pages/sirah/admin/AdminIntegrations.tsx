import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  HardDrive,
  KeyRound,
  Mail,
  MessageCircle,
  Plug,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import {
  adminApi,
  type Integration,
  type IntegrationCategory,
  type IntegrationsList,
} from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<IntegrationCategory, typeof Plug> = {
  payments: CircleDollarSign,
  ai: Sparkles,
  email: Mail,
  messaging: MessageCircle,
  monitoring: ShieldAlert,
  analytics: BarChart3,
  storage: HardDrive,
  auth: KeyRound,
};

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  payments: 'Payments',
  ai: 'AI providers',
  email: 'Email',
  messaging: 'Messaging / WhatsApp',
  monitoring: 'Monitoring',
  analytics: 'Analytics',
  storage: 'Storage / Infra',
  auth: 'Authentication',
};

export default function AdminIntegrations() {
  const { data, isLoading, error } = useQuery<IntegrationsList>({
    queryKey: ['admin', 'integrations'],
    queryFn: () => adminApi.listIntegrations(),
    staleTime: 60_000,
  });

  const grouped = (data?.items ?? []).reduce<Record<IntegrationCategory, Integration[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {} as Record<IntegrationCategory, Integration[]>);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-8">
        <motion.div variants={fadeUp} className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/75 dark:text-foreground/60">
            Integrations
          </span>
          <h1 className="text-balance">External services + configuration status.</h1>
          <p className="text-pretty text-base text-foreground/80 dark:text-foreground/65 md:text-lg md:leading-relaxed">
            Backend introspects which env keys are present. Drop the missing keys into <code>backend/.env.local</code> and restart.
          </p>
        </motion.div>

        {/* Summary */}
        {data && (
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Pill icon={Plug} label="Total" value={data.summary.total} tone="neutral" />
            <Pill icon={CheckCircle2} label="Connected" value={data.summary.connected} tone="ok" />
            <Pill icon={ShieldAlert} label="Partial" value={data.summary.partial} tone="warn" />
            <Pill icon={XCircle} label="Not configured" value={data.summary.missing} tone="muted" />
          </motion.div>
        )}

        {error && (
          <Glass className="border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-700 dark:text-rose-200">
            Couldn't load integrations: {(error as Error).message}
          </Glass>
        )}

        {isLoading && <p className="text-sm text-foreground/60">Loading…</p>}

        {/* Grouped cards */}
        {(Object.keys(grouped) as IntegrationCategory[]).map((cat) => (
          <motion.section key={cat} variants={fadeUp} className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-foreground/55">{CATEGORY_LABELS[cat]}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {grouped[cat].map((i) => <IntegrationCard key={i.key} item={i} />)}
            </div>
          </motion.section>
        ))}
      </motion.div>
    </div>
  );
}

function IntegrationCard({ item }: { item: Integration }) {
  const Icon = CATEGORY_ICONS[item.category];
  const statusClasses = {
    connected:       'border-emerald-400/40 bg-emerald-400/5',
    partial:         'border-amber-400/40 bg-amber-400/5',
    not_configured:  'border-foreground/[0.06]',
  }[item.status];
  return (
    <Glass className={cn('p-5', statusClasses)}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-foreground/[0.04]">
            <Icon className="h-4 w-4 text-teal-700 dark:text-teal-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight">{item.name}</h3>
            <p className="text-xs text-foreground/65">{item.detail}</p>
          </div>
        </div>
        <StatusPill status={item.status} />
      </header>

      <div className="mt-4 space-y-1">
        {item.env_keys.map((k) => {
          const present = item.env_present.includes(k);
          return (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                present ? 'bg-emerald-500' : 'bg-foreground/25',
              )} />
              <code className={cn('font-mono', present ? 'text-foreground/85' : 'text-foreground/50')}>
                {k}
              </code>
              {present
                ? <span className="text-foreground/55">set</span>
                : <span className="text-foreground/45">not set</span>}
            </div>
          );
        })}
      </div>

      {item.docs_url && (
        <a
          href={item.docs_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-xs text-teal-700 hover:underline dark:text-teal-300"
        >
          Setup docs <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </Glass>
  );
}

function StatusPill({ status }: { status: Integration['status'] }) {
  const map = {
    connected:      { label: 'Connected',       cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200' },
    partial:        { label: 'Partial',         cls: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200' },
    not_configured: { label: 'Not configured',  cls: 'border-foreground/15 bg-foreground/[0.04] text-foreground/65' },
  }[status];
  return (
    <span className={cn('inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]', map.cls)}>
      {map.label}
    </span>
  );
}

function Pill({ icon: Icon, label, value, tone }: {
  icon: typeof Plug; label: string; value: number; tone: 'ok' | 'warn' | 'muted' | 'neutral';
}) {
  const color = {
    ok:      'text-emerald-700 dark:text-emerald-300',
    warn:    'text-amber-700 dark:text-amber-300',
    muted:   'text-foreground/55',
    neutral: 'text-teal-700 dark:text-teal-300',
  }[tone];
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </Glass>
  );
}