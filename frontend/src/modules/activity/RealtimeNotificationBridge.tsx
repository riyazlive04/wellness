import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtime } from '@/lib/realtime';

/**
 * RealtimeNotificationBridge — mounted once near the app root, listens for
 * Realtime 'notification' events, shows a sonner toast, AND refreshes the
 * notification bell so the unread badge updates live instead of waiting on the
 * 60s poll.
 *
 * The backend only emits notifications for an allow-list of high-signal
 * events (recipe.create / client.create / invite.create / appointment.create
 * / program.create), so this won't spam the user with every mutation.
 */
interface NotificationPayload {
  workspace_id: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_role: string;
  created_at: string;
}

// Every notification-bell surface key — invalidating all three is cheap and
// avoids the bridge needing to know which role is currently mounted.
const BELL_KEYS = ['staff-notifications', 'client-notifications', 'admin-notifications'];

export function RealtimeNotificationBridge() {
  const qc = useQueryClient();
  useRealtime<NotificationPayload>('notification', (n) => {
    toast(n.title, { description: n.body });
    for (const key of BELL_KEYS) qc.invalidateQueries({ queryKey: [key] });
  });
  return null;
}
