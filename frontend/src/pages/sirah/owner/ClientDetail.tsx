import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Phone,
  Mail,
  MessageCircle,
  Sparkles,
  Activity,
  ClipboardList,
  CalendarDays,
  Target,
  Camera,
  FileText,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { MOCK_CLIENTS } from '@/modules/workspace/clients/data/mockClients';
import { STATUS_META, initialsOf, relativeTime } from '@/modules/workspace/clients/helpers';
import { ProgressRing } from '@/modules/client/components/ProgressRing';

type Tab = 'overview' | 'plan' | 'assessments' | 'messages' | 'files';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',    label: 'Overview',    icon: Activity },
  { id: 'plan',        label: 'Plan',        icon: ClipboardList },
  { id: 'assessments', label: 'Assessments', icon: FileText },
  { id: 'messages',    label: 'Messages',    icon: MessageCircle },
  { id: 'files',       label: 'Files',       icon: Camera },
];

export default function OwnerClientDetail() {
  const { id } = useParams<{ id: string }>();
  const client = useMemo(() => MOCK_CLIENTS.find((c) => c.id === id), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const workspace = readWorkspace();

  if (!client) {
    return (
      <OwnerLayout
        practiceName={workspace.practiceName}
        ownerName={workspace.ownerName}
        initials={workspace.initials}
        trialDaysLeft={28}
      >
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold">Client not found</h1>
          <p className="mt-2 text-sm text-white/55">
            That client doesn't exist or was removed.
          </p>
          <Link
            to="/clients"
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/[0.04]"
          >
            <ChevronLeft className="h-4 w-4" /> Back to clients
          </Link>
        </div>
      </OwnerLayout>
    );
  }

  const meta = STATUS_META[client.status];
  const programPct = client.programTotal > 0 ? (client.programWeek / client.programTotal) * 100 : 0;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-6 md:py-8">
        <motion.div variants={stagger(0.06, 0.04)} initial="initial" animate="animate" className="space-y-6">
          {/* Back link */}
          <motion.div variants={fadeUp}>
            <Link
              to="/clients"
              className="inline-flex items-center gap-1 text-xs text-white/55 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Clients
            </Link>
          </motion.div>

          {/* Client header */}
          <motion.div variants={fadeUp}>
            <Glass className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-base font-medium">
                    {initialsOf(client.name)}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${meta.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/55">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {client.email}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {client.phone}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Joined {new Date(client.joinedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Header actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <ActionPill
                    icon={MessageCircle}
                    label="Message"
                    onClick={() => toast('Messaging module ships next.')}
                  />
                  <ActionPill
                    icon={Sparkles}
                    label="AI summary"
                    onClick={() => toast('AI summary uses the backend — boots when secrets land.')}
                    primary
                  />
                  <ActionPill
                    icon={Pencil}
                    label=""
                    onClick={() => toast('Edit profile is wired to backend / users module.')}
                  />
                </div>
              </div>

              {/* Program strip */}
              {client.program !== '—' && (
                <div className="mt-6 grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-6 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                      Current program
                    </div>
                    <div className="mt-1 text-sm font-medium text-white">{client.program}</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-fuchsia-500"
                          style={{ width: `${programPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-white/55">
                        Week {client.programWeek} of {client.programTotal}
                      </span>
                    </div>
                    {client.goals.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                        <Target className="h-3 w-3 text-indigo-300" />
                        {client.goals.map((g) => (
                          <span key={g} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5">
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Glass>
          </motion.div>

          {/* Tabs */}
          <motion.div variants={fadeUp}>
            <div className="flex gap-1 overflow-x-auto rounded-full bg-white/[0.03] p-1">
              {TABS.map((t) => {
                const active = t.id === tab;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      active ? 'text-white' : 'text-white/55 hover:text-white/85'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="client-tab"
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-600/35 to-fuchsia-500/25"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Tab content */}
          <motion.div variants={fadeUp}>
            {tab === 'overview' && <OverviewTab clientName={client.name.split(' ')[0]} client={client} />}
            {tab !== 'overview' && <ComingSoonTab label={TABS.find((t) => t.id === tab)?.label ?? ''} />}
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

// ─── Overview tab content ────────────────────────────────────────────────

function OverviewTab({ client, clientName }: { client: typeof MOCK_CLIENTS[number]; clientName: string }) {
  return (
    <div className="space-y-5">
      {/* AI summary */}
      <AIGlow intensity="soft" animated>
        <Glass variant="heavy" className="p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
              <Sparkles className="h-4 w-4 text-indigo-200" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-300">
                SIRAH summary · last 7 days
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-white/85">
                {summaryFor(client.id, clientName)}
              </p>
            </div>
          </div>
        </Glass>
      </AIGlow>

      {/* Today's metrics */}
      <Glass className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Today's progress
            </div>
            <div className="text-sm text-white/55">As of {relativeTime(client.lastActivityAt)}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ProgressRing value={0.69} label="69%" sub="Calories" accent="sage" size={110} />
          <ProgressRing value={0.5}  label="50%" sub="Water"    accent="indigo" size={110} />
          <ProgressRing value={0.71} label="71%" sub="Activity" accent="sand" size={110} />
        </div>
      </Glass>

      {/* Recent activity timeline */}
      <Glass className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="text-sm font-medium">Recent activity</div>
          <div className="text-xs text-white/45">Auto-generated from logs and assessments</div>
        </div>
        <ul className="divide-y divide-white/[0.04]">
          {timelineFor(client.id).map((evt, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3.5">
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15 text-indigo-300">
                <evt.icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white/85">{evt.title}</div>
                {evt.detail && <div className="mt-0.5 text-[11px] text-white/45">{evt.detail}</div>}
              </div>
              <span className="text-[11px] text-white/40">{evt.when}</span>
            </li>
          ))}
        </ul>
      </Glass>
    </div>
  );
}

function ComingSoonTab({ label }: { label: string }) {
  return (
    <Glass className="px-6 py-16 text-center">
      <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-white/40">
        <ClipboardList className="h-4 w-4" />
      </div>
      <h3 className="mt-3 text-base font-medium tracking-tight">{label} coming soon</h3>
      <p className="mt-1 text-sm text-white/55">This tab unlocks once we move the relevant module off Supabase Edge Functions.</p>
    </Glass>
  );
}

function ActionPill({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
        primary
          ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white hover:scale-[1.02]'
          : 'border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── Data helpers ────────────────────────────────────────────────────────

function summaryFor(_id: string, firstName: string): string {
  // Deterministic placeholder text. Real summaries come from the AI module.
  return `${firstName} stayed consistent on meals (6/7 days) and activity (5/7 days). Water intake dipped on Wednesday and Friday — worth a gentle nudge. Sleep was solid at 7.1 h avg; mood and energy self-reports were positive. Next coaching priority: reinforce hydration habit and add one strength session this week.`;
}

function timelineFor(_id: string) {
  return [
    {
      icon: Activity,
      title: 'Logged a 35-min brisk walk',
      detail: '180 kcal · marked aerobic activity',
      when: relativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
    },
    {
      icon: Camera,
      title: 'Uploaded a meal photo — Lunch',
      detail: 'AI estimated 540 kcal · awaiting your review',
      when: relativeTime(new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()),
    },
    {
      icon: ClipboardList,
      title: 'Marked breakfast complete',
      detail: 'Vegetable poha + curd',
      when: relativeTime(new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()),
    },
    {
      icon: FileText,
      title: 'Completed weekly check-in',
      detail: 'Mood 4/5 · Energy 4/5 · Sleep 6.8h',
      when: relativeTime(new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()),
    },
    {
      icon: Target,
      title: 'Hit weekly step target',
      detail: '5/7 days · streak: 12 days',
      when: relativeTime(new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()),
    },
  ];
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
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

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
