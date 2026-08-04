import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, QrCode, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { connectionsApi } from '@/modules/workspace/api/connections';
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

function WhatsappCard() {
  const qc = useQueryClient();
  const [linking, setLinking] = useState(false);

  const statusQ = useQuery({
    queryKey: ['workspace', 'connections', 'whatsapp'],
    queryFn: connectionsApi.whatsappStatus,
    // Poll while a QR is on screen so we detect the scan; stop once linked.
    refetchInterval: (q) => (linking && q.state.data?.status !== 'connected' ? 4000 : false),
    staleTime: 0,
  });

  const status = statusQ.data?.status ?? 'disconnected';
  const connected = status === 'connected';
  const qr = statusQ.data?.qr ?? null;

  const connect = useMutation({
    mutationFn: connectionsApi.connectWhatsapp,
    onSuccess: (res) => {
      if (res.status === 'connected') { toast.success('WhatsApp already linked.'); setLinking(false); }
      else { setLinking(true); }
      qc.invalidateQueries({ queryKey: ['workspace', 'connections', 'whatsapp'] });
    },
    onError: (e) => toast.error((e as Error).message || 'Could not start WhatsApp linking.'),
  });

  const disconnect = useMutation({
    mutationFn: () => connectionsApi.disconnect('whatsapp'),
    onSuccess: () => { setLinking(false); toast.success('WhatsApp disconnected.'); qc.invalidateQueries({ queryKey: ['workspace', 'connections', 'whatsapp'] }); },
  });

  // Detected a successful scan mid-poll — stop the QR + celebrate, once.
  useEffect(() => {
    if (connected && linking) {
      setLinking(false);
      toast.success('WhatsApp linked! 🎉');
    }
  }, [connected, linking]);

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
              <StatusChip connected={connected} linking={linking && !connected} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/60">
              {connected && statusQ.data?.number
                ? <>Linked to <b className="text-foreground/80">+{statusQ.data.number}</b>{statusQ.data.profileName ? ` · ${statusQ.data.profileName}` : ''}.</>
                : 'Scan a QR with the practice WhatsApp to deliver notifications from your own number.'}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {!connected && (
            <button onClick={() => connect.mutate()} disabled={connect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md disabled:opacity-60">
              {connect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              {linking ? 'Refresh QR' : 'Connect'}
            </button>
          )}
          {(connected || linking) && (
            <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/[0.06] px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-400/10 disabled:opacity-60 dark:text-rose-300">
              <Trash2 className="h-3 w-3" /> Disconnect
            </button>
          )}
        </div>
      </div>

      {/* QR + instructions while linking */}
      {linking && !connected && (
        <div className="mt-4 flex flex-col items-center gap-4 border-t border-foreground/[0.06] pt-4 sm:flex-row sm:items-center">
          <div className="grid h-44 w-44 flex-shrink-0 place-items-center rounded-2xl border border-foreground/10 bg-white p-2">
            {qr ? (
              <img src={qr} alt="WhatsApp QR code" className="h-full w-full object-contain" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
            )}
          </div>
          <ol className="space-y-1.5 text-xs text-foreground/70">
            <li className="flex items-center gap-2"><Smartphone className="h-3.5 w-3.5 text-emerald-600" /> Open <b>WhatsApp</b> on the practice phone</li>
            <li>2. Tap <b>⋮ / Settings → Linked devices</b></li>
            <li>3. Tap <b>Link a device</b> and scan this code</li>
            <li className="flex items-center gap-1.5 pt-1 text-foreground/50"><Loader2 className="h-3 w-3 animate-spin" /> Waiting for scan… (the code refreshes automatically)</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function StatusChip({ connected, linking }: { connected: boolean; linking: boolean }) {
  const [label, chip, dot] = connected
    ? ['Connected', 'border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200', 'bg-emerald-400']
    : linking
      ? ['Waiting for scan', 'border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-200', 'bg-amber-400']
      : ['Not connected', 'border-foreground/15 bg-foreground/[0.04] text-foreground/70', 'bg-foreground/40'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]', chip)}>
      <span className={cn('h-1 w-1 rounded-full', dot)} /> {label}
    </span>
  );
}
