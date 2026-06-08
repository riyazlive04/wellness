import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Inbox,
  Mic,
  Plus,
  Sparkles,
  TrendingDown,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { AIInsight } from '@/modules/workspace/components/AIInsight';
import { cn } from '@/lib/utils';

/**
 * Owner overview — bento layout with a single focal "Right now" card.
 *
 * Anatomy (top → bottom):
 *   1. Eyebrow greeting     (small, demoted from its old hero-size)
 *   2. Focal row            (2/3 FocalCard + 1/3 stacked MiniTiles)
 *   3. Compact KPI strip    (4 small tiles, no inline sparklines)
 *   4. AI insight           (full-width slim card)
 *   5. Recent + Today       (2-column feed)
 *   6. Quick actions        (4 buttons)
 *
 * Design contract: there is *always* one most important thing the user
 * should do. The FocalCard surfaces it. KPIs become ambient.
 */

export default function OwnerOverview() {
  const workspace = readWorkspace();
  const navigate = useNavigate();

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`Last synced ${timeAgo(Date.now() - 1000 * 60 * 2)}`}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-12">
        <motion.div
          variants={stagger(0.06, 0.05)}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* ── Greeting (demoted) ───────────────────────────────────── */}
          <motion.div variants={fadeUp} className="flex items-baseline justify-between gap-4">
            <div>
              <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">
                {greetingPart()}
              </span>
              <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                Hi {workspace.firstName}.
              </h1>
            </div>
            <span className="hidden text-xs text-foreground/55 md:inline-flex md:items-center md:gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live · synced just now
            </span>
          </motion.div>

          {/* ── Focal row: 2/3 FocalCard + 1/3 MiniTile column ───────── */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5"
          >
            <div className="lg:col-span-2">
              <FocalCard onSendDraft={() => navigate('/messaging')} onOpenClient={() => navigate('/clients')} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <MiniTile
                icon={Wallet}
                label="Trial"
                value="28d"
                hint="Ends Mar 14"
                progress={28 / 30}
                accent="amber"
                onClick={() => navigate('/subscription')}
              />
              <MiniTile
                icon={Calendar}
                label="Today"
                value="1 appt"
                hint="4:30 PM · Karan"
                accent="violet"
                onClick={() => navigate('/appointments')}
              />
              <MiniTile
                icon={Inbox}
                label="Inbox"
                value="4 new"
                hint="Last · Aanya 2h"
                accent="blue"
                onClick={() => navigate('/messaging')}
              />
            </div>
          </motion.div>

          {/* ── Compact KPI strip (no inline sparklines) ─────────────── */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <CompactKPI icon={Users}     label="Active clients" value="12"      delta="+3"   tone="ok" />
            <CompactKPI icon={Sparkles}  label="AI usage"       value="1,284"   delta="+18%" tone="violet" sub="of 5,000" />
            <CompactKPI icon={Activity}  label="Compliance"     value="86%"     delta="+2%"  tone="ok" />
            <CompactKPI icon={Wallet}    label="MRR"            value="₹64.3K"  delta="+12%" tone="blue" />
          </motion.div>

          {/* ── AI insight (slim, full-width) ───────────────────────── */}
          <motion.div variants={fadeUp}>
            <AIInsight
              headline="3 clients haven't logged in 5+ days."
              body="Priya, Rohan, and Tanvi have gone quiet. SIRAH drafted a warm check-in message — review and send in one tap."
              cta={{
                label: 'Review drafts',
                onClick: () => toast('Draft viewer opens when Messaging module lands.'),
              }}
            />
          </motion.div>

          {/* ── Feed: Recent clients + Today ─────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RecentClientsCard />
            <TodayCard />
          </motion.div>

          {/* ── Quick actions ───────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">
              Quick actions
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <QuickAction icon={Plus}     label="Invite client" onClick={() => navigate('/clients')} />
              <QuickAction icon={Sparkles} label="New program"   onClick={() => navigate('/programs')} />
              <QuickAction icon={Mic}      label="Voice note"    onClick={() => navigate('/voice')}    highlight />
              <QuickAction icon={Camera}   label="Scan plate"    onClick={() => navigate('/plate-vision')} highlight />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FocalCard — the single most actionable thing right now.
// ─────────────────────────────────────────────────────────────────────────

interface FocalCardProps {
  onSendDraft: () => void;
  onOpenClient: () => void;
}

function FocalCard({ onSendDraft, onOpenClient }: FocalCardProps) {
  // Hardcoded for now. Backend wiring lands when /admin/insights surfaces a
  // ranked list of "what should this practitioner do right now" events.
  const focal = {
    name: 'Tanvi Kapoor',
    program: 'Endurance · Week 4',
    status: 'At risk · Slipping',
    headline: '3 days quiet. Adherence dropped 22%.',
    draft:
      '"Hey Tanvi — checking in. Saw you missed a few logs this week. Want to hop on a quick 10-min call so we can tweak the plan?"',
  };

  return (
    <Glass className="relative h-full overflow-hidden p-0">
      {/* Soft accent gradient along the top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-rose-500/8 to-transparent" />
      {/* Left rail in accent colour — 3px hairline that reads "urgent" */}
      <div className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-rose-500 to-rose-500/0" />

      <div className="relative p-6">
        {/* Top row: status badge + cycle indicator */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200">
            <TrendingDown className="h-3 w-3" />
            {focal.status}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            <span>Most urgent</span>
            <span className="font-medium tabular-nums text-foreground/70">1 / 3</span>
            <button type="button" className="ml-1 rounded-md p-1 text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/85" aria-label="Next">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Identity */}
        <div className="mt-5 flex items-center gap-4">
          <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-500/25 to-fuchsia-500/15 text-base font-semibold text-foreground ring-1 ring-inset ring-white/30">
            {initialsOf(focal.name)}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight">{focal.name}</div>
            <div className="text-xs text-foreground/65">{focal.program}</div>
          </div>
        </div>

        {/* Headline insight */}
        <p className="mt-5 text-base leading-relaxed text-foreground/85">{focal.headline}</p>

        {/* Drafted message preview */}
        <div className="mt-4 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.03] p-4">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3 w-3" />
            SIRAH drafted
          </div>
          <p className="text-[13px] leading-relaxed text-foreground/75">{focal.draft}</p>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSendDraft}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Send check-in
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onOpenClient}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 px-4 py-2.5 text-sm text-foreground/85 hover:bg-foreground/[0.04]"
          >
            Open chart
          </button>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-foreground/55 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/85"
            aria-label="Skip this insight"
          >
            <X className="h-3 w-3" />
            Skip
          </button>
        </div>
      </div>
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MiniTile — compact stat tile for the right column of the focal row.
// ─────────────────────────────────────────────────────────────────────────

