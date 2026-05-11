import { Bell, BellOff, CheckCircle, XCircle, AlertCircle, Settings, RefreshCw, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface NotificationSettingsProps {
  clientId: string | null;
}

export function NotificationSettings({ clientId }: NotificationSettingsProps) {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permissionStatus,
    deviceType,
    isStandalone,
    subscribe,
    unsubscribe,
    sendTestNotification,
    sendLocalTestNotification,
    refreshPermissionStatus,
  } = usePushNotifications(clientId);

  const getStatusInfo = () => {
    if (!isSupported) {
      if (deviceType === 'ios' && !isStandalone) {
        return {
          icon: <Smartphone className="h-5 w-5 text-yellow-500" />,
          title: "Install App First",
          description: "iOS requires you to install this app to your Home Screen before enabling notifications.",
          color: "text-yellow-500",
        };
      }
      return {
        icon: <AlertCircle className="h-5 w-5 text-destructive" />,
        title: "Not Supported",
        description: "Push notifications are not supported in your browser. Try using Chrome, Edge, or Firefox.",
        color: "text-destructive",
      };
    }

    if (permissionStatus === 'denied') {
      return {
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        title: "Blocked",
        description: "Notifications are blocked. Follow the instructions below to enable them.",
        color: "text-destructive",
      };
    }

    if (permissionStatus === 'granted' && isSubscribed) {
      return {
        icon: <CheckCircle className="h-5 w-5 text-green-500" />,
        title: "Enabled",
        description: `You will receive push notifications on this ${deviceType === 'desktop' ? 'computer' : 'device'}.`,
        color: "text-green-500",
      };
    }

    return {
      icon: <AlertCircle className="h-5 w-5 text-yellow-500" />,
      title: "Not Enabled",
      description: "Enable notifications to stay updated on your health journey.",
      color: "text-yellow-500",
    };
  };

  const statusInfo = getStatusInfo();

  const getBrowserInstructions = () => {
    const userAgent = navigator.userAgent.toLowerCase();

    // Mobile Chrome (Android)
    if (deviceType === 'android' && userAgent.includes('chrome')) {
      return {
        browser: "Chrome (Android)",
        steps: [
          "Tap the three-dot menu at the top right",
          "Go to Settings → Site Settings → Notifications",
          "Find this site and tap to allow notifications",
          "Refresh the page",
        ],
      };
    }

    // Desktop Chrome
    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      return {
        browser: "Chrome",
        steps: [
          "Click the lock/tune icon in the address bar",
          "Find 'Notifications' in the site settings",
          "Change from 'Block' to 'Allow'",
          "Refresh the page",
        ],
      };
    }

    if (userAgent.includes('firefox')) {
      return {
        browser: "Firefox",
        steps: [
          "Click the lock icon in the address bar",
          "Click 'Connection secure' then 'More Information'",
          "Go to 'Permissions' tab",
          "Find 'Send Notifications' and click 'Allow'",
          "Refresh the page",
        ],
      };
    }

    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      return {
        browser: "Safari",
        steps: [
          "Go to Safari menu → Settings → Websites",
          "Click 'Notifications' in the sidebar",
          "Find this website and change to 'Allow'",
          "Refresh the page",
        ],
      };
    }

    if (userAgent.includes('edg')) {
      return {
        browser: "Edge",
        steps: [
          "Click the lock icon in the address bar",
          "Click 'Permissions for this site'",
          "Find 'Notifications' and change to 'Allow'",
          "Refresh the page",
        ],
      };
    }

    return {
      browser: "your browser",
      steps: [
        "Open your browser settings",
        "Navigate to Site Settings or Permissions",
        "Find Notifications settings",
        "Allow notifications for this site",
        "Refresh the page",
      ],
    };
  };

  const browserInstructions = getBrowserInstructions();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified about messages, plans, and reminders on this {deviceType === 'desktop' ? 'computer' : 'device'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Device indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {deviceType === 'desktop' ? (
            <Monitor className="h-3.5 w-3.5" />
          ) : (
            <Smartphone className="h-3.5 w-3.5" />
          )}
          <span>
            {deviceType === 'desktop' ? 'Desktop/Laptop' : deviceType === 'ios' ? 'iPhone/iPad' : 'Android'} notifications
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          {statusInfo.icon}
          <div className="flex-1">
            <p className={`font-medium ${statusInfo.color}`}>{statusInfo.title}</p>
            <p className="text-sm text-muted-foreground">{statusInfo.description}</p>
          </div>
        </div>

        {/* iOS PWA Instructions */}
        {deviceType === 'ios' && !isStandalone && (
          <div className="border border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20 dark:border-yellow-900 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
              <Smartphone className="h-4 w-4" />
              How to enable on iPhone/iPad
            </div>
            <ol className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2 list-decimal list-inside">
              <li>Tap the <strong>Share</strong> button (box with upward arrow) at the bottom of Safari</li>
              <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
              <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
              <li>Open the app from your Home Screen</li>
              <li>Come back here and tap <strong>&quot;Enable Notifications&quot;</strong></li>
            </ol>
          </div>
        )}

        {/* Android instructions when not standalone */}
        {deviceType === 'android' && !isStandalone && isSupported && permissionStatus !== 'denied' && !isSubscribed && (
          <div className="border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900 rounded-lg p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              For the best notification experience on Android, install this app: tap the browser menu and select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong>.
            </p>
          </div>
        )}

        {/* Action button */}
        {isSupported && permissionStatus !== 'denied' && (
          <div className="space-y-2">
            <Button
              onClick={isSubscribed ? unsubscribe : subscribe}
              disabled={isLoading}
              variant={isSubscribed ? "outline" : "default"}
              className="w-full"
            >
              {isLoading ? (
                "Processing..."
              ) : isSubscribed ? (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Disable Notifications
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Enable Notifications
                </>
              )}
            </Button>

            {isSubscribed && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={sendLocalTestNotification}
                >
                  Test Local
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={sendTestNotification}
                >
                  Test Server
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Re-enable instructions when blocked */}
        {permissionStatus === 'denied' && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="h-4 w-4" />
              How to enable notifications in {browserInstructions.browser}
            </div>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              {browserInstructions.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>

            <Button
              variant="outline"
              size="sm"
              onClick={refreshPermissionStatus}
              className="w-full mt-3"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        )}

        {/* Multi-device hint */}
        {isSubscribed && (
          <p className="text-xs text-muted-foreground text-center">
            Notifications are per-device. Enable on each device you use.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
