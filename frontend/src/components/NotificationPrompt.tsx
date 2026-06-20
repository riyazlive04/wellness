import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { clientsApi } from "@/modules/workspace/api/clients";

interface NotificationPromptProps {
  /** Optional — only used as a "this is a client context" gate; the actual
   *  subscription is resolved server-side from the logged-in user. */
  clientId?: string | null;
}

const STORAGE_KEY = 'notification-prompt-dismissed';
const PROMPT_DELAY_MS = 5000; // Show after 5 seconds

// iOS only allows web push from an installed PWA (Add to Home Screen), so we
// skip the prompt there until the app is launched in standalone mode.
function iosBlocked(): boolean {
  if (typeof navigator === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || (navigator as unknown as { standalone?: boolean }).standalone;
  return !standalone;
}

/**
 * NotificationPrompt — gentle one-time nudge for clients to turn on browser/OS
 * push. Uses the same usePushSubscription system as the rest of the app, so the
 * subscription lands in push_subscriptions with the server's VAPID key.
 */
export function NotificationPrompt(_props: NotificationPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const { status, busy, subscribe } = usePushSubscription(clientsApi);

  useEffect(() => {
    // Only nudge when we genuinely can subscribe: supported, not denied, not
    // already subscribed, not iOS-without-PWA.
    if (status !== 'idle' || iosBlocked()) return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return; // re-ask after 7 days
    }

    const timer = setTimeout(() => setShowPrompt(true), PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Hide automatically once subscribed.
  useEffect(() => { if (status === 'subscribed') setShowPrompt(false); }, [status]);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  const handleEnable = async () => {
    try {
      await subscribe();
      // hides via the status === 'subscribed' effect
    } catch (err) {
      toast.error((err as Error).message || 'Could not enable notifications.');
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[90] animate-in fade-in slide-in-from-bottom-5 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-background border border-primary/20 rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">Stay updated</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get notified about new messages, meal plans, and appointment reminders from your nutritionist — even when the app is closed.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="inline-flex h-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 text-xs font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
              >
                {busy ? 'Enabling…' : 'Enable notifications'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex h-8 items-center justify-center rounded-full border border-foreground/10 px-4 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05]"
              >
                Not now
              </button>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 -mt-1 -mr-1" onClick={dismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
