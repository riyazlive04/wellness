import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// VAPID public key - hardcoded for frontend use (public keys are meant to be public!)
const VAPID_PUBLIC_KEY = "BA4PmjN1Np_fvvN8ABQ2pcYF_nTDTc_tizzRelPNQ_EYnMMWiZXY6H_LvksgiRFOqcORB8JndEH8BXZ-IwSK7lY";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Detect platform
function getDeviceType(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function usePushNotifications(clientId: string | null) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isStandalone, setIsStandalone] = useState(false);
  const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    setDeviceType(getDeviceType());

    // Check if the app is running in standalone mode (installed as PWA)
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone ||
                          document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);
    return () => window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkStandalone);
  }, []);

  const checkSubscriptionStatus = useCallback(async () => {
    if (!clientId) return;

    try {
      // Check if APIs are available
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        setIsSubscribed(false);
        return;
      }

      // Don't try to access pushManager if permission is denied
      if (Notification.permission === 'denied') {
        setIsSubscribed(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Verify the subscription is still valid in our DB
        const { data } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('client_id', clientId)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();

        if (data) {
          setIsSubscribed(true);
        } else {
          // Browser has subscription but DB doesn't - re-save it
          await saveSubscriptionToDb(clientId, subscription);
          setIsSubscribed(true);
        }
      } else {
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error('[Push] Error checking subscription:', error);
      setIsSubscribed(false);
    }
  }, [clientId]);

  // Refresh permission status manually (fallback for browsers without Permissions API)
  const refreshPermissionStatus = useCallback(() => {
    if (typeof Notification !== 'undefined') {
      const newStatus = Notification.permission;
      setPermissionStatus(newStatus);

      if (newStatus === 'granted') {
        checkSubscriptionStatus();
      }
    }
  }, [checkSubscriptionStatus]);

  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    // Set initial permission status
    if (typeof Notification !== 'undefined') {
      setPermissionStatus(Notification.permission);
    }

    // Use Permissions API to listen for permission changes
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then((status) => {
        if (typeof Notification !== 'undefined') {
          setPermissionStatus(Notification.permission);
        }

        status.onchange = () => {
          if (typeof Notification !== 'undefined') {
            const newStatus = Notification.permission;
            setPermissionStatus(newStatus);

            if (newStatus === 'granted') {
              checkSubscriptionStatus();
            } else if (newStatus === 'denied') {
              setIsSubscribed(false);
            }
          }
        };
      }).catch(() => {
        // Fallback for browsers that don't support this
      });
    }

    if (clientId && supported) {
      checkSubscriptionStatus();
    }
  }, [clientId, checkSubscriptionStatus]);

  const requestPermission = async () => {
    if (!isSupported) {
      console.warn('[Push] Not supported in this browser');
      toast.error('Push notifications are not supported in your browser');
      return false;
    }

    // iOS specific: must be installed as PWA first
    if (deviceType === 'ios' && !isStandalone) {
      toast.info(
        'On iOS, you must first install this app: tap the Share button, then "Add to Home Screen". Open the app from your Home Screen, then enable notifications.',
        { duration: 12000 }
      );
      return false;
    }

    const currentPermission = Notification.permission;

    if (currentPermission === 'denied') {
      toast.error('Notification permission was previously denied. Please enable it in your browser settings.');
      return false;
    }

    if (currentPermission === 'granted') {
      return true;
    }

    // Only request permission if it's 'default' (not yet asked)
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);

    if (permission !== 'granted') {
      toast.error('Notification permission denied');
      return false;
    }

    return true;
  };

  // Save subscription to Supabase with proper conflict handling
  const saveSubscriptionToDb = async (userId: string, subscription: PushSubscription) => {
    const subscriptionData = {
      client_id: userId,
      endpoint: subscription.endpoint,
      p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
      auth: arrayBufferToBase64(subscription.getKey('auth')),
      user_agent: navigator.userAgent,
    };

    // First try to delete any existing subscription for this user+endpoint to avoid conflicts
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('client_id', userId)
      .eq('endpoint', subscription.endpoint);

    // Then insert the fresh subscription
    const { error } = await supabase
      .from('push_subscriptions')
      .insert(subscriptionData);

    if (error) {
      console.error('[Push] Error saving subscription:', error);
      throw error;
    }
  };

  const subscribe = async () => {
    if (!clientId) return;

    setIsLoading(true);
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setIsLoading(false);
        return;
      }

      // Wait for SW to be ready
      const registration = await navigator.serviceWorker.ready;

      // Unsubscribe existing push subscription (may have stale VAPID key)
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Save to database
      await saveSubscriptionToDb(clientId, subscription);

      setIsSubscribed(true);
      toast.success('Notifications enabled! You will now receive alerts on this device.');
    } catch (error: any) {
      console.error('[Push] Error subscribing:', error);

      // Provide user-friendly error messages
      if (error.name === 'AbortError') {
        toast.error('Subscription was cancelled. Please try again.');
      } else if (error.name === 'NotAllowedError') {
        toast.error('Permission denied. Please allow notifications in your browser settings.');
        setPermissionStatus('denied');
      } else {
        toast.error(`Failed to enable notifications: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!clientId) return;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from database first
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('client_id', clientId)
          .eq('endpoint', subscription.endpoint);

        // Then unsubscribe from push service
        await subscription.unsubscribe();
      } else {
        // No browser subscription, but clean up any DB entries for this user
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('client_id', clientId);
      }

      setIsSubscribed(false);
      toast.success('Notifications disabled');
    } catch (error) {
      console.error('[Push] Error unsubscribing:', error);
      toast.error('Failed to disable notifications');
    } finally {
      setIsLoading(false);
    }
  };

  // Send a LOCAL test notification directly via the service worker (no edge function needed)
  const sendLocalTestNotification = async () => {
    try {
      if (Notification.permission !== 'granted') {
        toast.error('Notification permission not granted. Enable notifications first.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification('Sheizen AI Nutritionist', {
        body: 'Notifications are working on this device! 🎉',
        icon: '/icon-192.png',
        badge: '/favicon.ico',
        tag: 'sheizen-local-test',
        renotify: true,
        data: { url: '/dashboard' },
        vibrate: [200, 100, 200],
      });

      toast.success('Test notification sent! You should see it now.');
    } catch (err: any) {
      console.error('[Push] Local test error:', err);
      toast.error(`Local test failed: ${err.message}`);
    }
  };

  // Send a test notification via the Supabase edge function (requires VAPID secrets + deployed function)
  const sendTestNotification = async () => {
    if (!clientId) return;
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          client_id: clientId,
          title: 'Test Notification',
          body: 'Push notifications are working via the server!',
          url: '/dashboard',
        },
      });

      if (error) {
        console.error('[Push] Edge function error:', error);
        toast.error(`Server test failed: ${error.message}. Try "Test Local" instead.`);
        return;
      }

      console.log('[Push] Edge function response:', data);

      if (data?.sent === 0) {
        toast.error('No subscriptions found on server. Try disabling and re-enabling notifications.');
      } else {
        toast.success(`Notification sent via server! (${data?.sent || 0} delivered)`);
      }
    } catch (err: any) {
      console.error('[Push] Edge function invoke error:', err);
      toast.error(`Server test failed: ${err.message}. Try "Test Local" instead.`);
    }
  };

  return {
    isSupported,
    isSubscribed,
    isLoading,
    isStandalone,
    deviceType,
    permissionStatus,
    subscribe,
    unsubscribe,
    sendTestNotification,
    sendLocalTestNotification,
    refreshPermissionStatus,
  };
}
