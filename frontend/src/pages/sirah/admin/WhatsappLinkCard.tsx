import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';

import { Glass } from '@/design-system';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Link state of NUSI's own WhatsApp number — the one that sends landing-page
 * lead confirmations — with a QR flow to link it from the admin area, so nobody
 * needs server access to connect (or re-connect) the phone.
 *
 * Until it is linked, leads are still saved; they simply get no WhatsApp.
 */

interface PlatformStatus {
  configured: boolean;
  name: string | null;
  connected: boolean;
  loggedIn: boolean;
  number: string | null;
}

/** WhatsApp QR codes expire quickly; fetch a fresh one on this cadence. */
const QR_REFRESH_MS = 25_000;

export function WhatsappLinkCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: status, isLoading } = useQuery<PlatformStatus>({
    queryKey: ['admin', 'whatsapp', 'platform'],
    queryFn: () => api.get<PlatformStatus>('/api/v1/admin/whatsapp/platform'),
    // While the QR is on screen, watch for the scan to land.
    refetchInterval: open ? 3000 : false,
  });

  const linked = !!status?.loggedIn;

  useEffect(() => {
    if (open && linked) {
      const t = setTimeout(() => setOpen(false), 1500);
      return () => clearTimeout(t);
    }
  }, [open, linked]);

  return (
    <>
      <Glass className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={cn(
            'grid h-9 w-9 place-items-center rounded-lg',
            linked
              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
          )}
        >
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">WhatsApp confirmations</div>
          <div className="text-xs text-foreground/60">
            {isLoading
              ? 'Checking…'
              : !status?.configured
                ? 'Not set up on the server yet.'
                : linked
                  ? `Linked${status.number ? ` · +${status.number}` : ''} - every new lead gets a WhatsApp.`
                  : 'Not linked - leads are saved, but no WhatsApp is sent yet.'}
          </div>
        </div>
        {status?.configured && !linked && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            Link WhatsApp
          </button>
        )}
      </Glass>

      {open && (
        <QrDialog
          linked={linked}
          onClose={() => {
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp', 'platform'] });
          }}
        />
      )}
    </>
  );
}

function QrDialog({ linked, onClose }: { linked: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function loadQr() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.post<{ base64: string | null }>('/api/v1/admin/whatsapp/platform/qr');
      setQr(res?.base64 ?? null);
      setFailed(!res?.base64);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (linked) return;
    void loadQr();
    const t = setInterval(() => void loadQr(), QR_REFRESH_MS);
    return () => clearInterval(t);
  }, [linked]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Link NUSI WhatsApp"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <Glass variant="heavy" className="relative p-6 text-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1.5 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          {linked ? (
            <div className="py-6">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <div className="mt-3 text-lg font-semibold text-foreground">WhatsApp linked</div>
              <p className="mt-1 text-sm text-foreground/60">New leads will now get a confirmation.</p>
            </div>
          ) : (
            <>
              <div className="text-lg font-semibold text-foreground">Link NUSI WhatsApp</div>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-foreground/60">
                On the phone for NUSI's number: WhatsApp → Settings → Linked devices → Link a device,
                then scan this code. It refreshes by itself.
              </p>
              <div className="mx-auto mt-5 grid h-64 w-64 place-items-center rounded-xl bg-white p-3">
                {qr ? (
                  <img src={qr} alt="WhatsApp link QR code" className="h-full w-full" />
                ) : loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
                ) : (
                  <span className="px-4 text-xs text-gray-500">Could not get a QR code.</span>
                )}
              </div>
              {failed && !loading && (
                <button
                  type="button"
                  onClick={() => void loadQr()}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/75 hover:bg-foreground/[0.04]"
                >
                  <RefreshCw className="h-4 w-4" /> Try again
                </button>
              )}
            </>
          )}
        </Glass>
      </div>
    </div>
  );
}
