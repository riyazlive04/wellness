import { Activity, CreditCard, History, Users } from 'lucide-react';

import { Glass } from '@/design-system';
import type { AdminWorkspaceDetail } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale_pro: 'Scale Pro', trial: 'Trial' };

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** "2 hours ago", "yesterday", "12 days ago" — how stale is this practice? */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** 'workspace.trial_extended' → 'Trial extended'. */
function label(action: string): string {
  const verb = action.split('.').slice(1).join(' ') || action;
  const words = verb.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Head({ icon: Icon, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

function Row({ label: l, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm">
      <span className="text-foreground/70">{l}</span>
      <span className={cn('tabular-nums font-medium', muted && 'text-foreground/45 font-normal')}>{value}</span>
    </div>
  );
}

/**
 * Is this practice actually being used?
 *
 * The same figures the workspaces list computes, which the detail page never
 * showed — so judging a practice before a renewal call meant going back to the
 * list and reading across a row.
 */
export function ActivityCard({ a, counts }: { a: AdminWorkspaceDetail['activity']; counts: AdminWorkspaceDetail['counts'] }) {
  const pct = a.ai_limit ? Math.min(100, Math.round((a.ai_calls_30d / a.ai_limit) * 100)) : null;
  return (
    <Glass className="overflow-hidden">
      <Head icon={Activity}>Activity</Head>
      <div className="divide-y divide-foreground/[0.04]">
        <Row label="Meals logged · 7d" value={a.meals_7d} />
        <Row label="Messages · 7d" value={a.messages_7d} />
        <Row label="Clients active · 7d" value={`${a.clients_active_7d} of ${counts.clients}`} />
        <Row
          label="AI calls · 30d"
          value={a.ai_limit ? `${a.ai_calls_30d} / ${a.ai_limit}${pct !== null ? ` · ${pct}%` : ''}` : a.ai_calls_30d}
        />
        <Row label="Appointments" value={counts.appointments} />
        <Row label="Programs" value={counts.programs} />
        <Row label="Last active" value={ago(a.last_active)} muted={!a.last_active} />
      </div>
    </Glass>
  );
}

/**
 * What they have paid, and what comes next. Previously this meant opening
 * Billing, Subscriptions and the setup-fee card separately.
 */
export function BillingCard({ b, plan }: { b: AdminWorkspaceDetail['billing']; plan: string }) {
  return (
    <Glass className="overflow-hidden">
      <Head icon={CreditCard}>Billing</Head>
      <div className="divide-y divide-foreground/[0.04]">
        <Row
          label="Plan"
          value={
            b.setup_plan && plan === 'trial'
              ? <>Trial → <span className="text-teal-700 dark:text-teal-300">{PLAN[b.setup_plan] ?? b.setup_plan}</span></>
              : PLAN[plan] ?? plan
          }
        />
        {b.current_period_end && (
          <Row
            label={b.manual_renewal ? 'Paid until' : 'Renews on'}
            value={
              <span className={b.manual_renewal ? 'text-amber-700 dark:text-amber-300' : undefined}>
                {date(b.current_period_end)}
                {b.manual_renewal && <span className="ml-1 font-normal">· does not auto-renew</span>}
              </span>
            }
          />
        )}
        <Row
          label="Setup fee"
          value={b.setup_fee_inr > 0
            ? `${INR.format(b.setup_fee_inr)} · ${date(b.setup_paid_at)}`
            : 'Not paid'}
          muted={b.setup_fee_inr === 0}
        />
        <Row label="Lifetime paid" value={INR.format(b.lifetime_paid_inr)} muted={b.lifetime_paid_inr === 0} />
        <Row
          label="Payments"
          value={b.failed_30d > 0
            ? <span className="text-rose-700 dark:text-rose-300">{b.payment_count} · {b.failed_30d} failed in 30d</span>
            : `${b.payment_count} · none failed`}
        />
        <Row
          label="Subscription"
          value={b.subscription_status ?? 'None'}
          muted={!b.subscription_status}
        />
      </div>
    </Glass>
  );
}

/** Admin actions taken on this practice — who extended a trial, and when. */
export function EventsCard({ events }: { events: AdminWorkspaceDetail['events'] }) {
  return (
    <Glass className="overflow-hidden">
      <Head icon={History}>Recent events</Head>
      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground/55">Nothing recorded yet.</p>
      ) : (
        <ul className="px-5 py-3">
          {events.map((e, i) => (
            <li key={`${e.created_at}-${i}`} className="relative border-l-2 border-foreground/10 py-2 pl-4">
              <span className="absolute -left-[5px] top-[14px] h-2 w-2 rounded-full bg-teal-600" />
              <div className="text-sm">{label(e.action)}</div>
              <div className="text-[11px] text-foreground/50">
                {new Date(e.created_at).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
                {e.actor_email ? ` · ${e.actor_email}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

/**
 * Who is engaged and who has gone quiet. The single best signal of whether a
 * practice will renew, and it was not on this page at all.
 */
export function ClientsCard({ clients }: { clients: AdminWorkspaceDetail['clients_list'] }) {
  const state = (c: AdminWorkspaceDetail['clients_list'][number]) => {
    const days = c.last_log_at ? (Date.now() - new Date(c.last_log_at).getTime()) / 86_400_000 : Infinity;
    if (days <= 3) return { dot: 'bg-teal-600', text: 'Active' };
    if (days <= 10) return { dot: 'bg-amber-500', text: 'At risk' };
    return { dot: 'bg-foreground/25', text: 'Quiet' };
  };

  return (
    <Glass className="overflow-hidden">
      <Head icon={Users}>Clients ({clients.length})</Head>
      {clients.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground/55">No active clients.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/[0.06] text-[10px] uppercase tracking-[0.13em] text-foreground/50">
                <th className="px-5 py-2 text-left font-semibold">Client</th>
                <th className="px-3 py-2 text-left font-semibold">Last active</th>
                <th className="px-3 py-2 text-right font-semibold">Meals · 7d</th>
                <th className="px-5 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/[0.04]">
              {clients.map((c) => {
                const s = state(c);
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-2.5">{c.name ?? '(no name)'}</td>
                    <td className="px-3 py-2.5 text-foreground/70">{ago(c.last_log_at)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.meals_7d}</td>
                    <td className="px-5 py-2.5">
                      <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle', s.dot)} />
                      <span className="text-foreground/70">{s.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Glass>
  );
}