type Accent = 'amber' | 'violet' | 'blue';

interface MiniTileProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  /** 0..1 — shows a slim progress bar at the bottom when provided. */
  progress?: number;
  accent: Accent;
  onClick?: () => void;
}

const MINI_ACCENT: Record<Accent, { icon: string; bar: string }> = {
  amber:  { icon: 'text-amber-600 dark:text-amber-300',  bar: 'from-amber-400 to-amber-300' },
  violet: { icon: 'text-violet-600 dark:text-violet-300', bar: 'from-violet-500 to-blue-500' },
  blue:   { icon: 'text-blue-600 dark:text-blue-300',     bar: 'from-blue-500 to-cyan-400' },
};

function MiniTile({ icon: Icon, label, value, hint, progress, accent, onClick }: MiniTileProps) {
  const a = MINI_ACCENT[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-full text-left"
    >
      <Glass className="h-full p-4 transition-all group-hover:bg-foreground/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
          <Icon className={cn('h-3.5 w-3.5', a.icon)} strokeWidth={1.8} />
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-0.5 text-[11px] text-foreground/55">{hint}</div>
        {progress !== undefined && (
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.05]">
            <div
              className={cn('h-full bg-gradient-to-r', a.bar)}
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        )}
      </Glass>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CompactKPI — small KPI tile for the ambient strip. No sparkline.
// ─────────────────────────────────────────────────────────────────────────

type KPITone = 'ok' | 'violet' | 'blue';

interface CompactKPIProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  tone: KPITone;
}

