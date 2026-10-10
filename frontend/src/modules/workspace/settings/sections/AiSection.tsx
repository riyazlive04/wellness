import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, Gauge, KeyRound, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { aiKeyApi, aiSource, type AiKeyView, type AiProvider } from '@/modules/workspace/api/aiKey';
import { useScope } from '@/hooks/useScope';
import { tenancyApi } from '@/modules/workspace/api/tenancy';
import { SectionHeader } from './GeneralSection';
import { ClientAssistantCard } from './ClientAssistantCard';
import { cn } from '@/lib/utils';

const PROVIDERS: Record<AiProvider, {
  name: string; blurb: string; getKeyUrl: string; getKeyLabel: string; placeholder: string; steps: string[]; note: string;
}> = {
  gemini: {
    name: 'Google Gemini',
    blurb: 'Free tier available. Get a key from Google AI Studio.',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    getKeyLabel: 'Open Google AI Studio',
    placeholder: 'AIza…',
    steps: [
      'Open Google AI Studio and sign in with your Google account.',
      'Click "Create API key". If Google asks, pick a Google Cloud project or let it create one.',
      'Copy the key. It starts with "AIza".',
      'Paste it in the box below and click "Save & test key".',
    ],
    note: 'The free tier is enough to start. If your practice uses AI heavily, turn on billing for that project in Google Cloud to avoid hitting limits.',
  },
  openai: {
    name: 'OpenAI',
    blurb: 'Pay-as-you-go. Get a key from the OpenAI dashboard.',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    getKeyLabel: 'Open the OpenAI dashboard',
    placeholder: 'sk-…',
    steps: [
      'Open the OpenAI dashboard and sign in (or create an account).',
      "Add a payment method and some credit under Settings -> Billing. OpenAI keys don't work without credit.",
      'Go to API keys, click "Create new secret key", name it "NUSI" and copy it. It starts with "sk-" and is shown only once.',
      'Paste it in the box below and click "Save & test key".',
    ],
    note: 'OpenAI charges your card for what your practice uses. You can set a monthly spending limit in their billing settings.',
  },
};

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;

/**
 * Settings -> AI. AI comes with every NUSI plan (and the trial), metered by
 * the plan's monthly credits. A practice can connect its own Gemini or OpenAI
 * key instead; credits still count.
 */
