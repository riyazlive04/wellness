/**
 * Meal-time and water reminders.
 *
 * Scheduled on the phone as repeating daily local notifications, so they fire
 * on time with no internet and no push service. The settings live on the
 * server (/me/reminders) so they follow the client to a new phone; every time
 * the app comes to the foreground we re-apply them, which also picks up a
 * changed meal plan (the practice's meal times).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import type { MealSlotEntry } from '@/lib/meal-slots';
import { MEAL_TYPE_LABEL, MEAL_TYPES, type MealType } from '@/lib/plate-vision-api';

/** One of the nutritionist's own daily reminders, e.g. 06:30 "Methi water". */
export interface CustomReminder {
  id: string;
  time: string;
  title: string;
  body?: string;
}

export interface ReminderSettings {
  meals_enabled: boolean;
  /** Meal time → "HH:MM" on the phone's clock. */
  meal_times: Partial<Record<string, string>>;
  water_enabled: boolean;
  water_start: string;
  water_end: string;
  water_every_minutes: 30 | 60 | 90 | 120;
  /** The nutritionist's daily routine; the client can switch it off, not edit it. */
  custom_enabled?: boolean;
  custom?: CustomReminder[];
  sequence_name?: string | null;
  updated_by?: 'nutritionist' | 'client';
}

export const DEFAULT_MEAL_TIMES: Record<MealType, string> = {
  cleansing_water: '06:30',
  early_morning: '07:00',
  breakfast: '08:30',
  mid_breakfast: '10:00',
  mid_morning: '11:00',
  lunch: '13:30',
  evening_snack_1: '16:30',
  evening_snack: '17:00',
  evening_snack_2: '18:30',
  dinner: '20:00',
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  meals_enabled: true,
  meal_times: {},
  water_enabled: true,
  water_start: '07:00',
  water_end: '21:00',
  water_every_minutes: 60,
  custom_enabled: true,
  custom: [],
};

export const remindersApi = {
  get: () => api.get<ReminderSettings | null>('/api/v1/me/reminders'),
  // Only what the client may change; the server keeps the nutritionist's routine.
  save: (s: ReminderSettings) =>
    api.put<ReminderSettings>('/api/v1/me/reminders', {
      body: {
        meals_enabled: s.meals_enabled,
        meal_times: s.meal_times,
        water_enabled: s.water_enabled,
        water_start: s.water_start,
        water_end: s.water_end,
        water_every_minutes: s.water_every_minutes,
        custom_enabled: s.custom_enabled ?? true,
      },
    }),
};

const CHANNEL = 'reminders';
const ID_PREFIX = 'nusi-rem-';
const APPLIED_KEY = 'sirah-reminders-applied';

const WATER_LINES = [
  'Time for a glass of water 💧',
  'A few sips now keeps you fresh 💧',
  'Water break! Your body will thank you 💧',
  'Stay hydrated: have a glass of water 💧',
  'Quick reminder to drink some water 💧',
  'Keep your garden growing: drink water 💧',
];

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMinutes = (mins: number): string => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** "13:30" → "1:30 PM". */
export const formatTime = (hhmm: string): string => {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const mealTimeFor = (s: ReminderSettings, slot: MealType): string =>
  s.meal_times[slot] ?? DEFAULT_MEAL_TIMES[slot];

/** Clock times of the water reminders, start to end inclusive. */
export function waterTimes(s: ReminderSettings): string[] {
  const out: string[] = [];
  const end = toMinutes(s.water_end);
  for (let t = toMinutes(s.water_start); t <= end; t += s.water_every_minutes) out.push(fromMinutes(t));
  return out;
}

interface Planned {
  id: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
}

function plan(s: ReminderSettings, slots: MealSlotEntry[]): Planned[] {
  const out: Planned[] = [];
  if (s.meals_enabled) {
    for (const e of slots) {
      const time = mealTimeFor(s, e.slot);
      const label = e.label || MEAL_TYPE_LABEL[e.slot];
      out.push({
        id: `${ID_PREFIX}meal-${e.slot}`,
        hour: Math.floor(toMinutes(time) / 60),
        minute: toMinutes(time) % 60,
        title: `${label} time 🍽️`,
        body: `Time for your ${label.toLowerCase()}. Log it in NUSI once you've eaten.`,
      });
    }
  }
  if (s.custom_enabled !== false) {
    for (const c of s.custom ?? []) {
      out.push({
        id: `${ID_PREFIX}own-${c.id}`,
        hour: Math.floor(toMinutes(c.time) / 60),
        minute: toMinutes(c.time) % 60,
        title: `⏰ ${c.title}`,
        body: c.body || 'A reminder from your nutritionist.',
      });
    }
  }
  if (s.water_enabled) {
    waterTimes(s).forEach((time, i) => {
      out.push({
        id: `${ID_PREFIX}water-${time.replace(':', '')}`,
        hour: Math.floor(toMinutes(time) / 60),
        minute: toMinutes(time) % 60,
        title: WATER_LINES[i % WATER_LINES.length],
        body: 'Tap to log a glass in NUSI.',
      });
    });
  }
  return out;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Meal & water reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 150, 200],
    lightColor: '#16A34A',
  });
}

