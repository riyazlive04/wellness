import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Building2, ChevronDown, Loader2, RefreshCw, Users, Wallet, TrendingUp, UserCog,
} from 'lucide-react';

import { Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';
import { organizationsApi } from '@/modules/workspace/api/organizations';

/**
 * FranchiseDashboardView — cross-location rollup for an organization.
 *
 * One aggregate view over every workspace (location) in the org: total clients,
 * active-subscription MRR, team size and new clients this month, with a
 * per-location breakdown. Backend asserts org membership and scopes by
 * organization_id; the whole surface is Scale Pro (organizations feature).
 */
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function FranchiseDashboardView({ heroEyebrow }: { heroEyebrow: string }) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const orgsQ = useQuery({ queryKey: ['orgs', 'list'], queryFn: organizationsApi.list, retry: 1 });
  const orgs = orgsQ.data ?? [];
  const org = selectedOrgId ? orgs.find((o) => o.id === selectedOrgId) : orgs[0];

  const dashQ = useQuery({
    queryKey: ['orgs', org?.id, 'dashboard'],
    queryFn: () => organizationsApi.dashboard(org!.id),
    enabled: !!org,
    retry: 1,
  });

  const data = dashQ.data;
  const rows = data?.workspaces ?? [];
  const maxMrr = Math.max(1, ...rows.map((r) => r.mrrInr));

  return (
    <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/45">{heroEyebrow}</span>
          <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">Franchise dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">
            Every location in your organization, rolled up: clients, recurring revenue, team and
            this month's growth — with a per-location breakdown.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void dashQ.refetch()}
          disabled={!org}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', dashQ.isFetching && 'animate-spin')} />
          Refresh
        </button>
      </motion.div>

      {orgsQ.isLoading ? (
        <Glass className="flex items-center justify-center p-10 text-sm text-foreground/55">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Glass>
      ) : orgs.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 p-12 text-center">
          <Building2 className="h-7 w-7 text-foreground/30" />
          <div className="text-sm text-foreground/60">You are not part of any organization yet.</div>
        </Glass>
      ) : (
        <>
          {/* Org selector (only when more than one) */}
          {orgs.length > 1 && (
            <motion.div variants={fadeUp}>
              <Picker
                icon={<Building2 className="h-3 w-3" />}
                label="Org"
                value={org?.name ?? '-'}
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                onPick={setSelectedOrgId}
              />
            </motion.div>
          )}

          {/* KPI cards */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Building2} label="Locations" value={data ? String(data.totals.locations) : '—'} loading={dashQ.isLoading} />
            <Kpi icon={Users} label="Total clients" value={data ? data.totals.clients.toLocaleString('en-IN') : '—'} loading={dashQ.isLoading} />
            <Kpi icon={Wallet} label="Total MRR" value={data ? inr(data.totals.mrrInr) : '—'} loading={dashQ.isLoading} />
            <Kpi icon={TrendingUp} label="New this month" value={data ? `+${data.totals.newThisMonth}` : '—'} loading={dashQ.isLoading} />
          </motion.div>

          {/* Per-location breakdown */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3 text-sm font-medium">
                <UserCog className="h-4 w-4 text-foreground/55" /> Locations
              </div>
              {dashQ.isLoading ? (
                <div className="flex items-center justify-center p-10 text-sm text-foreground/55">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : rows.length === 0 ? (
                <div className="p-10 text-center text-sm text-foreground/55">
                  No workspaces attached to this organization yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-foreground/45">
                        <th className="px-5 py-2 font-medium">Location</th>
                        <th className="px-3 py-2 font-medium">Plan</th>
                        <th className="px-3 py-2 text-right font-medium">Clients</th>
                        <th className="px-3 py-2 text-right font-medium">New</th>
                        <th className="px-3 py-2 text-right font-medium">Team</th>
                        <th className="px-5 py-2 text-right font-medium">MRR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/[0.05]">
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-foreground/[0.02]">
                          <td className="px-5 py-3 font-medium">{r.name}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 text-[11px] capitalize text-foreground/70">
                              {r.plan.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{r.clients.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                            {r.newThisMonth > 0 ? `+${r.newThisMonth}` : '—'}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{r.team}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="font-medium tabular-nums">{inr(r.mrrInr)}</div>
                            <div className="mt-1 ml-auto h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]"
                                style={{ width: `${Math.round((r.mrrInr / maxMrr) * 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Glass>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function Kpi({
  icon: Icon, label, value, loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-foreground/45">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-foreground/40" /> : value}
      </div>
    </Glass>
  );
}

function Picker({
  icon, label, value, options, onPick,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1 text-xs text-foreground/85 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
      >
        {icon}
        <span className="text-foreground/45">{label}:</span>
        <span className="max-w-[160px] truncate">{value}</span>
        <ChevronDown className="h-3 w-3 text-foreground/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-xl border border-foreground/[0.08] bg-popover p-1 shadow-2xl">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onPick(opt.value); setOpen(false); }}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground/75 transition-colors hover:bg-foreground/[0.04]"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
