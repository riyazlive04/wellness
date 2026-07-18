import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Brain, Sparkles, Loader2, Check, X, ShieldCheck, AlertTriangle, TrendingUp, Lightbulb, ThumbsUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { aiEcosystemApi, type Recommendation, type GovernanceAction } from '@/modules/workspace/api/aiEcosystem';
import { cn } from '@/lib/utils';

const SEV: Record<string, { chip: string; icon: typeof Lightbulb }> = {
  risk: { chip: 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200', icon: AlertTriangle },
  opportunity: { chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200', icon: TrendingUp },
  info: { chip: 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200', icon: Lightbulb },
};

export default function OwnerAiEcosystem() {
  const ws = readWorkspace();
  const qc = useQueryClient();

  const analyticsQ = useQuery({ queryKey: ['ai-eco', 'analytics'], queryFn: aiEcosystemApi.analytics });
  const recsQ = useQuery({ queryKey: ['ai-eco', 'recs'], queryFn: aiEcosystemApi.listRecommendations });
  const govQ = useQuery({ queryKey: ['ai-eco', 'gov'], queryFn: () => aiEcosystemApi.listGovernance() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ai-eco', 'recs'] });
    qc.invalidateQueries({ queryKey: ['ai-eco', 'gov'] });
    qc.invalidateQueries({ queryKey: ['ai-eco', 'analytics'] });
  };

  const genMut = useMutation({
    mutationFn: aiEcosystemApi.generate,
    onSuccess: () => { toast.success('Fresh recommendations generated.'); invalidate(); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not generate.'),
  });
  const recStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'applied' | 'dismissed' }) => aiEcosystemApi.setRecStatus(id, status),
    onSuccess: invalidate,
  });
  const reviewMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => aiEcosystemApi.reviewGovernance(id, decision),
    onSuccess: (g) => {
      const sent = g.result && typeof g.result.sent === 'number' ? g.result.sent : null;
      toast.success(g.status === 'executed' ? `Executed${sent != null ? ` · ${sent} sent` : ''}` : `Action ${g.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message ?? 'Review failed.'),
  });

  const a = analyticsQ.data;
  const recs = (recsQ.data ?? []).filter((r) => r.status === 'new');
  const pending = (govQ.data ?? []).filter((g) => g.status === 'pending');

  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="AI Ecosystem">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-6">
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
              <Brain className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Enterprise AI</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">AI Ecosystem</h1>
            <p className="mt-1 text-sm text-foreground/60">AI recommendations, a human-approval queue for AI actions, and AI health - in one place.</p>
          </motion.div>

          {/* Analytics */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="AI calls (30d)" value={String(a?.ai_calls_30d ?? 0)} hint={`${a?.conversations ?? 0} conversations`} />
            <Stat label="AI actions run" value={String(a?.actions_run ?? 0)} hint={`${a?.recs_applied ?? 0} recs applied`} />
            <Stat label="Awaiting approval" value={String(a?.gov_pending ?? 0)} hint={`${a?.gov_approved ?? 0} approved`} />
            <Stat label="Satisfaction" value={`${a?.satisfaction ?? 100}%`} hint={`${a?.feedback_up ?? 0}↑ / ${a?.feedback_down ?? 0}↓`} />
          </motion.div>

          {/* Governance queue */}
          {pending.length > 0 && (
            <motion.div variants={fadeUp}>
              <Glass className="overflow-hidden border-amber-400/30">
                <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
                  <ShieldCheck className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Needs your approval</span>
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">{pending.length}</span>
                </div>
                <ul className="divide-y divide-foreground/[0.05]">
                  {pending.map((g) => <GovernanceRow key={g.id} g={g} busy={reviewMut.isPending}
                    onApprove={() => reviewMut.mutate({ id: g.id, decision: 'approve' })}
                    onReject={() => reviewMut.mutate({ id: g.id, decision: 'reject' })} />)}
                </ul>
              </Glass>
            </motion.div>
          )}

          {/* Recommendations */}
          <motion.div variants={fadeUp}>
            <Glass className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-3">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-500" /><span className="text-sm font-medium">AI recommendations</span></div>
                <button type="button" onClick={() => genMut.mutate()} disabled={genMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {genMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Generate
                </button>
              </div>
              {recsQ.isLoading ? (
                <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : recs.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-foreground/50">No active recommendations. Hit Generate to get AI suggestions from your data.</div>
              ) : (
                <ul className="divide-y divide-foreground/[0.05]">
                  {recs.map((r) => <RecRow key={r.id} r={r}
                    onApply={() => recStatusMut.mutate({ id: r.id, status: 'applied' })}
                    onDismiss={() => recStatusMut.mutate({ id: r.id, status: 'dismissed' })} />)}
                </ul>
              )}
            </Glass>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center gap-1.5 text-[11px] text-foreground/40">
            <ThumbsUp className="h-3 w-3" /> Thumbs up/down on the AI assistant feeds the learning signal that improves these recommendations.
          </motion.div>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Glass className="p-3.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-foreground/45">{hint}</div>
    </Glass>
  );
}

function RecRow({ r, onApply, onDismiss }: { r: Recommendation; onApply: () => void; onDismiss: () => void }) {
  const sev = SEV[r.severity] ?? SEV.info;
  const Icon = sev.icon;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span className={cn('mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg border', sev.chip)}><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{r.title}</div>
        {r.body && <div className="mt-0.5 text-xs text-foreground/60">{r.body}</div>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button type="button" onClick={onApply} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-400/[0.15] dark:text-emerald-200"><Check className="h-3 w-3" /> Apply</button>
        <button type="button" onClick={onDismiss} className="rounded-full p-1.5 text-foreground/40 hover:text-rose-500"><X className="h-3.5 w-3.5" /></button>
      </div>
    </li>
  );
}

function GovernanceRow({ g, busy, onApprove, onReject }: { g: GovernanceAction; busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span className="mt-0.5 rounded-md bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/50">{g.proposed_by}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{g.title}</div>
        {g.description && <div className="mt-0.5 text-xs text-foreground/60">{g.description}</div>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <button type="button" onClick={onApprove} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"><Check className="h-3 w-3" /> Approve</button>
        <button type="button" onClick={onReject} disabled={busy} className="rounded-full border border-foreground/10 px-2.5 py-1.5 text-[11px] text-foreground/60 hover:bg-foreground/[0.05] disabled:opacity-50">Reject</button>
      </div>
    </li>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
