import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

/**
 * StaffPushToggle — lets a workspace owner / nutritionist enable browser push
 * on the current device. Reuses usePushSubscription with the workspace push
 * adapter (subscriptions are keyed by user_id + workspace_id, no client row).
 *
 * Once enabled, the NotificationHandler delivers high-signal workspace events
 * (new client, new appointment, new recipe, invite) to this device.
 */
export function StaffPushToggle() {
  const { status, busy, subscribe, unsubscribe } = usePushSubscription(workspacesApi);

  if (status === 'loading' || status === 'unsupported') {
    // Nothing actionable — hide rather than show a dead control. (Unsupported
    // browsers don't have the Push API at all.)
    return null;
  }

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
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/[0.06] px-3 py-1.5 text-xs text-amber-400"
        title="You blocked notifications for this site. Re-enable them in your browser's site settings."
      >
        <BellOff className="h-3 w-3" />
        Push blocked
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
          'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-1.5 text-xs text-emerald-400 transition-colors hover:border-emerald-500/50',
          busy && 'opacity-60',
        )}
        title="Push notifications are on for this device - click to turn off"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
        Push on
      </button>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={() => void onSubscribe()}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-foreground/[0.08] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]',
        busy && 'opacity-60',
      )}
      title="Get browser notifications for new clients, appointments, and recipes"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
      Enable push
    </button>
  );
}