const KPI_TONE: Record<KPITone, { icon: string; delta: string }> = {
  ok:     { icon: 'text-emerald-600 dark:text-emerald-300', delta: 'text-emerald-700 dark:text-emerald-300' },
  violet: { icon: 'text-violet-600 dark:text-violet-300',   delta: 'text-violet-700 dark:text-violet-300' },
  blue:   { icon: 'text-blue-600 dark:text-blue-300',       delta: 'text-blue-700 dark:text-blue-300' },
};

function CompactKPI({ icon: Icon, label, value, delta, sub, tone }: CompactKPIProps) {
  const t = KPI_TONE[tone];
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', t.icon)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta && (
          <span className={cn('text-[11px] font-medium', t.delta)}>↑ {delta}</span>
        )}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-foreground/55">{sub}</div>}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Existing feed cards — unchanged shapes, lifted out so the page is shorter.
// ─────────────────────────────────────────────────────────────────────────

function RecentClientsCard() {
  const rows = [
    { name: 'Priya Sharma',  status: 'On track',     program: 'PCOS · Week 3',     last: '2h ago',   trend: 'up' },
    { name: 'Rohan Mehta',   status: 'Needs review', program: 'Weight loss · W6',  last: 'Yesterday',trend: 'flat' },
    { name: 'Aanya Iyer',    status: 'On track',     program: 'Diabetes · W2',     last: '4h ago',   trend: 'up' },
    { name: 'Tanvi Kapoor',  status: 'At risk',      program: 'Endurance · W4',    last: '3d ago',   trend: 'down' },
    { name: 'Karan Singh',   status: 'On track',     program: 'Muscle gain · W5',  last: '1h ago',   trend: 'up' },
  ];

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Recent clients</div>
          <div className="text-xs text-foreground/60">Activity in the last 24 hours</div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-foreground/[0.06]"
        >
          See all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      <ul className="divide-y divide-foreground/[0.04]">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 px-5 py-3">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
              {initialsOf(r.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <StatusChip status={r.status} />
              </div>
              <div className="truncate text-[11px] text-foreground/55">{r.program}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-foreground/55">{r.last}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-foreground/30">
                {r.trend === 'up' && '↗ Trending'}
                {r.trend === 'down' && '↘ Slipping'}
                {r.trend === 'flat' && '→ Steady'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function TodayCard() {
  const items = [
    { time: '10:30 AM', title: 'Review Priya\'s comprehensive assessment', done: true },
    { time: '12:00 PM', title: 'Onboard Aanya: assign Diabetes 30-day program' },
    { time: '02:15 PM', title: 'Approve 4 meal photos in pending queue' },
    { time: '04:30 PM', title: 'Video consult — Karan Singh', highlight: true },
    { time: '07:00 PM', title: 'Send weekly check-in messages (5 clients)' },
  ];

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Today</div>
          <div className="text-xs text-foreground/60">Tuesday · 14 May 2026</div>
        </div>
        <Calendar className="h-4 w-4 text-foreground/55" />
      </div>

      <ul className="divide-y divide-foreground/[0.04]">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <div className="pt-0.5">
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 text-foreground/25" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn('text-sm', it.done ? 'text-foreground/55 line-through' : 'text-foreground/90')}>
                {it.title}
              </div>
              <div className="text-[11px] text-foreground/55">{it.time}</div>
            </div>
            {it.highlight && (
              <span className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-200">
                Soon
              </span>
            )}
          </li>
        ))}
      </ul>
    </Glass>
  );
}

function QuickAction({
  icon: Icon, label, onClick, highlight,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-foreground/[0.02] px-4 py-3 text-left transition-all hover:-translate-y-px hover:bg-foreground/[0.05]',
        highlight ? 'border-violet-400/40' : 'border-foreground/[0.06]',
      )}
    >
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-violet-700 transition-colors group-hover:from-violet-500/25 group-hover:to-emerald-400/25 dark:text-violet-300">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      {highlight && (
        <span className="ml-auto rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
          AI
        </span>
      )}
    </button>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'On track':     'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
    'Needs review': 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',
    'At risk':      'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',
  };
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]',
        styles[status] ?? 'border-foreground/10 bg-foreground/[0.04] text-foreground/50',
      )}
    >
      {status}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function greetingPart(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  firstName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const firstName = ownerName.split(' ')[0] ?? 'there';
  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, firstName, initials };
}