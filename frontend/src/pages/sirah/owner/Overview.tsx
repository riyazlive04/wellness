import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Sparkles,
  Activity,
  Wallet,
  Calendar,
  Mic,
  Camera,
  Plus,
  ArrowUpRight,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { AIInsight } from '@/modules/workspace/components/AIInsight';

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
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div
          variants={stagger(0.06, 0.05)}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Greeting */}
          <motion.div variants={fadeUp} className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-white/40">
              {greetingPart()}
            </span>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Hi {workspace.firstName}.
            </h1>
            <p className="text-pretty text-white/55">
              {workspace.practiceName} has 4 active clients today, 2 assessments waiting on
              review, and one appointment at 4:30 PM.
            </p>
          </motion.div>

          {/* KPIs */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <KPICard
              icon={Users}
              label="Active clients"
              value="12"
              delta={{ value: '+3', direction: 'up' }}
              hint="This week"
              sparkline={[6, 7, 7, 9, 10, 11, 12]}
              accent="sage"
            />
            <KPICard
              icon={Sparkles}
              label="AI usage"
              value="1,284"
              delta={{ value: '+18%', direction: 'up' }}
              hint="of 5,000 this month"
              sparkline={[40, 60, 55, 80, 95, 110, 130]}
              accent="indigo"
            />
            <KPICard
              icon={Activity}
              label="Compliance"
              value="86%"
              delta={{ value: '+2%', direction: 'up' }}
              hint="7-day rolling"
              sparkline={[78, 80, 82, 84, 83, 85, 86]}
              accent="sage"
            />
            <KPICard
              icon={Wallet}
              label="Trial days left"
              value="28"
              hint="ends Mar 14"
              accent="sand"
            />
          </motion.div>

          {/* AI insight */}
          <motion.div variants={fadeUp}>
            <AIInsight
              headline="3 clients haven't logged in 5+ days."
              body="Priya, Rohan, and Tanvi have gone quiet. SIRAH drafted a warm check-in message — review and send in one tap."
              cta={{
                label: 'Review draft',
                onClick: () => toast('Draft viewer opens when Messaging module lands.'),
              }}
            />
          </motion.div>

          {/* Two-column: Recent clients + Today */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RecentClientsCard />
            <TodayCard />
          </motion.div>

          {/* Quick actions */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">
              Quick actions
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <QuickAction icon={Plus} label="Invite client" onClick={() => navigate('/clients')} />
              <QuickAction icon={Sparkles} label="New program" onClick={() => navigate('/programs')} />
              <QuickAction icon={Mic} label="Voice note" onClick={() => navigate('/voice')} highlight />
              <QuickAction icon={Camera} label="Scan plate" onClick={() => navigate('/plate-vision')} highlight />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

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
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Recent clients</div>
          <div className="text-xs text-white/45">Activity in the last 24 hours</div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/[0.06]"
        >
          See all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      <ul className="divide-y divide-white/[0.04]">
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
              <div className="truncate text-[11px] text-white/40">{r.program}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-white/40">{r.last}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/30">
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
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <div className="text-sm font-medium">Today</div>
          <div className="text-xs text-white/45">Tuesday · 14 May 2026</div>
        </div>
        <Calendar className="h-4 w-4 text-white/40" />
      </div>

      <ul className="divide-y divide-white/[0.04]">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3">
            <div className="pt-0.5">
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 text-white/25" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm ${it.done ? 'text-white/40 line-through' : 'text-white/90'}`}>
                {it.title}
              </div>
              <div className="text-[11px] text-white/40">{it.time}</div>
            </div>
            {it.highlight && (
              <span className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-200">
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
  icon: Icon,
  label,
  onClick,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border bg-white/[0.02] px-4 py-3 text-left transition-all hover:-translate-y-px hover:bg-white/[0.05] ${
        highlight ? 'border-violet-400/40' : 'border-white/[0.06]'
      }`}
    >
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-violet-300 transition-colors group-hover:from-violet-500/25 group-hover:to-emerald-400/25">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
      {highlight && (
        <span className="ml-auto rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-violet-200">
          AI
        </span>
      )}
    </button>
  );
}


function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'On track':     'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    'Needs review': 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    'At risk':      'border-rose-400/40 bg-rose-400/10 text-rose-200',
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
        styles[status] ?? 'border-white/10 bg-white/[0.04] text-white/50'
      }`}
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
  let ownerName = 'You';
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
