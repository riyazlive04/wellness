import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight, CalendarClock, MessageCircle, MessagesSquare, Trash2, TrendingDown, TrendingUp, Utensils,
} from 'lucide-react';

import { Glass } from '@/design-system';
import { clientsApi, clientSlug } from '@/modules/workspace/api/clients';
import { STATUS_META, initialsOf, relativeTime } from '@/modules/workspace/clients/helpers';
import type { Client } from '@/modules/workspace/clients/types';

/**
 * The roster's right-hand panel: the selected client at a glance (meal logging,
 * program, weight, next session, the last 14 days and today's meals) with the
 * actions a coach reaches for, so checking on someone doesn't mean leaving
 * the list.
 */
export function ClientPreviewPanel({ client, onDelete }: { client: Client; onDelete: (c: Client) => void }) {
  const invited = client.id.startsWith('preapproval:');
  const slug = clientSlug(client.name, client.id);
  const q = useQuery({
    queryKey: ['client', client.id, 'preview'],
    queryFn: () => clientsApi.clientPreview(client.id),
    enabled: !invited,
    staleTime: 30_000,
  });
  const p = q.data;
  const online = isOnline(client.lastActiveAt);
  const phone = client.phone.replace(/[^\d]/g, '');

  return (
    <Glass className="rounded-3xl p-5 md:p-6">
      {/* Who */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ClientAvatar client={client} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold tracking-tight">{client.name}</h2>
              <StatusChip client={client} />
            </div>
            <div className="mt-0.5 truncate text-[13px] text-foreground/65">
              {client.email}{client.phone ? ` · ${client.phone}` : ''}
            </div>
            <div className="mt-0.5 text-xs text-foreground/50">
              {invited ? `Invited ${relativeTime(client.joinedAt).toLowerCase()}` : `Client since ${shortDate(client.joinedAt)}`}
              {!invited && ` · ${online ? 'Active now' : `Last seen ${relativeTime(client.lastActiveAt ?? client.lastActivityAt).toLowerCase()}`}`}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {phone && (
            <IconAction href={`https://wa.me/${phone.length === 10 ? `91${phone}` : phone}`} label="WhatsApp" external>
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
            </IconAction>
          )}
          {!invited && (
            <>
              <IconAction to={`/messaging/${client.id}`} label="Message in NUSI"><MessagesSquare className="h-4 w-4" /></IconAction>
              <Link to={`/clients/${slug}/plan`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-foreground/15 px-3.5 py-2 text-[13px] font-semibold text-foreground/80 hover:bg-foreground/[0.04]">
                <Utensils className="h-4 w-4" /> Meal plan
              </Link>
              <Link to={`/clients/${slug}`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(109,176,34,0.7)]">
                <ArrowUpRight className="h-4 w-4" /> Open
              </Link>
            </>
          )}
          <button type="button" onClick={() => onDelete(client)} aria-label={`Delete ${client.name}`}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground/40 hover:bg-rose-500/10 hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {invited ? (
        <div className="mt-6 rounded-2xl border border-dashed border-foreground/15 p-8 text-center text-sm text-foreground/60">
          Imported from your list. They haven't signed up yet, so there's nothing to show.
          <div className="mt-1 text-xs text-foreground/45">Share your join link with them, or remove them if they're not joining.</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile>
              <div className="flex items-center gap-3">
                {p ? <Ring value={p.logging.pct} /> : <div className="h-[52px] w-[52px] animate-pulse rounded-full bg-foreground/[0.06]" />}
                <div className="min-w-0">
                  <div className="text-xs text-foreground/55">Meals logged</div>
                  <div className="whitespace-nowrap text-[11px] text-foreground/45">last 7 days</div>
                  {p && <Delta now={p.logging.pct} before={p.logging.prevPct} />}
                </div>
              </div>
            </Tile>
            <Tile>
              <div className="text-xs text-foreground/55">Program</div>
              {client.program === '-' ? (
                <div className="mt-1 text-sm font-semibold text-foreground/50">No program yet</div>
              ) : (
                <>
                  <div className="mt-0.5 truncate text-sm font-bold">{client.program}</div>
                  {client.programWeek > 0 && (
                    <>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div className="h-full rounded-full bg-[hsl(var(--brand-blue))]" style={{ width: `${Math.max(4, (client.programWeek / client.programTotal) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-foreground/45">Week {client.programWeek} of {client.programTotal}</div>
                    </>
                  )}
                </>
              )}
            </Tile>
            <Tile>
              <div className="text-xs text-foreground/55">Weight</div>
              {!p ? <Bone /> : !p.weight ? (
                <><div className="mt-1 text-sm font-semibold text-foreground/50">No weigh-ins yet</div></>
              ) : p.weight.change != null ? (
                <>
                  <div className={`mt-0.5 text-[22px] font-extrabold tabular-nums ${p.weight.change < 0 ? 'text-emerald-600 dark:text-emerald-400' : p.weight.change > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {p.weight.change > 0 ? '+' : ''}{p.weight.change} kg
                  </div>
                  <div className="text-[11px] text-foreground/45">since {shortDate(p.weight.since!)} · {p.weight.current} kg now</div>
                </>
              ) : (
                <>
                  <div className="mt-0.5 text-[22px] font-extrabold tabular-nums">{p.weight.current} kg</div>
                  <div className="text-[11px] text-foreground/45">latest weigh-in</div>
                </>
              )}
            </Tile>
            <Tile>
              <div className="text-xs text-foreground/55">Next session</div>
              {!p ? <Bone /> : p.nextSession ? (
                <>
                  <div className="mt-0.5 text-sm font-bold">{sessionTime(p.nextSession.at)}</div>
                  <div className="text-[11px] text-foreground/45">{MODE[p.nextSession.mode ?? ''] ?? 'Session'} · {p.nextSession.minutes} min</div>
                </>
              ) : (
                <Link to="/appointments" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--brand-blue))] hover:underline">
                  <CalendarClock className="h-3.5 w-3.5" /> Book one
                </Link>
              )}
            </Tile>
          </div>

          {/* Last 14 days */}
          <div className="mt-5 rounded-2xl border border-foreground/[0.06] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold">Last 14 days</span>
              <span className="text-[11.5px] text-foreground/45">
                meals logged{p ? ` vs ${p.logging.mealsPerDay} a day` : ''}
              </span>
            </div>
            <div className="mt-3 flex h-[120px] items-end gap-1.5 sm:gap-2">
              {(p?.logging.days ?? Array.from({ length: 14 }, (_, i) => ({ date: String(i), meals: -1 }))).map((d, i) => {
                const per = p?.logging.mealsPerDay ?? 1;
                const r = d.meals < 0 ? 0.4 : Math.min(1, d.meals / per);
                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1"
                    title={d.meals >= 0 ? `${dayLabel(d.date)}: ${d.meals} of ${per} meals` : undefined}>
                    <div className={`w-full rounded-md ${d.meals < 0 ? 'animate-pulse bg-foreground/[0.06]' : barColor(d.meals, per)}`}
                      style={{ height: `${Math.max(6, r * 100)}px`, opacity: d.meals >= 0 && i < 7 ? 0.55 : 1 }} />
                    <span className="text-[10px] text-foreground/40">{d.meals >= 0 ? weekdayLetter(d.date) : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Today */}
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">Today's meals</div>
            {!p ? <div className="h-16 animate-pulse rounded-2xl bg-foreground/[0.04]" /> : p.today.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-foreground/10 px-4 py-4 text-center text-xs text-foreground/50">
                Nothing logged today yet.{p.logging.lastMealAt ? ` Last meal ${relativeTime(p.logging.lastMealAt).toLowerCase()}.` : ' No meals logged so far.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {p.today.map((m) => (
                  <Link key={m.id} to={`/clients/${slug}/meals`} className="flex items-center gap-3 rounded-2xl border border-foreground/[0.06] p-2.5 hover:bg-foreground/[0.03]">
                    <div className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-500/10">
                      {m.thumb ? <img src={m.thumb} alt="" className="h-full w-full object-cover" /> : <Utensils className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-foreground/50">{m.label} · {clock(m.at)}</div>
                      <div className="truncate text-[13px] font-bold">{m.name}</div>
                      {m.kcal != null && m.kcal > 0 && <div className="text-[11px] text-foreground/45">{Math.round(m.kcal)} kcal</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {q.isError && <p className="mt-3 text-xs text-rose-600">Couldn't load this client's details. Please try again.</p>}
        </>
      )}
    </Glass>
  );
}

/* ── shared with the roster list ─────────────────────────────────────── */

const AVATAR_TINTS = [
  'bg-teal-100 text-teal-800 dark:bg-teal-500/[0.18] dark:text-teal-100',
  'bg-sky-100 text-sky-800 dark:bg-sky-500/[0.18] dark:text-sky-100',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/[0.18] dark:text-violet-100',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/[0.18] dark:text-amber-100',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/[0.18] dark:text-emerald-100',
];

/** A given client always wears the same friendly colour. */
function avatarTint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

/** Online if a presence heartbeat landed in the last 2 minutes. */
function isOnline(lastActiveAt?: string | null): boolean {
  if (!lastActiveAt) return false;
  const ts = new Date(lastActiveAt).getTime();
  return !Number.isNaN(ts) && Date.now() - ts < 2 * 60_000;
}

export function ClientAvatar({ client, size = 'md' }: { client: Client; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16 rounded-[20px] text-lg' : 'h-10 w-10 rounded-xl text-xs';
  return (
    <div className="relative flex-shrink-0">
      <div className={`grid place-items-center overflow-hidden font-extrabold ${box} ${avatarTint(client.name)}`}>
        {client.avatarUrl ? <img src={client.avatarUrl} alt={client.name} className="h-full w-full object-cover" /> : initialsOf(client.name)}
      </div>
      {isOnline(client.lastActiveAt) && (
        <span className={`absolute rounded-full border-2 border-surface-1 bg-emerald-500 ${size === 'lg' ? '-bottom-0.5 -right-0.5 h-4 w-4' : '-bottom-0.5 -right-0.5 h-3 w-3'}`} />
      )}
    </div>
  );
}

export function StatusChip({ client }: { client: Client }) {
  const meta = STATUS_META[client.status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

const MODE: Record<string, string> = { video: 'Video call', phone: 'Phone call', in_person: 'In person' };

function Tile({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 rounded-2xl bg-foreground/[0.03] p-4">{children}</div>;
}

const Bone = () => <div className="mt-2 h-6 w-24 animate-pulse rounded-lg bg-foreground/[0.06]" />;

function IconAction({ children, label, to, href, external }: { children: React.ReactNode; label: string; to?: string; href?: string; external?: boolean }) {
  const cls = 'grid h-9 w-9 place-items-center rounded-full border border-foreground/15 text-foreground/75 hover:bg-foreground/[0.04]';
  return to
    ? <Link to={to} aria-label={label} title={label} className={cls}>{children}</Link>
    : <a href={href} aria-label={label} title={label} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>;
}

function ringColor(v: number): string {
  return v >= 70 ? '#10b981' : v >= 40 ? '#f59e0b' : '#f43f5e';
}

function Ring({ value }: { value: number }) {
  const size = 52, stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative grid flex-shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-foreground/[0.08]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor(value)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`} />
      </svg>
      <span className="absolute text-[12.5px] font-bold tabular-nums">{value}%</span>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (d === 0) return <div className="mt-0.5 whitespace-nowrap text-[11px] font-semibold text-foreground/40">No change</div>;
  const up = d > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div title="Compared with the 7 days before" className={`mt-0.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      <Icon className="h-3 w-3" />{up ? '+' : ''}{d}% vs last wk
    </div>
  );
}

function barColor(meals: number, per: number): string {
  if (meals === 0) return 'bg-foreground/[0.08]';
  const r = meals / per;
  return r >= 0.67 ? 'bg-emerald-500' : r >= 0.34 ? 'bg-amber-400' : 'bg-rose-400';
}

/** YYYY-MM-DD as a local date (no timezone shift). */
function ymd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const weekdayLetter = (s: string) => ymd(s).toLocaleDateString('en-IN', { weekday: 'narrow' });
const dayLabel = (s: string) => ymd(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? ymd(s) : new Date(s)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const sessionTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
