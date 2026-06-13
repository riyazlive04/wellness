import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Heart, Battery, Loader2, Plus, Smile, Frown, Meh, AlertCircle, Trash2, Sparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type Symptom } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Wellbeing — combines mood/energy tracking + symptom logging into one
 * subjective-state surface. The two are conceptually linked (mood/energy
 * are the high-level signal; symptoms are the granular one).
 */

const MOOD_FACES = [
  { value: 1, label: 'Low',    icon: Frown,  tone: 'text-rose-500' },
  { value: 2, label: 'Meh',    icon: Meh,    tone: 'text-amber-500' },
  { value: 3, label: 'Okay',   icon: Meh,    tone: 'text-yellow-500' },
  { value: 4, label: 'Good',   icon: Smile,  tone: 'text-lime-500' },
  { value: 5, label: 'Great',  icon: Smile,  tone: 'text-emerald-500' },
];

const COMMON_SYMPTOMS = [
  'Bloating', 'Headache', 'Fatigue', 'Acne', 'Cramps', 'Indigestion',
  'Anxiety', 'Sleep trouble', 'Sugar craving', 'Brain fog',
];

export default function ClientWellbeing() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });

  const moodQ = useQuery({
    queryKey: ['me', 'mood', 30],
    queryFn: () => clientsApi.moodHistory(30),
    retry: 1,
  });
  const symptomsQ = useQuery({
    queryKey: ['me', 'symptoms'],
    queryFn: () => clientsApi.mySymptoms(60),
    retry: 1,
  });

  const mood = moodQ.data ?? [];
  const symptoms = symptomsQ.data ?? [];
  const today = mood[0]?.date === new Date().toISOString().slice(0, 10) ? mood[0] : null;

  const logMoodMut = useMutation({
    mutationFn: (body: Parameters<typeof clientsApi.logMood>[0]) => clientsApi.logMood(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'mood'] });
    },
  });

  const [symptomOpen, setSymptomOpen] = useState(false);

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">

        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Inner state · Wellbeing</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">How are you, really?</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">
            Mood and energy speak before the scale does. Track them daily, log symptoms when they show up.
          </p>
        </motion.div>

        {/* Today's mood */}
        <motion.div variants={fadeUp} className="mt-6">
          <Glass className="p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55 inline-flex items-center gap-1.5">
              <Heart className="h-3 w-3 text-rose-500" /> Today's mood
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {MOOD_FACES.map((m) => {
                const Icon = m.icon;
                const active = today?.mood === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => logMoodMut.mutate({ mood: m.value })}
                    className={cn(
                      'inline-flex flex-col items-center gap-1 rounded-2xl border px-4 py-2 text-xs transition-colors',
                      active
                        ? 'border-violet-400/60 bg-violet-400/10'
                        : 'border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.05]',
                    )}
                  >
                    <Icon className={cn('h-5 w-5', m.tone)} />
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 text-[10px] uppercase tracking-[0.18em] text-foreground/55 inline-flex items-center gap-1.5">
              <Battery className="h-3 w-3 text-blue-500" /> Energy level
            </div>
            <div className="mt-2 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = today?.energy === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => logMoodMut.mutate({ energy: n })}
                    className={cn(
                      'h-9 w-9 rounded-full text-sm font-medium transition-colors',
                      active
                        ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white'
                        : 'border border-foreground/15 text-foreground/65 hover:bg-foreground/[0.05]',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </Glass>
        </motion.div>

        {/* Mood mini-chart */}
        {mood.length > 1 && (
          <motion.div variants={fadeUp} className="mt-6">
            <h2 className="mb-3 text-base font-semibold">Last 30 days</h2>
            <Glass className="p-4">
              <MoodSparkline data={mood} />
            </Glass>
          </motion.div>
        )}

        {/* Symptoms section */}
        <motion.div variants={fadeUp} className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Symptoms
            </h2>
            <button
              type="button"
              onClick={() => setSymptomOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white"
            >
              <Plus className="h-3 w-3" /> Log symptom
            </button>
          </div>

          {symptomsQ.isLoading ? (
            <Glass className="flex items-center justify-center p-8 text-sm text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </Glass>
          ) : symptoms.length === 0 ? (
            <Glass className="flex flex-col items-center gap-2 p-8 text-center">
              <Sparkles className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/65">No symptoms logged yet. Tap when something feels off — patterns surface over weeks.</div>
            </Glass>
          ) : (
            <div className="space-y-2">
              {symptoms.map((s) => (
                <SymptomRow key={s.id} symptom={s} onDeleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['me', 'symptoms'] });
                }} />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {symptomOpen && <SymptomDialog onClose={() => setSymptomOpen(false)} />}
    </ClientLayout>
  );
}

function MoodSparkline({ data }: { data: Array<{ date: string; mood: number | null; energy: number | null }> }) {
  // Last 30 days, oldest left to newest right
  const sorted = useMemo(() => [...data].reverse(), [data]);
  if (!sorted.length) return null;
  const w = 100, h = 40;
  const stepX = w / Math.max(1, sorted.length - 1);
  const moodPath = sorted.map((p, i) => {
    const y = p.mood != null ? h - ((p.mood - 1) / 4) * h : null;
    if (y == null) return null;
    return `${i === 0 ? 'M' : 'L'} ${i * stepX} ${y}`;
  }).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h + 4}`} className="h-20 w-full">
      <path d={moodPath} fill="none" stroke="url(#g1)" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="hsl(217 91% 60%)" />
          <stop offset="100%" stopColor="hsl(292 84% 61%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SymptomRow({ symptom, onDeleted }: { symptom: Symptom; onDeleted: () => void }) {
  const del = useMutation({
    mutationFn: () => clientsApi.deleteSymptom(symptom.id),
    onSuccess: () => { toast.success('Deleted.'); onDeleted(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not delete.'),
  });
  return (
    <Glass className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{symptom.symptom}</span>
          <span className={cn(
            'rounded-full px-1.5 py-0 text-[9px] uppercase tracking-[0.18em]',
            symptom.severity >= 4 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-200' :
            symptom.severity >= 3 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-200' :
                                    'bg-foreground/[0.05] text-foreground/65',
          )}>
            Severity {symptom.severity}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/55">
          {new Date(symptom.occurred_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
          })}
          {symptom.suspected_trigger && <> · trigger: <strong>{symptom.suspected_trigger}</strong></>}
        </div>
        {symptom.notes && <div className="mt-1 text-xs text-foreground/75">{symptom.notes}</div>}
      </div>
      <button
        type="button"
        onClick={() => { if (confirm('Delete this entry?')) del.mutate(); }}
        className="text-foreground/45 hover:text-rose-600"
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </Glass>
  );
}

function SymptomDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState(2);
  const [trigger, setTrigger] = useState('');
  const [notes, setNotes] = useState('');

  const logMut = useMutation({
    mutationFn: () => clientsApi.logSymptom({
      symptom: name.trim(),
      severity,
      suspected_trigger: trigger.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Logged.');
      queryClient.invalidateQueries({ queryKey: ['me', 'symptoms'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not save.'),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 " onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-foreground/[0.06] px-5 py-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">New entry</div>
            <div className="text-base font-semibold">Log a symptom</div>
          </div>
          <button type="button" onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground/65 hover:bg-foreground/[0.05]"
            aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Symptom</div>
            <input
              type="text" maxLength={80} value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="e.g. Bloating"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {COMMON_SYMPTOMS.map((s) => (
                <button key={s} type="button" onClick={() => setName(s)}
                  className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] text-foreground/75 hover:bg-foreground/[0.05]">
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Severity</div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setSeverity(n)}
                  className={cn(
                    'h-9 w-9 rounded-full text-sm font-medium',
                    severity === n
                      ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white'
                      : 'border border-foreground/15 text-foreground/65 hover:bg-foreground/[0.05]',
                  )}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Suspected trigger (optional)</div>
            <input type="text" maxLength={80} value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="e.g. dairy, late dinner, stress" />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-foreground/75">Notes (optional)</div>
            <textarea rows={2} maxLength={500} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-violet-400/60 focus:outline-none"
              placeholder="Anything else worth remembering?" />
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] bg-foreground/[0.02] px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-full px-4 py-1.5 text-sm text-foreground/75 hover:bg-foreground/[0.05]">Cancel</button>
          <button type="button" onClick={() => logMut.mutate()}
            disabled={logMut.isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {logMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </footer>
      </motion.div>
    </div>
  );
}