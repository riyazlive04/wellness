import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, MessageCircle, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { connectionsApi } from '@/modules/workspace/api/connections';
import { notificationPreferencesApi } from '@/modules/workspace/notifications/api/preferences';
import { cn } from '@/lib/utils';

/**
 * Per-workspace notification channels. Email was removed (per-domain DNS
 * verification wasn't worth the friction). WhatsApp is live: each practice
 * links its OWN number by scanning a QR — powered by a shared Evolution
 * gateway, one instance per workspace. Staff also get in-app + browser push.
 */
export function ConnectionsPanel() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Your notification channels</h3>
        <p className="mt-0.5 text-xs text-foreground/60">
          Staff get in-app + browser push out of the box. Link this practice's own WhatsApp number to also deliver urgent notifications there.
        </p>
      </div>
      <WhatsappCard />
    </div>
  );
}

/**
 * WhatsApp is set up by the NUSI team, not by the practice: the gateway, the
 * number and the approved message templates are ours to run. This card shows
 * the state and lets a linked practice test it, but offers no connect path -
 * a QR here would hand the practice a dead end they cannot finish.
 */
function WhatsappCard() {
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['workspace', 'connections', 'whatsapp'],
    queryFn: connectionsApi.whatsappStatus,
    // No polling: it polled to catch a QR scan, and there is no QR any more.
    // The endpoint asks the gateway for a fresh code as a side effect, so
    // polling it with nothing on screen is load for no reason.
    staleTime: 60_000,
  });

  const status = statusQ.data?.status ?? 'disconnected';
  const connected = status === 'connected';

  const disconnect = useMutation({
    mutationFn: () => connectionsApi.disconnect('whatsapp'),
    onSuccess: () => { toast.success('WhatsApp disconnected.'); qc.invalidateQueries({ queryKey: ['workspace', 'connections', 'whatsapp'] }); },
  });

  const notifyClients = useMutation({
    mutationFn: (enabled: boolean) => connectionsApi.setNotifyClients(enabled),
    onSuccess: (_res, enabled) => {
      toast.success(enabled ? 'Clients will get reminders on WhatsApp.' : 'Client WhatsApp reminders turned off.');
      qc.invalidateQueries({ queryKey: ['workspace', 'connections', 'whatsapp'] });
    },
    onError: (e) => toast.error((e as Error).message || 'Could not save. Please try again.'),
  });
  const clientsOn = notifyClients.isPending ? !!notifyClients.variables : !!statusQ.data?.notify_clients;

  const test = useMutation({
    mutationFn: () => notificationPreferencesApi.sendTest(['whatsapp']),
    onSuccess: (res) => {
      const r = res.whatsapp;
      if (!r) return;
      if (r.ok) toast.success(`WhatsApp: ${r.reason}`);
      else toast.error(`WhatsApp: ${r.reason}`);
    },
    onError: () => toast.error("Couldn't send the test."),
  });

  return (
    <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-emerald-400/5 text-emerald-700 dark:text-emerald-200">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">WhatsApp</span>
              <StatusChip status={status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              {connected && statusQ.data?.number
                ? <>Linked to <b className="text-foreground/80">+{statusQ.data.number}</b>{statusQ.data.profileName ? ` · ${statusQ.data.profileName}` : ''}.</>
                : 'Notifications and reminders delivered from a WhatsApp number for your practice.'}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {connected && (
            <button onClick={() => test.mutate()} disabled={test.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/85 hover:bg-foreground/[0.06] disabled:opacity-60">
              {test.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Send test
            </button>
          )}
          {/* No self-serve connect: the gateway, the number and the message
              templates are NUSI's to run, so a practice cannot finish this
              alone. A button here would hand them a QR and a dead end. */}
          {!connected && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/55">
              <Lock className="h-3 w-3" /> NUSI managed
            </span>
          )}
          {connected && (
            <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-400/10 disabled:opacity-60 dark:text-rose-300">
              <Trash2 className="h-3 w-3" /> Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Client reminders go out from the practice's own number - opt-in. */}
      {connected && (
        <label
          htmlFor="wa-notify-clients"
          className="mt-4 flex cursor-pointer items-start justify-between gap-4 border-t border-foreground/[0.06] pt-4"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Send client reminders on WhatsApp</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-foreground/60">
              Appointment reminders, bookings and changes, and new meal plans go to your clients from this number.
              Clients can switch WhatsApp off in their own settings.
            </span>
          </span>
          <input
            id="wa-notify-clients"
            type="checkbox"
            role="switch"
            checked={clientsOn}
            disabled={notifyClients.isPending}
            onChange={(e) => notifyClients.mutate(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              'relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50',
              clientsOn ? 'bg-emerald-600' : 'bg-foreground/20',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                clientsOn ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </span>
        </label>
      )}

      {/* What to do instead, since there is no self-serve path. */}
      {!connected && (
        <p className="mt-4 border-t border-foreground/[0.06] pt-3.5 text-xs leading-relaxed text-foreground/60">
          WhatsApp is set up by the NUSI team. If you want WhatsApp
          notifications for your practice, contact the NUSI team and we will
          enable it for you.
        </p>
      )}
    </div>
  );
}

/** The server's own status, not a local flag - the practice changes nothing here. */
function StatusChip({ status }: { status: string }) {
  const [label, chip, dot] =
    status === 'connected'
      ? ['Connected', 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200', 'bg-emerald-400']
      : status === 'pending'
        ? ['Setup pending', 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200', 'bg-amber-400']
        : status === 'error'
          ? ['Needs attention', 'border-rose-400/40 bg-rose-400/10 text-rose-700 dark:text-rose-200', 'bg-rose-400']
          : ['Not connected', 'border-foreground/15 bg-foreground/[0.04] text-foreground/70', 'bg-foreground/40'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', chip)}>
      <span className={cn('h-1 w-1 rounded-full', dot)} /> {label}
    </span>
  );
}