export function AiSection() {
  const { data: scope } = useScope();
  const isOwner = scope?.workspaceRole === 'owner';
  const qc = useQueryClient();

  const keyQ = useQuery({
    queryKey: ['workspace', 'ai-key'],
    queryFn: aiKeyApi.get,
    staleTime: 0,
  });
  const view = keyQ.data;
  const hasKey = !!view && view.status !== 'missing';
  const source = aiSource(view);
  const included = !!view?.included;

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);

  const setView = (v: AiKeyView) => qc.setQueryData(['workspace', 'ai-key'], v);

  const save = useMutation({
    mutationFn: () => aiKeyApi.save(provider, key.trim()),
    onSuccess: (v) => {
      setView(v);
      setKey('');
      setShow(false);
      setEditing(false);
      toast.success(`${PROVIDERS[provider].name} key connected. Your practice's AI now runs on it.`);
      // Screens that show "AI not set up" read these.
      qc.invalidateQueries({ queryKey: ['assistant'] });
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the key.'),
  });

  const retest = useMutation({
    mutationFn: aiKeyApi.test,
    onSuccess: (v) => {
      setView(v);
      if (v.status === 'connected') toast.success('Key is working.');
      else toast.error(v.last_error || 'The provider rejected the key.');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not test the key.'),
  });

  const remove = useMutation({
    mutationFn: aiKeyApi.remove,
    onSuccess: () => {
      toast.success(included ? "Your key is removed. AI is back on NUSI's AI from your plan." : 'Your key is removed.');
      qc.invalidateQueries({ queryKey: ['workspace', 'ai-key'] });
      qc.invalidateQueries({ queryKey: ['assistant'] });
      qc.invalidateQueries({ queryKey: ['meal-plans'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove the key.'),
  });

  const startEdit = () => {
    setProvider(view?.provider ?? 'gemini');
    setKey('');
    setEditing(true);
  };

  // With no AI at all the form shows straight away; with NUSI's AI it's optional.
  const showForm = isOwner && (source === 'none' || editing);
  const tooShort = key.trim().length < 20;

  return (
    <SectionHeader
      title="AI"
      subtitle="AI comes with your NUSI plan: Plate Vision, voice notes, AI meal plans and your clients' AI assistant. Each AI action uses one credit from your plan."
    >
      {/* Status */}
      {keyQ.isLoading ? (
        <div className="h-[88px] animate-pulse rounded-3xl border border-foreground/[0.06] bg-card shadow-sm" />
      ) : keyQ.isError ? (
        <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 text-sm text-foreground/70 shadow-sm">
          Couldn't load your AI settings. Please refresh the page.
        </div>
      ) : (
        <StatusCard
          view={view!}
          source={source ?? 'none'}
          onUseOwnKey={startEdit}
          isOwner={isOwner}
          busy={retest.isPending || remove.isPending}
          onChange={startEdit}
          onRetest={() => retest.mutate()}
          onRemove={() => {
            const msg = included
              ? "Remove your own AI key? Your practice's AI goes back to NUSI's AI from your plan."
              : "Remove your AI key? Plate Vision, voice notes, AI meal plans and your clients' AI assistant will stop until you choose a plan or add a key.";
            if (confirm(msg)) remove.mutate();
          }}
          retesting={retest.isPending}
          editing={editing}
        />
      )}

      {/* Add / replace */}
      {showForm && !keyQ.isLoading && (
        <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">{hasKey ? 'Replace your AI key' : 'Connect your own AI key'}</h3>
          {!hasKey && included && (
            <p className="mt-1 text-xs text-foreground/65">
              Optional. Your practice's AI will run on your own Google or OpenAI account instead of NUSI's. Your plan's monthly credits still apply.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3">
            {(Object.keys(PROVIDERS) as AiProvider[]).map((p) => {
              const active = provider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn(
                    'min-w-[200px] flex-1 rounded-2xl border px-4 py-3 text-left transition-colors',
                    active
                      ? 'border-[hsl(var(--brand-blue))]/40 bg-[hsl(var(--brand-blue))]/[0.07]'
                      : 'border-foreground/10 hover:bg-foreground/[0.03]',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn('h-3.5 w-3.5 rounded-full border-2', active ? 'border-[hsl(var(--brand-blue))] bg-[hsl(var(--brand-blue))]' : 'border-foreground/30')} />
                    {PROVIDERS[p].name}
                  </div>
                  <p className="mt-1 text-xs text-foreground/65">{PROVIDERS[p].blurb}</p>
                </button>
              );
            })}
          </div>

          {/* How to get a key */}
          <div className="mt-4 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
            <div className="text-xs font-semibold text-foreground">How to get your {PROVIDERS[provider].name} key</div>
            <ol className="mt-2 space-y-1.5">
              {PROVIDERS[provider].steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-foreground/75">
                  <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-blue))]/10 text-[10px] font-bold text-[hsl(var(--brand-blue))]">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <a
              href={PROVIDERS[provider].getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--brand-blue))] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {PROVIDERS[provider].getKeyLabel} <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/60">{PROVIDERS[provider].note}</p>
          </div>

          <label className="mt-4 block text-xs font-medium text-foreground/75">API key</label>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={PROVIDERS[provider].placeholder}
                autoComplete="off"
                spellCheck={false}
                maxLength={400}
                className="w-full rounded-xl border border-foreground/10 bg-transparent py-2 pl-3 pr-10 font-mono text-sm placeholder:text-foreground/35 focus:border-teal-500/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-foreground/50 hover:text-foreground/80"
                aria-label={show ? 'Hide key' : 'Show key'}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || tooShort}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {save.isPending ? 'Checking key…' : 'Save & test key'}
            </button>
            {(hasKey || source === 'nusi') && (
              <button
                type="button"
                onClick={() => { setEditing(false); setKey(''); }}
                className="rounded-xl border border-foreground/10 px-4 py-2 text-sm text-foreground/80 hover:bg-foreground/[0.04]"
              >
                Cancel
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-foreground/55">We check the key with {PROVIDERS[provider].name} before saving it.</p>
        </div>
      )}

      <CreditsMeter isOwner={isOwner} />

      <ClientAssistantCard isOwner={isOwner} />

      {/* How it works */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 text-xs leading-relaxed text-foreground/70">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> How AI works in NUSI
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>AI is included in every NUSI plan and the free trial. Each AI action uses one credit from your plan's monthly allowance.</li>
          <li>When the month's credits run out, AI pauses until they reset on the 1st, or until you add a credit pack in Billing.</li>
          <li>You can connect your own Google Gemini or OpenAI key. AI then runs on your account and your provider bills you; your plan's credits still apply.</li>
          <li>Your own key is encrypted before it's stored. Nobody can see it again, not even your team. We only show the last 4 characters.</li>
        </ul>
      </div>
    </SectionHeader>
  );
}

function StatusCard({
  view, source, isOwner, busy, retesting, editing, onChange, onRetest, onRemove, onUseOwnKey,
}: {
  view: AiKeyView;
  source: 'own' | 'nusi' | 'none';
  onUseOwnKey: () => void;
  isOwner: boolean;
  busy: boolean;
  retesting: boolean;
  editing: boolean;
  onChange: () => void;
  onRetest: () => void;
  onRemove: () => void;
}) {
  if (source === 'nusi') {
    return (
      <div className="rounded-3xl border border-emerald-400/40 bg-emerald-400/[0.06] p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
            <div>
              <div className="text-sm font-semibold text-foreground">AI is on, included in your plan</div>
              <p className="mt-0.5 text-xs text-foreground/70">
                Plate Vision, voice notes, AI meal plans and your clients' AI assistant are ready. Nothing to set up.
              </p>
            </div>
          </div>
          {isOwner && !editing && (
            <button
              type="button"
              onClick={onUseOwnKey}
              className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.04]"
            >
              <KeyRound className="h-3.5 w-3.5" /> Use my own key
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view.status === 'missing') {
    return (
      <div className="flex items-start gap-3 rounded-3xl border border-amber-400/40 bg-amber-400/[0.07] p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
        <div>
          <div className="text-sm font-semibold text-foreground">AI is off for your practice</div>
          <p className="mt-0.5 text-xs text-foreground/70">
            {isOwner ? (
              <>
                AI comes with every NUSI plan.{' '}
                <Link to="/billing" className="font-semibold text-[hsl(var(--brand-blue))] hover:underline">Choose a plan</Link>
                {' '}to turn it back on, or connect your own Google Gemini or OpenAI key below.
              </>
            ) : (
              'Ask your practice owner to choose a plan or add an AI key in Settings -> AI.'
            )}
          </p>
        </div>
      </div>
    );
  }

  const ok = view.status === 'connected';
  const name = view.provider ? PROVIDERS[view.provider].name : 'AI';
  const tested = fmtDateTime(view.last_tested_at);
  return (
    <div className={cn('rounded-3xl border p-5 shadow-sm', ok ? 'border-emerald-400/40 bg-emerald-400/[0.06]' : 'border-rose-400/40 bg-rose-400/[0.06]')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          {ok
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-300" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              {ok ? `Your ${name} key is connected` : `Your ${name} key isn't working`}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-foreground/65">
              {view.last4 && <code className="font-mono">••••{view.last4}</code>}
              {tested && <span>Checked {tested}</span>}
            </div>
            {!ok && view.last_error && (
              <p className="mt-1.5 text-xs text-rose-700 dark:text-rose-300">{view.last_error}</p>
            )}
            {!ok && (
              <p className="mt-1 text-xs text-foreground/70">AI features are paused until the key works again.</p>
            )}
          </div>
        </div>

        {isOwner && !editing && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRetest}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.04] disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', retesting && 'animate-spin')} /> Test
            </button>
            <button
              type="button"
              onClick={onChange}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.04] disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" /> Change key
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-400/10 disabled:opacity-50 dark:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** First day of next month, when the monthly AI credits reset. */
function resetDate(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** This month's AI credits: used vs the plan's allowance (bought packs included). */
function CreditsMeter({ isOwner }: { isOwner: boolean }) {
  const limitsQ = useQuery({
    queryKey: ['tenancy', 'limits'],
    queryFn: tenancyApi.getLimits,
    retry: 1,
    staleTime: 60_000,
  });
  const data = limitsQ.data;
  if (!data) return null;

  const used = data.usage.aiCallsThisMonth;
  const limit = data.limits.aiCallsPerMonth;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit == null || pct < 75 ? 'ok' : pct < 100 ? 'warn' : 'out';
  const fmt = (n: number) => n.toLocaleString('en-IN');

  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 flex-shrink-0 text-[hsl(var(--brand-blue))]" />
          <div>
            <div className="text-sm font-semibold text-foreground">AI credits this month</div>
            <p className="mt-0.5 text-xs text-foreground/65">
              {limit == null
                ? `${fmt(used)} used. Your plan has no monthly limit.`
                : `${fmt(used)} of ${fmt(limit)} used. Resets on ${resetDate()}.`}
            </p>
          </div>
        </div>
        {isOwner && limit != null && (
          <Link
            to="/billing"
            className="inline-flex flex-shrink-0 items-center rounded-full border border-foreground/10 bg-card px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.04]"
          >
            {tone === 'ok' ? 'Plans & credits' : 'Get more credits'}
          </Link>
        )}
      </div>
      {limit != null && (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                tone === 'ok' && 'bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
                tone === 'warn' && 'bg-amber-500',
                tone === 'out' && 'bg-rose-500',
              )}
              style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
            />
          </div>
          {tone === 'warn' && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">You've used {pct}% of this month's AI credits.</p>
          )}
          {tone === 'out' && (
            <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
              This month's AI credits are used up. AI features are paused until {resetDate()}{isOwner ? ' or until you add more credits.' : '.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
