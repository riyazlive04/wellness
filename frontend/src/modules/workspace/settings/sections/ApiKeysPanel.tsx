import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Loader2, Lock, Plus, Trash2, Terminal } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { apiKeysApi, type CreatedApiKey } from '@/modules/workspace/api/apiKeys';
import { useScope } from '@/hooks/useScope';
import { featuresOf } from '@/lib/planCapabilities';
import { cn } from '@/lib/utils';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function ApiKeysPanel() {
  const { data: scope } = useScope();
  const canApi = featuresOf(scope).includes('api_access');
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [justCreated, setJustCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  const keysQ = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
    enabled: canApi,
    retry: 1,
  });

  const createMut = useMutation({
    mutationFn: () => apiKeysApi.create(name.trim() || 'API key'),
    onSuccess: (key) => {
      setJustCreated(key);
      setName('');
      setCopied(false);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create key.'),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      toast.success('API key revoked.');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not revoke key.'),
  });

  const copyKey = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.key);
      setCopied(true);
      toast.success('Key copied to clipboard.');
    } catch {
      toast.error('Copy failed — select and copy manually.');
    }
  };

  // ── Locked (below Scale Pro) ──────────────────────────────────────────
  if (!canApi) {
    return (
      <Glass className="mt-6 flex flex-col items-center gap-3 p-8 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-300">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center justify-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-foreground/55" /> API access
          </div>
          <p className="mx-auto mt-1 max-w-md text-xs text-foreground/60">
            Programmatic access to your workspace data via REST API keys is part of{' '}
            <span className="font-medium">Scale Pro</span>. Upgrade to create keys and integrate with
            your own tools.
          </p>
        </div>
        <a
          href="/billing"
          className="rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-purple-700"
        >
          Upgrade to Scale Pro
        </a>
      </Glass>
    );
  }

  // ── Enabled ───────────────────────────────────────────────────────────
  const keys = keysQ.data ?? [];
  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-foreground/60" />
        <h3 className="text-sm font-semibold">API keys</h3>
      </div>
      <p className="text-xs text-foreground/60">
        Authenticate REST calls to <code className="rounded bg-foreground/[0.06] px-1 py-0.5">/api/v1/public/*</code>{' '}
        with a key. Send it as the <code className="rounded bg-foreground/[0.06] px-1 py-0.5">X-API-Key</code> header.
        A key is shown in full only once — store it securely.
      </p>

      {/* Create */}
      <Glass className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. Zapier, Internal dashboard)"
            maxLength={80}
            className="w-full rounded-xl border border-foreground/10 bg-transparent px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-teal-500/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create key
          </button>
        </div>

        {/* Show-once secret */}
        {justCreated && (
          <div className="mt-3 rounded-xl border border-emerald-400/40 bg-emerald-400/[0.06] p-3">
            <div className="mb-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              Copy your key now — it won't be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-foreground/[0.06] px-2.5 py-2 font-mono text-xs">
                {justCreated.key}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-foreground/10 px-2.5 py-2 text-xs hover:bg-foreground/[0.04]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-foreground/60">
              <Terminal className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <code className="min-w-0 break-all">
                curl -H "X-API-Key: {justCreated.key.slice(0, 14)}…" https://nusi.sirahagents.com/api/v1/public/clients
              </code>
            </div>
          </div>
        )}
      </Glass>

      {/* List */}
      <Glass className="overflow-hidden">
        {keysQ.isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-sm text-foreground/55">No API keys yet.</div>
        ) : (
          <ul className="divide-y divide-foreground/[0.05]">
            {keys.map((k) => {
              const revoked = !!k.revoked_at;
              return (
                <li key={k.id} className={cn('flex items-center justify-between gap-3 px-4 py-3', revoked && 'opacity-55')}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{k.name}</span>
                      {revoked && (
                        <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">
                          Revoked
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-foreground/55">
                      <code className="font-mono">{k.key_prefix}</code>
                      <span>Created {fmtDate(k.created_at)}</span>
                      <span>Last used {fmtDate(k.last_used_at)}</span>
                    </div>
                  </div>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Revoke "${k.name}"? Any integration using it will stop working immediately.`)) {
                          revokeMut.mutate(k.id);
                        }
                      }}
                      disabled={revokeMut.isPending}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1.5 text-xs text-rose-700 transition-colors hover:bg-rose-400/10 disabled:opacity-50 dark:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Glass>
    </div>
  );
}
