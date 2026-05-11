import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationPromptProps {
  clientId: string | null;
}

const STORAGE_KEY = 'notification-prompt-dismissed';
const PROMPT_DELAY_MS = 5000; // Show after 5 seconds

export function NotificationPrompt({ clientId }: NotificationPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permissionStatus,
    deviceType,
    isStandalone,
    subscribe,
  } = usePushNotifications(clientId);

  useEffect(() => {
    // Don't show if: not supported, already subscribed, already denied, iOS not standalone, or previously dismissed
    if (!isSupported || isSubscribed || permissionStatus === 'denied') return;
    if (deviceType === 'ios' && !isStandalone) return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      // Re-show after 7 days if still not subscribed
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const timer = setTimeout(() => setShowPrompt(true), PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permissionStatus, deviceType, isStandalone]);

  // Hide automatically once subscribed
  useEffect(() => {
    if (isSubscribed) setShowPrompt(false);
  }, [isSubscribed]);

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  const handleEnable = async () => {
    await subscribe();
    // dismiss will happen via isSubscribed effect above
  };

  if (!showPrompt || !clientId) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[90] animate-in fade-in slide-in-from-bottom-5 sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="bg-background border border-primary/20 rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">Stay Updated</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get notified about new messages, meal plans, and reminders from your nutritionist.
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleEnable}
                disabled={isLoading}
              >
                {isLoading ? 'Enabling...' : 'Enable Notifications'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={dismiss}
              >
                Not Now
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 -mt-1 -mr-1"
            onClick={dismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