/** Cancel every reminder this app scheduled (leaves message notifications alone). */
async function cancelAll(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Make the phone's scheduled reminders match `settings`. Returns how many are
 * scheduled, or null when notification permission is missing.
 */
export async function applyReminders(
  settings: ReminderSettings | null,
  slots: MealSlotEntry[],
  opts: { askPermission?: boolean } = {},
): Promise<number | null> {
  if (Platform.OS === 'web') return 0;
  const planned = settings ? plan(settings, slots) : [];
  const signature = JSON.stringify(planned);

  if (!planned.length) {
    await cancelAll();
    await AsyncStorage.setItem(APPLIED_KEY, signature);
    return 0;
  }

  await ensureChannel();
  let perms = await Notifications.getPermissionsAsync();
  if (!perms.granted && opts.askPermission) perms = await Notifications.requestPermissionsAsync();
  if (!perms.granted) return null;

  // Nothing changed and everything is still there: leave it be.
  const [applied, scheduled] = await Promise.all([
    AsyncStorage.getItem(APPLIED_KEY),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const present = scheduled.filter((n) => n.identifier.startsWith(ID_PREFIX)).length;
  if (applied === signature && present === planned.length) return planned.length;

  await cancelAll();
  for (const p of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { url: '/(tabs)' }, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: p.hour,
        minute: p.minute,
        channelId: CHANNEL,
      },
    });
  }
  await AsyncStorage.setItem(APPLIED_KEY, signature);
  return planned.length;
}

/** A one-off reminder in a few seconds, to check it shows on this phone. */
export async function sendTestReminder(): Promise<boolean> {
  await ensureChannel();
  let perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) perms = await Notifications.requestPermissionsAsync();
  if (!perms.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: WATER_LINES[0], body: 'This is how your reminders will look.', sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL },
  });
  return true;
}

// Ask for notification permission at most once per app launch.
let askedThisLaunch = false;

/** The practice's meal times the app knows, else the standard five. */
export const knownSlots = (slots: MealSlotEntry[] | undefined): MealSlotEntry[] => {
  const known = (slots ?? []).filter((e) => (MEAL_TYPES as readonly string[]).includes(e.slot));
  return known.length ? known : STANDARD_SLOTS;
};

/** Foreground sync: fetch settings + the practice's meal times and apply. */
export async function syncReminders(opts: { canAsk?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const [settings, slots] = await Promise.all([
      remindersApi.get(),
      api.get<MealSlotEntry[]>('/api/v1/me/meal-plan/slots').catch(() => [] as MealSlotEntry[]),
    ]);
    const ask = opts.canAsk !== false && !!settings && (settings.meals_enabled || settings.water_enabled || !!settings.custom?.length) && !askedThisLaunch;
    if (ask) askedThisLaunch = true;
    await applyReminders(settings, knownSlots(slots), { askPermission: ask });
  } catch {
    /* offline or not a client: keep whatever is already scheduled */
  }
}

/** Used when the practice hasn't picked its own meal times. */
export const STANDARD_SLOTS: MealSlotEntry[] = (['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'] as MealType[]).map(
  (slot) => ({ slot, label: MEAL_TYPE_LABEL[slot], custom: false }),
);
