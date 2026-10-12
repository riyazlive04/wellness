import { useQuery } from '@tanstack/react-query';
import { Bot, HardDrive, Loader2, Sparkles, User, Users, X } from 'lucide-react';
import type { ComponentType } from 'react';

import { Sheet } from '@/components/Sheet';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/modules/workspace/api/storage';

type PersonKind = 'client' | 'staff' | 'practice' | 'system';

interface AiUsage {
  used: number;
  failed: number;
  limit: number | null;
  byFeature: Array<{ key: string; label: string; count: number }>;
  byPerson: Array<{ name: string; kind: PersonKind; count: number }>;
  recent: Array<{ at: string; feature: string; person: string; kind: PersonKind; ok: boolean }>;
}

interface StorageUsage {
  used: number;
  limit: number | null;
  breakdown: Array<{ bucket: string; label: string; bytes: number; files: number }>;
  byPerson: Array<{ name: string; kind: PersonKind; bytes: number; files: number }>;
}

const KIND_LABEL: Record<PersonKind, string> = { client: 'Client', staff: 'Team', practice: 'Practice', system: 'Automatic' };

/** This month's AI credits: what used them, who, and the latest activity. */
export function AiUsageSheet({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['usage', 'ai'], queryFn: () => api.get<AiUsage>('/api/v1/workspaces/me/usage/ai') });
  const d = q.data;
  return (
    <Shell title="AI credits this month" icon={Sparkles} onClose={onClose}>
      {q.isLoading ? <Loading /> : q.isError || !d ? <Failed /> : (
        <div className="space-y-6">
          <Meter used={d.used} limit={d.limit} fmt={(n) => n.toLocaleString('en-IN')} unit="credits"
            note={`Each AI action uses one credit. Resets on ${nextMonthStart()}.${d.failed ? ` ${d.failed} failed ${d.failed === 1 ? 'attempt was' : 'attempts were'} not charged.` : ''}`} />
          <Section title="What it was used for">
            {d.byFeature.length === 0 ? <Empty text="No AI used yet this month." /> : (
              <Bars rows={d.byFeature.map((f) => ({ key: f.key, label: f.label, value: f.count, display: `${f.count}` }))} />
            )}
          </Section>
          <Section title="Who used it">
            {d.byPerson.length === 0 ? <Empty text="No AI used yet this month." /> : (
              <Bars rows={d.byPerson.map((p) => ({ key: `${p.kind}:${p.name}`, label: p.name, tag: KIND_LABEL[p.kind], kind: p.kind, value: p.count, display: `${p.count}` }))} />
            )}
          </Section>
          {d.recent.length > 0 && (
            <Section title="Recent activity">
              <ul className="divide-y divide-foreground/[0.05] rounded-2xl border border-foreground/[0.06]">
                {d.recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                    <PersonIcon kind={r.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.feature}</div>
                      <div className="truncate text-[11.5px] text-foreground/55">{r.person} · {when(r.at)}</div>
                    </div>
                    {!r.ok && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-rose-600">Failed · not charged</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Shell>
  );
}

/** Storage: by kind of file and by person. */
export function StorageUsageSheet({ onClose }: { onClose: () => void }) {
  const q = useQuery({ queryKey: ['usage', 'storage'], queryFn: () => api.get<StorageUsage>('/api/v1/workspaces/me/storage/details') });
  const d = q.data;
  return (
    <Shell title="Storage" icon={HardDrive} onClose={onClose}>
      {q.isLoading ? <Loading /> : q.isError || !d ? <Failed /> : (
        <div className="space-y-6">
          <Meter used={d.used} limit={d.limit} fmt={formatBytes} unit=""
            note="Photos, files and documents stored for your practice and your clients." />
          <Section title="Who it belongs to">
            {d.byPerson.length === 0 ? <Empty text="Nothing stored yet." /> : (
              <Bars rows={d.byPerson.map((p) => ({
                key: `${p.kind}:${p.name}`, label: p.name, tag: KIND_LABEL[p.kind], kind: p.kind,
                value: p.bytes, display: `${formatBytes(p.bytes)} · ${p.files} ${p.files === 1 ? 'item' : 'items'}`,
              }))} />
            )}
          </Section>
          <Section title="What kind of files">
            {d.breakdown.filter((b) => b.bytes > 0).length === 0 ? <Empty text="Nothing stored yet." /> : (
              <Bars rows={d.breakdown.filter((b) => b.bytes > 0).sort((a, b) => b.bytes - a.bytes).map((b) => ({
                key: b.bucket, label: b.label, value: b.bytes, display: `${formatBytes(b.bytes)} · ${b.files} ${b.files === 1 ? 'item' : 'items'}`,
              }))} />
            )}
          </Section>
        </div>
      )}
    </Shell>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function Shell({ title, icon: Icon, onClose, children }: {
  title: string; icon: ComponentType<{ className?: string }>; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Sheet onClose={onClose} ariaLabel={title} className="sm:max-w-xl">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-[hsl(var(--brand-blue))]" />{title}</span>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-foreground/[0.06]" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </Sheet>
  );
}

function Meter({ used, limit, fmt, unit, note }: { used: number; limit: number | null; fmt: (n: number) => string; unit: string; note: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-foreground/[0.06] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-extrabold tabular-nums">{fmt(used)}<span className="ml-1 text-sm font-medium text-foreground/55">{limit != null ? `of ${fmt(limit)} ${unit}` : `${unit} · unlimited`}</span></span>
        {limit != null && <span className={cn('text-xs font-semibold', pct >= 100 ? 'text-rose-600' : pct >= 75 ? 'text-amber-600' : 'text-foreground/55')}>{pct}% used</span>}
      </div>
      {limit != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
          <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-[hsl(var(--brand-blue))]')}
            style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
        </div>
      )}
      <p className="mt-2 text-[12px] text-foreground/55">{note}</p>
    </div>
  );
}

function Bars({ rows }: { rows: Array<{ key: string; label: string; tag?: string; kind?: PersonKind; value: number; display: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex min-w-0 items-center gap-2">
              {r.kind && <PersonIcon kind={r.kind} />}
              <span className="truncate font-medium">{r.label}</span>
              {r.tag && <span className="flex-shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">{r.tag}</span>}
            </span>
            <span className="flex-shrink-0 tabular-nums text-foreground/70">{r.display}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div className="h-full rounded-full bg-[hsl(var(--brand-blue))]/70" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PersonIcon({ kind }: { kind: PersonKind }) {
  const Icon = kind === 'client' ? User : kind === 'system' ? Bot : Users;
  return (
    <span className={cn('grid h-6 w-6 flex-shrink-0 place-items-center rounded-full',
      kind === 'client' ? 'bg-sky-500/10 text-sky-600' : kind === 'system' ? 'bg-foreground/[0.06] text-foreground/50' : 'bg-violet-500/10 text-violet-600')}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">{title}</div>
      {children}
    </div>
  );
}

const Loading = () => <div className="flex items-center gap-2 py-10 text-sm text-foreground/55"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
const Failed = () => <div className="py-10 text-sm text-foreground/60">Couldn't load this. Please try again.</div>;
const Empty = ({ text }: { text: string }) => <div className="rounded-2xl border border-dashed border-foreground/10 py-6 text-center text-xs text-foreground/50">{text}</div>;

function nextMonthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
