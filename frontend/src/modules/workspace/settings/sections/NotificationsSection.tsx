import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { usePushSubscription } from '@/hooks/usePushSubscription';
import { workspacesApi } from '@/modules/workspace/api/workspaces';
import { cn } from '@/lib/utils';
import { SectionHeader } from './GeneralSection';

/**
 * Settings → Notifications. Browser push for this device: new clients, join
 * requests, bookings and messages arrive as notifications even when NUSI
 * isn't open. Push is per device, so each computer or phone is turned on here.
 */
export function NotificationsSection() {
  const { status, busy, subscribe, unsubscribe } = usePushSubscription(workspacesApi);

  const turnOn = async () => {
    try {
      await subscribe();
      toast.success('Notifications are on for this device.');
    } catch (err) {
      toast.error((err as Error).message || 'Could not turn on notifications.');
    }
  };
  const turnOff = async () => {
    try {
      await unsubscribe();
      toast.success('Notifications are off for this device.');
    } catch (err) {
      toast.error((err as Error).message || 'Could not turn off notifications.');
    }
  };

  const on = status === 'subscribed';
  return (
    <SectionHeader
      title="Notifications"
      subtitle="Get a notification on this device when something needs you: a new client or join request, a booking, a message or an answered assessment."
    >
      <div className="rounded-3xl border border-foreground/[0.06] bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <span className={cn(
            'grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl',
            on ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : status === 'denied' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-[hsl(var(--brand-blue)_/_0.12)] text-[hsl(var(--brand-blue))]',
          )}>
            {on ? <BellRing className="h-5 w-5" /> : status === 'denied' ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold">Browser notifications on this device</h3>
            <p className="mt-1 text-xs text-foreground/65">
              {status === 'unsupported'
                ? "This browser can't show notifications. Try Chrome, Edge or Firefox, or install NUSI on your phone."
                : status === 'denied'
                  ? "Notifications are blocked for nusi.in in this browser. Click the lock icon next to the address bar, allow Notifications, then reload this page."
                  : on
                    ? 'On. You will be notified on this device even when NUSI is closed.'
                    : 'Off. Turn on to be notified on this device. Do this on each computer or phone you use.'}
            </p>
          </div>
          {(status === 'idle' || on) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (on ? turnOff() : turnOn())}
              className={cn(
                'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60',
                on
                  ? 'border border-foreground/10 text-foreground/75 hover:bg-foreground/[0.04]'
                  : 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-md hover:brightness-110',
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              {on ? 'Turn off' : 'Turn on'}
            </button>
          )}
          {status === 'loading' && <Loader2 className="mt-1 h-4 w-4 animate-spin text-foreground/40" />}
        </div>
      </div>
    </SectionHeader>
  );
}
