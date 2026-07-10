import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { usePushSubscription, type PushApiAdapter } from '@/hooks/usePushSubscription';

/**
 * PushToggle — role-agnostic "enable browser push on this device" pill. Give it
 * any PushApiAdapter (client / staff / admin) and it drives the shared
 * usePushSubscription machinery. Hidden on unsupported browsers.
 */
export function PushToggle({ adapter, hint }: { adapter: PushApiAdapter; hint?: string }) {
  const { status, busy, subscribe, unsubscribe } = usePushSubscription(adapter);

  if (status === 'loading' || status === 'unsupported') return null;

  const onSubscribe = async () => {
    try {
      await subscribe();
      toast.success('Push notifications enabled on this device');
    } catch (err) {
      toast.error((err as Error).message || 'Could not enable push notifications');
    }
  };
  const onUnsubscribe = async () => {
    try {
      await unsubscribe();
      toast.success('Push notifications disabled on this device');
    } catch (err) {
      toast.error((err as Error).message || 'Could not disable push notifications');
    }
  };

  if (status === 'denied') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-500"
        title="You blocked notifications for this site. Re-enable them in your browser's site settings."
      >
        <BellOff className="h-3 w-3" /> Push blocked
      </span>
    );
  }

  if (status === 'subscribed') {
    return (
      <button
        type="button"
        onClick={() => void onUnsubscribe()}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-1.5 text-xs text-emerald-500 transition-colors hover:border-emerald-500/50',
          busy && 'opacity-60',
        )}
        title="Push notifications are on for this device — click to turn off"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />} Push on
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onSubscribe()}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
        busy && 'opacity-60',
      )}
      title={hint || 'Get browser notifications on this device'}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />} Enable push
    </button>
  );
}
