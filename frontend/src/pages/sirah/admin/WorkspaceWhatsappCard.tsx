import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, Loader2, MessageCircle, RefreshCw, Smartphone, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { ApiError } from '@/lib/api';
import { adminApi } from '@/modules/super-admin/api/admin';
import { cn } from '@/lib/utils';

/** WhatsApp QR codes expire quickly; fetch a fresh one on this cadence. */
const QR_REFRESH_MS = 20_000;

/**
 * Link a practice's WhatsApp number for them.
 *
 * Practices have no self-serve path: the gateway, the number and the approved
 * templates are NUSI's to run, and their Settings screen now says to contact
 * us. This is where "contact us" is answered - without it, nobody could
 * connect the channel at all.
 *
 * Scanning is done on the practice's own phone, so this is usually a call:
 * open the practice, hit Start linking, share the code, wait for the tick.
 */
export function WorkspaceWhatsappCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [linking, setLinking] = useState(false);

  const statusQ = useQuery({
    queryKey: ['admin', 'workspace-whatsapp', workspaceId],
    queryFn: () => adminApi.workspaceWhatsappStatus(workspaceId),
    // Poll only while a QR is on screen: the endpoint asks the gateway for a
    // fresh code as a side effect, so idle polling is load for nothing.
    refetchInterval: linking ? 3000 : false,
    staleTime: linking ? 0 : 60_000,
  });

  const status = statusQ.data?.status ?? 'disconnected';
  const connected = status === 'connected';
  const number = statusQ.data?.number ?? null;
  const qr = statusQ.data?.qr ?? null;
  // Every practice is on NUSI's sender until someone moves them off it.
  const sender = statusQ.data?.sender ?? 'platform';
  const ownNumber = sender === 'own';

  const setSender = useMutation({
    mutationFn: (next: 'platform' | 'own') => adminApi.workspaceWhatsappSender(workspaceId, next),
    onSuccess: (_r, next) => {
      setLinking(false);
      toast.success(next === 'own'
        ? "Switched to the practice's own number. Link it below."
        : "Switched to NUSI's number.");
      qc.invalidateQueries({ queryKey: ['admin', 'workspace-whatsapp', workspaceId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not change the sender.'),
  });

  const connect = useMutation({
    mutationFn: () => adminApi.workspaceWhatsappConnect(workspaceId),
    onSuccess: (r) => {
      if (r.status === 'connected') {
        setLinking(false);
        toast.success('Already linked.');
      } else {
        setLinking(true);
      }
      qc.invalidateQueries({ queryKey: ['admin', 'workspace-whatsapp', workspaceId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not start linking.'),
  });

  const disconnect = useMutation({
    mutationFn: () => adminApi.workspaceWhatsappDisconnect(workspaceId),
    onSuccess: () => {
      setLinking(false);
      toast.success('WhatsApp unlinked.');
      qc.invalidateQueries({ queryKey: ['admin', 'workspace-whatsapp', workspaceId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not unlink.'),
  });

  // The scan landed while polling: stop the QR and say so, once.
  useEffect(() => {
    if (connected && linking) {
      setLinking(false);
      toast.success('WhatsApp linked.');
    }
  }, [connected, linking]);

  // A QR expires in well under a minute. Ask for a new one while waiting.
  useEffect(() => {
    if (!linking || connected) return;
    const t = window.setInterval(() => connect.mutate(), QR_REFRESH_MS);
    return () => window.clearInterval(t);
    // connect.mutate is stable for the life of the mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking, connected]);

  return (
    <Glass className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-3">
        <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
          WhatsApp
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]',
            connected
              ? 'border-teal-400/40 bg-teal-400/10 text-teal-700 dark:text-teal-200'
              : status === 'pending'
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200'
                : 'border-foreground/15 bg-foreground/[0.04] text-foreground/60',
          )}
        >
          <span className={cn('h-1 w-1 rounded-full', connected ? 'bg-teal-400' : status === 'pending' ? 'bg-amber-400' : 'bg-foreground/40')} />
          {connected ? 'Linked' : status === 'pending' ? 'Setup pending' : 'Not linked'}
        </span>
      </div>

      {/* Which number this practice sends from. Wasi needs no linking - it is
          NUSI's own Meta sender - so the QR only belongs on the 'own' path. */}
      <div className="grid gap-2 border-b border-foreground/[0.06] px-5 py-4 sm:grid-cols-2">
        <SenderOption
          active={!ownNumber}
          busy={setSender.isPending}
          onClick={() => !ownNumber || setSender.mutate('platform')}
          icon={Building2}
          title="NUSI's number"
          detail="Official WhatsApp (Wasi). Works now, nothing to link."
        />
        <SenderOption
          active={ownNumber}
          busy={setSender.isPending}
          onClick={() => ownNumber || setSender.mutate('own')}
          icon={Smartphone}
          title="Their own number"
          detail="Evolution GO. Needs a QR scan on the practice's phone."
        />
      </div>

      <div className="px-5 py-4">
        {statusQ.isLoading ? (
          <div className="grid place-items-center py-6"><Loader2 className="h-4 w-4 animate-spin text-foreground/40" /></div>
        ) : !ownNumber ? (
          <div className="flex items-start gap-3 text-[12px] text-foreground/65">
            <CheckCircle2 className="mt-px h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-300" />
            <div>
              Messages go out from NUSI&apos;s official WhatsApp number.
              {connected && (
                <> Their own number is still linked{number ? <> (<b>+{number}</b>)</> : null} but is not being used.</>
              )}
            </div>
          </div>
        ) : connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-300" />
            <div className="min-w-0 flex-1 text-sm">
              {number ? <>Linked to <b>+{number}</b>.</> : 'Linked.'}
              <div className="text-[11px] text-foreground/55">
                This practice can now pick WhatsApp per event in their Notifications.
              </div>
            </div>
            <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-400/10 disabled:opacity-50 dark:text-rose-300">
              {disconnect.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
              Unlink
            </button>
          </div>
        ) : linking ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="grid h-40 w-40 flex-shrink-0 place-items-center rounded-2xl border border-foreground/10 bg-white p-2">
              {qr ? <img src={qr} alt="WhatsApp QR code" className="h-full w-full object-contain" />
                  : <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />}
            </div>
            <ol className="space-y-1.5 text-xs text-foreground/70">
              <li className="flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5 flex-shrink-0 text-teal-600 dark:text-teal-300" />
                On the <b>practice&apos;s</b> phone: open WhatsApp
              </li>
              <li>2. Tap <b>⋮ / Settings → Linked devices</b></li>
              <li>3. Tap <b>Link a device</b> and scan this code</li>
              <li className="flex items-center gap-1.5 pt-1 text-foreground/50">
                <Loader2 className="h-3 w-3 animate-spin" /> Waiting for the scan… the code refreshes itself
              </li>
              <li className="pt-1">
                <button type="button" onClick={() => setLinking(false)}
                  className="text-[11px] text-foreground/50 underline hover:text-foreground/80">
                  Cancel
                </button>
              </li>
            </ol>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-[12px] text-foreground/65">
              {status === 'pending'
                ? 'Linking was started but never finished — the code was not scanned. Start again to get a fresh one.'
                : 'Their number is not linked yet, so nothing goes out on WhatsApp until it is.'}
            </div>
            <button type="button" onClick={() => connect.mutate()} disabled={connect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-teal-50 hover:bg-teal-800 disabled:opacity-50">
              {connect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {status === 'pending' ? 'Start again' : 'Start linking'}
            </button>
          </div>
        )}
      </div>
    </Glass>
  );
}

function SenderOption({
  active, busy, onClick, icon: Icon, title, detail,
}: {
  active: boolean; busy: boolean; onClick: () => void;
  icon: typeof Building2; title: string; detail: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60',
        active
          ? 'border-teal-400/50 bg-teal-400/[0.08]'
          : 'border-foreground/10 hover:bg-foreground/[0.03]',
      )}>
      <Icon className={cn('mt-px h-4 w-4 flex-shrink-0', active ? 'text-teal-700 dark:text-teal-300' : 'text-foreground/40')} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          {title}
          {active && <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" />}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-foreground/55">{detail}</span>
      </span>
    </button>
  );
}
