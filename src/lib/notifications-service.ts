/**
 * Notification delivery for the client app.
 *
 * IMPORTANT — why this polls instead of using true remote push:
 * a standalone (side-loaded) Android build can only receive remote push via
 * FCM, which requires a Firebase project + google-services.json (and, for the
 * Expo push service, a linked EAS projectId). Neither exists for this build, and
 * the backend currently only speaks browser web-push (VAPID), which can never
 * reach a React Native app (no Service Worker).
 *
 * So we deliver real notifications without any external service: a background
 * task periodically reads /me/notifications and raises a LOCAL notification for
 * anything new. Same content, slightly delayed (the OS decides how often the
 * task runs — roughly every 15 min on Android, and never while force-stopped).
 *
 * When Firebase/EAS credentials are added later, this can be swapped for true
 * push without touching any screen code.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { notificationsApi } from '@/lib/notifications-api';

export const BG_TASK = 'sirah-notification-poll';
const LAST_SEEN_KEY = 'sirah-last-notification-id';
const ENABLED_KEY = 'sirah-notifications-enabled';
const FCM_TOKEN_KEY = 'sirah-fcm-token';

/** Show notifications even while the app is foregrounded. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Raise local notifications for server notifications newer than the last seen. */
async function deliverNew(limit = 10): Promise<number> {
  const items = await notificationsApi.list(limit);
  if (!items.length) return 0;

  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
  const fresh: typeof items = [];
  for (const n of items) {
    if (n.id === lastSeen) break;
    fresh.push(n);
  }
  // First ever run: don't spam a backlog — just record the newest.
  if (!lastSeen) {
    await AsyncStorage.setItem(LAST_SEEN_KEY, items[0].id);
    return 0;
  }
  if (!fresh.length) return 0;

  // Oldest-first so the newest lands on top, capped so a backlog can't flood.
  for (const n of fresh.slice(0, 5).reverse()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.title || 'SIRAH LIFE',
        body: n.body ?? '',
        data: n.url ? { url: n.url } : {},
      },
      trigger: null,
    });
  }
  await AsyncStorage.setItem(LAST_SEEN_KEY, items[0].id);
  return fresh.length;
}

// Background task must be defined at module scope.
TaskManager.defineTask(BG_TASK, async () => {
  try {
    const count = await deliverNew();
    return count > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'SIRAH LIFE',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#06B6D4',
  });
}

/**
 * Register this device with FCM and hand the raw token to our backend so it can
 * push via the Firebase Admin SDK. Uses getDevicePushTokenAsync (the native FCM
 * token) — NOT the Expo push service — so no EAS project is required.
 * No-ops gracefully if FCM isn't available (e.g. emulator without Play Services)
 * or the backend endpoint isn't deployed yet.
 */
export async function registerForRemotePush(): Promise<void> {
  try {
    const { data: token, type } = await Notifications.getDevicePushTokenAsync();
    if (!token || typeof token !== 'string') return;
    const stored = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    // Always (re)register on token change; backend upserts.
    await notificationsApi.registerDevice(token, type ?? Platform.OS).catch(() => {});
    if (token !== stored) await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
  } catch (err) {
    console.warn('[push] FCM registration skipped', err);
  }
}

/** Ask the OS for notification permission. Returns whether it was granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function areNotificationsEnabled(): Promise<boolean> {
  const flag = await AsyncStorage.getItem(ENABLED_KEY);
  if (flag !== 'true') return false;
  const perms = await Notifications.getPermissionsAsync();
  return perms.granted;
}

/** Turn notifications on: permission + register the background poll. */
export async function enableNotifications(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BG_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(BG_TASK, {
        minimumInterval: 15 * 60, // seconds; the OS may run it less often
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    /* background fetch unavailable — foreground sync still works */
  }
  await AsyncStorage.setItem(ENABLED_KEY, 'true');
  // True remote push (instant, works when the app is closed).
  await registerForRemotePush();
  // Polling fallback covers the gap when FCM isn't delivered / not yet on backend.
  await deliverNew().catch(() => {});
  return true;
}

export async function disableNotifications(): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, 'false');
  try {
    const token = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (token) await notificationsApi.unregisterDevice(token).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if (await TaskManager.isTaskRegisteredAsync(BG_TASK)) {
      await BackgroundFetch.unregisterTaskAsync(BG_TASK);
    }
  } catch {
    /* ignore */
  }
}

/** Foreground check — call when the app opens or returns from background. */
export async function syncNotificationsNow(): Promise<void> {
  if (!(await areNotificationsEnabled())) return;
  // Refresh the FCM token registration (tokens rotate) + poll as a safety net.
  void registerForRemotePush();
  await deliverNew().catch(() => {});
}
