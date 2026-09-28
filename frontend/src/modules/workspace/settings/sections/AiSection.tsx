import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { aiKeyApi, type AiKeyView, type AiProvider } from '@/modules/workspace/api/aiKey';
import { useScope } from '@/hooks/useScope';
import { SectionHeader } from './GeneralSection';
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
 * Settings -> AI. Each practice brings its own Gemini or OpenAI key; every AI
 * feature (assistant, plate scanner, voice notes, AI meal plans) runs on it.
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
      toast.success(`${PROVIDERS[provider].name} key connected. AI features are on.`);
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
      toast.success('AI key removed. AI features are off until a new key is added.');
      qc.invalidateQueries({ queryKey: ['workspace', 'ai-key'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not remove the key.'),
  });

  const startEdit = () => {
    setProvider(view?.provider ?? 'gemini');
    setKey('');
    setEditing(true);
  };

  const showForm = isOwner && (!hasKey || editing);
  const tooShort = key.trim().length < 20;

  return (
    <SectionHeader
      title="AI"
      subtitle="Your practice's AI runs on your own Google Gemini or OpenAI key. The AI assistant, plate scanner, voice notes and AI meal plans all use it."
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
          isOwner={isOwner}
          busy={retest.isPending || remove.isPending}
          onChange={startEdit}
          onRetest={() => retest.mutate()}
          onRemove={() => {
            if (confirm('Remove this AI key? The AI assistant, plate scanner, voice notes and AI meal plans will stop working until you add a new key.')) {
              remove.mutate();
            }
          }}
          retesting={retest.isPending}
          editing={editing}
        />
      )}

      {/* Add / replace */}
      {showForm && !keyQ.isLoading && (
        <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">{hasKey ? 'Replace your AI key' : 'Add your AI key'}</h3>

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
            {hasKey && (
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

      {/* How it works */}
      <div className="rounded-3xl border border-foreground/[0.06] bg-foreground/[0.02] p-5 text-xs leading-relaxed text-foreground/70">
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> How your key is used
        </div>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your key is encrypted before it's stored. Nobody can see it again, not even your team. We only show the last 4 characters.</li>
          <li>AI requests for your practice go to your provider, and they bill you directly for usage.</li>
          <li>Your plan's monthly AI credits still apply. Each AI action uses one credit.</li>
          <li>Without a key, AI features are off. Weekly summaries and plate insights fall back to simple templates.</li>
        </ul>
      </div>
    </SectionHeader>
  );
}

function StatusCard({
  view, isOwner, busy, retesting, editing, onChange, onRetest, onRemove,
}: {
  view: AiKeyView;
  isOwner: boolean;
  busy: boolean;
  retesting: boolean;
  editing: boolean;
  onChange: () => void;
  onRetest: () => void;
  onRemove: () => void;
}) {
  if (view.status === 'missing') {
    return (
      <div className="flex items-start gap-3 rounded-3xl border border-amber-400/40 bg-amber-400/[0.07] p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
        <div>
          <div className="text-sm font-semibold text-foreground">AI is off for your practice</div>
          <p className="mt-0.5 text-xs text-foreground/70">
            {isOwner
              ? 'Add a Google Gemini or OpenAI key below to turn on the AI assistant, plate scanner, voice notes and AI meal plans.'
              : 'Ask your practice owner to add an AI key in Settings -> AI.'}
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
              {ok ? `${name} connected` : `${name} key isn't working`}
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
