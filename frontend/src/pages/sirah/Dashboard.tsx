import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles, Users, Calendar, FileText } from 'lucide-react';

import {
  AIGlow,
  BrandMark,
  Glass,
  GradientOrb,
  fadeUp,
  stagger,
} from '@/design-system';

/**
 * Temporary post-onboarding landing.
 *
 * Reads the workspace draft from localStorage (saved by the onboarding flow)
 * and shows a welcome state. The real owner dashboard ships next — this is
 * a stub so the onboarding flow has somewhere meaningful to land.
 */
export default function SirahDashboard() {
  const draft = readDraft();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0C10] text-white">
      <GradientOrb color="indigo" size={520} position="-top-32 -left-20" />
      <GradientOrb color="sage" size={460} position="-bottom-32 -right-16" delay={2} driftDuration={22} />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/sirah" className="flex items-center gap-3">
            <BrandMark size={32} />
            <span className="text-sm font-semibold tracking-tight">SIRAH LIFE</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
              30-day trial
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500/40 to-emerald-400/30 text-xs font-medium">
              {draft.initials}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 py-12">
        <motion.div variants={stagger(0.08, 0.06)} initial="initial" animate="animate">
          {/* Welcome */}
          <motion.div variants={fadeUp} className="mb-12">
            <span className="text-xs uppercase tracking-[0.18em] text-white/40">
              Welcome to SIRAH LIFE
            </span>
            <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              Your workspace is ready{draft.practiceName ? `, ${draft.practiceName}` : ''}.
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-white/55">
              The owner dashboard is being polished. For now, here's what's already set up
              and what comes next. You can start inviting clients right away.
            </p>
          </motion.div>

          {/* What's set up */}
          <motion.div variants={fadeUp} className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SetupCard
              icon={Sparkles}
              label="Plan selected"
              value={draft.planName ?? 'Not selected'}
              note={draft.planName ? '30-day trial active' : 'Pick a plan to activate trial'}
            />
            <SetupCard
              icon={FileText}
              label="Specializations"
              value={draft.specializations.length ? String(draft.specializations.length) : '0'}
              note={
                draft.specializations.length
                  ? draft.specializations.slice(0, 3).join(' · ')
                  : 'Add via Settings'
              }
            />
            <SetupCard
              icon={Calendar}
              label="Trial ends"
              value={draft.trialEnd}
              note="Add payment any time"
            />
          </motion.div>

          {/* What's next */}
          <motion.div variants={fadeUp}>
            <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">
              Suggested next steps
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <NextAction
                icon={Users}
                title="Invite your first clients"
                body="Send WhatsApp or email invites. They onboard themselves and land in your roster."
                href="#"
                highlight
              />
              <NextAction
                icon={Sparkles}
                title="Create your first program"
                body="AI-assisted templates tuned to your specializations. Edit and assign in minutes."
                href="#"
              />
              <NextAction
                icon={FileText}
                title="Customize your client portal"
                body="Brand colors, logo, welcome message. Your clients see your practice — not ours."
                href="#"
              />
              <NextAction
                icon={Calendar}
                title="Connect your calendar"
                body="Sync Google Calendar so SIRAH can schedule and remind clients of appointments."
                href="#"
              />
            </div>
          </motion.div>

          {/* Footer hint */}
          <motion.div variants={fadeUp} className="mt-12 text-center text-xs text-white/40">
            The full owner dashboard ships next. For now, your workspace draft is saved locally.
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface SetupCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
}

function SetupCard({ icon: Icon, label, value, note }: SetupCardProps) {
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</span>
        <Icon className="h-4 w-4 text-indigo-300" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-white/50">{note}</div>
    </Glass>
  );
}

interface NextActionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href: string;
  highlight?: boolean;
}

function NextAction({ icon: Icon, title, body, href, highlight }: NextActionProps) {
  const content = (
    <Glass interactive className="group h-full p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-400/20 text-indigo-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-medium tracking-tight">{title}</h3>
            <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-white" />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-white/55">{body}</p>
        </div>
      </div>
    </Glass>
  );

  if (highlight) {
    return (
      <a href={href}>
        <AIGlow intensity="soft" animated={false}>
          {content}
        </AIGlow>
      </a>
    );
  }
  return <a href={href}>{content}</a>;
}

// ─────────────────────────────────────────────────────────────────────────

interface DraftSummary {
  practiceName: string | null;
  initials: string;
  planName: string | null;
  specializations: string[];
  trialEnd: string;
}

function readDraft(): DraftSummary {
  let practiceName: string | null = null;
  let planId: string | null = null;
  let specializations: string[] = [];
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      practiceName = d?.practiceName || null;
      planId = d?.planId || null;
      specializations = Array.isArray(d?.specializations) ? d.specializations : [];
    }
  } catch { /* ignore */ }

  const planMap: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    scale: 'Scale',
    enterprise: 'Enterprise',
  };

  const initials = practiceName
    ? practiceName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : 'SL';

  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  return {
    practiceName,
    initials,
    planName: planId ? planMap[planId] ?? planId : null,
    specializations,
    trialEnd,
  };
}
