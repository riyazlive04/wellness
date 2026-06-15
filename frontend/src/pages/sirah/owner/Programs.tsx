import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ClipboardList, Plus, Users, Activity, CheckCircle2, Loader2, ArrowRight, Layers } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { programEngineApi, type ProgramTemplate } from '@/modules/workspace/api/programEngine';
import { cn } from '@/lib/utils';

const CATEGORIES = ['weight_management', 'lifestyle', 'sports', 'clinical', 'corporate', 'custom'];
const STATUS_CHIP: Record<string, string> = {
  draft: 'border-foreground/15 bg-foreground/[0.04] text-foreground/60',
  published: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200',
  archived: 'border-foreground/15 bg-foreground/[0.04] text-foreground/45',
};

export default function OwnerPrograms() {
  const ws = readWorkspace();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [weeks, setWeeks] = useState(4);

  const templatesQ = useQuery({ queryKey: ['programs', 'templates'], queryFn: programEngineApi.listTemplates });
  const analyticsQ = useQuery({ queryKey: ['programs', 'analytics'], queryFn: programEngineApi.analytics });

  const createMut = useMutation({
    mutationFn: () => programEngineApi.createTemplate({ name: name.trim(), category, durationWeeks: weeks }),
    onSuccess: () => {
      setName(''); setCreating(false);
      qc.invalidateQueries({ queryKey: ['programs', 'templates'] });
      qc.invalidateQueries({ queryKey: ['programs', 'analytics'] });
      toast.success('Program created — add tasks and publish it.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create program.'),
  });

  const templates = templatesQ.data ?? [];
  const a = analyticsQ.data;

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Program Engine">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/60">Programs</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Program Engine</h1>
              <p className="mt-1 text-sm text-foreground/60">Build reusable programs, assign them to clients, and track adherence.</p>
            </div>
            <button type="button" onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-2 self-start rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> New program
            </button>
          </motion.div>

          {/* Analytics */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPICard icon={Layers} label="Templates" value={String(a?.total_templates ?? 0)} hint={`${a?.published_templates ?? 0} published`} accent="indigo" />
            <KPICard icon={Activity} label="Active programs" value={String(a?.active_programs ?? 0)} hint="in progress" accent="sage" />
            <KPICard icon={Users} label="Clients enrolled" value={String(a?.clients_enrolled ?? 0)} hint="active" accent="sand" />
            <KPICard icon={CheckCircle2} label="Avg progress" value={`${a?.avg_progress ?? 0}%`} hint={`${a?.completed_programs ?? 0} completed`} accent="sage" />
          </motion.div>

          {/* Create form */}
          {creating && (
            <motion.div variants={fadeUp}>
              <Glass className="space-y-3 p-4">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name — e.g. 12-Week Weight Management"
                  className="h-10 w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
                <div className="flex flex-wrap items-center gap-2">
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="h-9 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs capitalize focus:outline-none">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-foreground/60">
                    Duration
                    <input type="number" min={1} max={104} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}
                      className="h-9 w-16 rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" /> weeks
                  </label>
                  <button type="button" onClick={() => name.trim() && createMut.mutate()} disabled={!name.trim() || createMut.isPending}
                    className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 text-xs font-medium text-white disabled:opacity-40">
                    {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
                  </button>
                </div>
              </Glass>
            </motion.div>
          )}

          {/* Templates grid */}
          {templatesQ.isLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : templates.length === 0 ? (
            <motion.div variants={fadeUp}><Glass className="p-10 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-foreground/25" />
              <div className="mt-3 text-sm text-foreground/70">No programs yet</div>
              <div className="mt-1 text-xs text-foreground/50">Create your first reusable program to assign to clients.</div>
            </Glass></motion.div>
          ) : (
            <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => <TemplateCard key={t.id} t={t} />)}
            </motion.div>
          )}
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function TemplateCard({ t }: { t: ProgramTemplate }) {
  return (
    <Link to={`/programs/${t.id}`}>
      <Glass className="group flex h-full flex-col p-5 transition-transform hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', STATUS_CHIP[t.status])}>{t.status}</span>
          <span className="text-[11px] capitalize text-foreground/45">{t.category.replace('_', ' ')}</span>
        </div>
        <div className="mt-3 text-base font-semibold">{t.name}</div>
        {t.description && <div className="mt-1 line-clamp-2 text-xs text-foreground/55">{t.description}</div>}
        <div className="mt-auto flex items-center gap-3 pt-4 text-[11px] text-foreground/55">
          <span>{t.duration_weeks}w</span>
          <span>· {t.task_count ?? 0} tasks</span>
          <span>· {t.assigned_count ?? 0} assigned</span>
          <ArrowRight className="ml-auto h-3.5 w-3.5 text-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Glass>
    </Link>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; }
  } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
