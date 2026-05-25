import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Plus, ClipboardList, Sparkles, BookTemplate, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { ProgramCard } from '@/modules/workspace/programs/ProgramCard';
import { CreateProgramDialog } from '@/modules/workspace/programs/CreateProgramDialog';
import { MOCK_PROGRAMS } from '@/modules/workspace/programs/data/mockPrograms';
import type { ProgramFilter } from '@/modules/workspace/programs/types';

export default function OwnerPrograms() {
  const workspace = readWorkspace();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_PROGRAMS.filter((p) => {
      if (filter === 'active' && p.isTemplate) return false;
      if (filter === 'templates' && !p.isTemplate) return false;
      if (filter === 'ai' && !p.aiAssisted) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.specialization.toLowerCase().includes(q) ||
        p.goals.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [query, filter]);

  const counts = useMemo(() => {
    return MOCK_PROGRAMS.reduce(
      (acc, p) => {
        acc.all++;
        if (p.isTemplate) acc.templates++;
        else acc.active++;
        if (p.aiAssisted) acc.ai++;
        acc.enrolled += p.enrolledCount;
        return acc;
      },
      { all: 0, active: 0, templates: 0, ai: 0, enrolled: 0 },
    );
  }, []);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${counts.all} programs · ${counts.enrolled} enrollments`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-white/40">Programs</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Your curriculum library
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Reusable templates and active programs your clients are working through.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="group inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Create program
            </button>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard
              icon={ClipboardList}
              label="Total programs"
              value={String(counts.all)}
              hint={`${counts.active} active · ${counts.templates} templates`}
              accent="indigo"
            />
            <KPICard
              icon={Users}
              label="Total enrollments"
              value={String(counts.enrolled)}
              delta={{ value: '+5', direction: 'up' }}
              hint="across all programs"
              accent="sage"
            />
            <KPICard
              icon={Sparkles}
              label="AI-assisted"
              value={String(counts.ai)}
              hint={`${Math.round((counts.ai / counts.all) * 100)}% of programs`}
              accent="sand"
            />
          </motion.div>

          {/* Filter bar */}
          <motion.div variants={fadeUp}>
            <Glass className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:p-4">
              <div className="flex flex-wrap items-center gap-1">
                <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterChip label="Active" count={counts.active} active={filter === 'active'} onClick={() => setFilter('active')} />
                <FilterChip label="Templates" count={counts.templates} active={filter === 'templates'} onClick={() => setFilter('templates')} />
                <FilterChip label="AI-assisted" count={counts.ai} active={filter === 'ai'} onClick={() => setFilter('ai')} />
              </div>

              <div className="relative w-full md:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search programs…"
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 pl-9 pr-3 text-sm placeholder:text-white/30 focus:border-violet-400/50 focus:bg-white/[0.05] focus:outline-none"
                />
              </div>
            </Glass>
          </motion.div>

          {/* Grid or empty */}
          <motion.div variants={fadeUp}>
            {filtered.length === 0 ? (
              <EmptyState
                hasQuery={query.length > 0 || filter !== 'all'}
                onCreate={() => setCreateOpen(true)}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((p) => (
                  <ProgramCard key={p.id} program={p} />
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>

      <CreateProgramDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async () => {
          // Backend isn't booted yet — just resolve so the dialog can show success.
          await new Promise((r) => setTimeout(r, 600));
        }}
      />
    </OwnerLayout>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-all ${
        active ? 'bg-white/[0.08] text-white' : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/45'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ hasQuery, onCreate }: { hasQuery: boolean; onCreate: () => void }) {
  return (
    <Glass className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/15 to-fuchsia-500/15">
        <BookTemplate className="h-5 w-5 text-violet-300" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-medium tracking-tight">
          {hasQuery ? 'No programs match these filters' : 'No programs yet'}
        </h3>
        <p className="max-w-sm text-sm text-white/55">
          {hasQuery
            ? 'Try clearing filters or your search.'
            : 'Build reusable templates and assign them to clients. SIRAH AI can draft your first curriculum.'}
        </p>
      </div>
      {!hasQuery && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-5 py-2 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Create your first program
        </button>
      )}
    </Glass>
  );
}

// ─────────────────────────────────────────────────────────────────────────

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
