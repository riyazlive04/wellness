import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';

import { videoKeyApi, type VideoKeyView } from '@/modules/workspace/api/videoKey';
import { tenancyApi } from '@/modules/workspace/api/tenancy';
import { useScope } from '@/hooks/useScope';
import { SectionHeader } from './GeneralSection';
import { cn } from '@/lib/utils';

const STEPS = [
  'Go to dashboard.daily.co and create a free account (or sign in).',
  'Open "Developers" in the left menu.',
  'Copy the API key shown there.',
  'Paste it below and click "Save & test key".',
];

/** 90 → "1 h 30 m", 45 → "45 m", 1800 → "30 h". */
function hoursLabel(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/**
 * Settings → Video calls. Video calls come with the plan, metered in monthly
 * hours. A practice can connect its own Daily.co account instead: calls then
 * run on that account (Daily.co bills it) and don't use the plan's hours.
 */
export function VideoSection() {
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner';
  const qc = useQueryClient();
  const keyQ = useQuery({ queryKey: ['workspace', 'video-key'], queryFn: videoKeyApi.get, staleTime: 0 });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, staleTime: 60_000 });
  const view = keyQ.data;
  const own = view?.source === 'own';
  const hasKey = !!view && view.status !== 'missing';

  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const setView = (v: VideoKeyView) => qc.setQueryData(['workspace', 'video-key'], v);

  const save = useMutation({
    mutationFn: () => videoKeyApi.save(key.trim()),
    onSuccess: (v) => {
      setView(v);
      setKey('');
      setEditing(false);
      toast.success('Daily.co connected. Your video calls now run on your own account.');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the key.'),
  });
  const retest = useMutation({
    mutationFn: videoKeyApi.test,
    onSuccess: (v) => {
      setView(v);
      if (v.status === 'connected') toast.success('Key is working.');
      else toast.error(v.last_error || 'Daily.co rejected the key.');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not test the key.'),
  });
  const remove = useMutation({
    mutationFn: videoKeyApi.remove,
    onSuccess: () => {
      toast.success("Your key is removed. Video calls are back on NUSI's, using your plan's hours.");
      qc.invalidateQueries({ queryKey: ['workspace', 'video-key'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove the key.'),
  });

  const used = limitsQ.data?.usage.videoMinutesThisMonth ?? 0;
  const limit = limitsQ.data?.limits.videoMinutesPerMonth;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <SectionHeader
      title="Video calls"
      subtitle="Video consultations come with your NUSI plan, measured in hours a month. You can connect your own Daily.co account instead and pay Daily.co directly."
    >
      {/* Where calls run, and hours used */}
      {keyQ.isLoading ? (
        <div className="h-[110px] animate-pulse rounded-3xl border border-foreground/[0.06] bg-card shadow-sm" />
      ) : (
        <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={cn('grid h-10 w-10 place-items-center rounded-2xl', own ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[hsl(var(--brand-blue)_/_0.12)] text-[hsl(var(--brand-blue))]')}>
                <Video className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-bold">
                  {own ? `Your own Daily.co account${view?.domain ? ` (${view.domain})` : ''}` : "NUSI's video, from your plan"}
                </div>
                <div className="text-xs text-foreground/60">
                  {own
                    ? `Key ending ${view?.last4} · calls don't use your plan's hours; Daily.co bills your account.`
                    : limit === 0 ? "Your plan doesn't include video calls. Upgrade to Growth, or connect your own Daily.co account."
                      : limit == null ? 'Unlimited on your plan.'
                        : `${hoursLabel(used)} of ${hoursLabel(limit)} used this month.`}
                </div>
              </div>
            </div>
            {isOwner && !editing && (
              <div className="flex flex-wrap gap-2">
                {hasKey && (
                  <button type="button" onClick={() => retest.mutate()} disabled={retest.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-foreground/[0.04] disabled:opacity-50">
                    {retest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Test again
                  </button>
                )}
                <button type="button" onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold hover:bg-foreground/[0.04]">
                  <KeyRound className="h-3.5 w-3.5" /> {hasKey ? 'Replace key' : 'Use my own Daily.co'}
                </button>
                {hasKey && (
                  <button type="button" onClick={() => { if (confirm("Remove your Daily.co key? Video calls go back to NUSI's, using your plan's hours.")) remove.mutate(); }}
                    disabled={remove.isPending}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/10 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>
            )}
          </div>
          {!own && limit != null && limit > 0 && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
              <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[hsl(var(--brand-blue))]')}
                style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }} />
            </div>
          )}
          {view?.status === 'error' && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Your Daily.co key stopped working ({view.last_error}). Calls are using NUSI's video and your plan's hours until you fix it and test again.
            </div>
          )}
          {own && view?.status === 'connected' && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected and working
            </div>
          )}
        </div>
      )}

      {/* Connect / replace */}
      {isOwner && editing && (
        <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">{hasKey ? 'Replace your Daily.co key' : 'Connect your own Daily.co account'}</h3>
          <p className="mt-1 text-xs text-foreground/65">
            Daily.co gives every account free video minutes each month and then bills per minute. Once connected, your practice's calls run on your account and don't count against your NUSI plan.
          </p>
          <div className="mt-4 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
            <div className="text-xs font-semibold">How to get your Daily.co key</div>
            <ol className="mt-2 space-y-1.5">
              {STEPS.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-foreground/75">
                  <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-blue))]/10 text-[10px] font-bold text-[hsl(var(--brand-blue))]">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <a href="https://dashboard.daily.co/developers" target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--brand-blue))] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Open Daily.co dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <label className="mt-4 block text-xs font-medium text-foreground/75">API key</label>
          <div className="relative mt-1.5">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your Daily.co API key"
              autoComplete="off"
              spellCheck={false}
              maxLength={400}
              className="w-full rounded-xl border border-foreground/10 bg-transparent py-2 pl-3 pr-10 font-mono text-sm placeholder:text-foreground/35 focus:border-teal-500/40 focus:outline-none"
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide key' : 'Show key'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-foreground/50 hover:text-foreground/80">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending || key.trim().length < 20}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-canvas hover:opacity-90 disabled:opacity-50">
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {save.isPending ? 'Checking key…' : 'Save & test key'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setKey(''); }}
              className="rounded-xl border border-foreground/10 px-4 py-2 text-sm font-semibold hover:bg-foreground/[0.04]">Cancel</button>
          </div>
        </div>
      )}
    </SectionHeader>
  );
}
