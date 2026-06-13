import { toast } from 'sonner';
import { useRealtime } from '@/lib/realtime';

/**
 * RealtimeNotificationBridge — mounted once near the app root, listens for
 * Realtime 'notification' events and shows a sonner toast.
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

export function RealtimeNotificationBridge() {
  useRealtime<NotificationPayload>('notification', (n) => {
    toast(n.title, { description: n.body });
  });
  return null;
}
