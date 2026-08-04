import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Mail, MessageCircle, Send, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { connectionsApi, type ConnectionStatus, type ConnectionView } from '@/modules/workspace/api/connections';
import { cn } from '@/lib/utils';

const STATUS: Record<ConnectionStatus, { label: string; chip: string; dot: string }> = {
  connected:    { label: 'Connected',    chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200', dot: 'bg-emerald-400' },
  pending:      { label: 'Verifying',    chip: 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200',       dot: 'bg-amber-400' },
  error:        { label: 'Error',        chip: 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200',           dot: 'bg-rose-400' },
  disconnected: { label: 'Not connected',chip: 'border-foreground/15 bg-foreground/[0.04] text-foreground/70',                 dot: 'bg-foreground/40' },
};

/**
 * Per-workspace notification channels — each practice connects its OWN email
 * sender (and, soon, WhatsApp number). Unlike the platform integrations below,
 * these are configured here and stored (encrypted) per workspace.
 */
export function ConnectionsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace', 'connections'],
    queryFn: connectionsApi.list,
    staleTime: 30_000,
  });

  const email = data?.find((c) => c.channel === 'email');
  const whatsapp = data?.find((c) => c.channel === 'whatsapp');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['workspace', 'connections'] });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Your notification channels</h3>
        <p className="mt-0.5 text-xs text-foreground/60">
          Connect this practice's own email sender so staff notifications are delivered. Credentials are encrypted and never leave the server.
        </p>
      </div>

      {isLoading ? (
        <div className="h-[120px] animate-pulse rounded-3xl border border-foreground/[0.06] bg-card shadow-sm" />
      ) : (
        <EmailCard view={email} onChanged={invalidate} />
      )}

      <WhatsappCard view={whatsapp} />
    </div>
  );
}

function EmailCard({ view, onChanged }: { view?: ConnectionView; onChanged: () => void }) {
  const status = view?.status ?? 'disconnected';
  const s = STATUS[status];
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');

  const save = useMutation({
    mutationFn: () => connectionsApi.saveEmail({ apiKey: apiKey.trim(), fromEmail: fromEmail.trim(), fromName: fromName.trim() || undefined }),
    onSuccess: (res) => {
      onChanged();
      if (res.test.ok) {
        toast.success('Email connected — a verification message was sent to you.');
        setOpen(false);
        setApiKey('');
      } else {
        toast.error(`Saved, but the test failed: ${res.test.error ?? 'unknown error'}`);
      }
    },
    onError: (e) => toast.error((e as Error).message || 'Could not save the email connection.'),
  });

  const test = useMutation({
    mutationFn: connectionsApi.testEmail,
    onSuccess: (r) => { onChanged(); r.ok ? toast.success('Test email sent to you.') : toast.error(`Test failed: ${r.error ?? 'unknown'}`); },
    onError: () => toast.error('Could not send the test.'),
  });

  const disconnect = useMutation({
    mutationFn: () => connectionsApi.disconnect('email'),
    onSuccess: () => { onChanged(); toast.success('Email disconnected.'); },
  });

  const canSave = apiKey.trim().length >= 8 && /\S+@\S+\.\S+/.test(fromEmail.trim());

  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-400/25 to-blue-400/5 text-blue-700 dark:text-blue-200">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">Email</span>
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', s.chip)}>
                <span className={cn('h-1 w-1 rounded-full', s.dot)} /> {s.label}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              {status === 'connected' && view?.identity
                ? <>Sending from <b className="text-foreground/80">{view.identity}</b>.</>
                : 'Bring your own Resend account — paste an API key and a verified from-address.'}
            </p>
            {status === 'error' && view?.last_error && (
              <p className="mt-1 flex items-start gap-1 text-xs text-rose-600 dark:text-rose-300">
                <TriangleAlert className="mt-0.5 h-3 w-3 flex-shrink-0" /> {view.last_error}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {status === 'connected' && (
            <button onClick={() => test.mutate()} disabled={test.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06] disabled:opacity-60">
              {test.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send test
            </button>
          )}
          <button onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06]">
            {view?.has_secret ? 'Update' : 'Connect'}
          </button>
          {view?.has_secret && (
            <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-400/10 disabled:opacity-60 dark:text-rose-300">
              <Trash2 className="h-3 w-3" /> Disconnect
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-foreground/[0.06] pt-4">
          <Field label="Resend API key" hint="Starts with re_… — from resend.com → API Keys">
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
              placeholder="re_xxxxxxxxxxxxxxxx"
              className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/25" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From address" hint="Must be on a domain you've verified in Resend">
              <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)}
                placeholder="care@yourpractice.com"
                className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/25" />
            </Field>
            <Field label="From name (optional)">
              <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Practice"
                className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/25" />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => save.mutate()} disabled={!canSave || save.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-xs font-semibold text-white shadow-md disabled:opacity-50">
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save & verify
            </button>
            <span className="text-[11px] text-foreground/50">We'll send a test to your account email to confirm it works.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsappCard({ view }: { view?: ConnectionView }) {
  const status = view?.status ?? 'disconnected';
  const s = STATUS[status];
  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm opacity-90">
      <div className="flex items-start gap-4">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-400/5 text-emerald-700 dark:text-emerald-200">
          <MessageCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">WhatsApp</span>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', s.chip)}>
              <span className={cn('h-1 w-1 rounded-full', s.dot)} /> {s.label}
            </span>
            <span className="rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/60">Coming soon</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">
            Connect this practice's own WhatsApp number by scanning a QR code. We're standing up the WhatsApp gateway — this will light up shortly.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-foreground/50">{hint}</span>}
    </label>
  );
}
