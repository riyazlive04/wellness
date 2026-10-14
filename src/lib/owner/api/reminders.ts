// Same as the web client (frontend/src/modules/workspace/api/reminders.ts).
import { api } from '@/lib/api';
import type { MealSlot, MealSlotEntry } from './mealPlans';

/** One of the nutritionist's own daily reminders, e.g. 06:30 "Methi water". */
export interface CustomReminder {
  id?: string;
  /** "HH:MM" on the client's phone clock. */
  time: string;
  title: string;
  body?: string;
}

/** Reminders the client app schedules on the client's phone. */
export interface ReminderSettings {
  meals_enabled: boolean;
  meal_times: Partial<Record<string, string>>;
  water_enabled: boolean;
  water_start: string;
  water_end: string;
  water_every_minutes: 30 | 60 | 90 | 120;
  custom_enabled: boolean;
  custom: CustomReminder[];
  sequence_id?: string | null;
  sequence_name?: string | null;
  updated_by?: 'nutritionist' | 'client';
  updated_at?: string;
}

export interface ReminderSequence {
  id: string;
  name: string;
  description: string | null;
  settings: ReminderSettings;
  client_count: number;
  updated_at: string;
}

export const MAX_CUSTOM = 20;

export const DEFAULT_MEAL_TIMES: Record<MealSlot, string> = {
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

export const BLANK_REMINDERS: ReminderSettings = {
  meals_enabled: true,
  meal_times: {},
  water_enabled: true,
  water_start: '07:00',
  water_end: '21:00',
  water_every_minutes: 60,
  custom_enabled: true,
  custom: [],
};

/** Ready-made routines to start a sequence from; every line is editable. */
export const SEQUENCE_STARTERS: { name: string; description: string; settings: ReminderSettings }[] = [
  {
    name: 'Standard day',
    description: 'Every meal time, a glass of water every hour, lights out on time.',
    settings: {
      ...BLANK_REMINDERS,
      custom: [
        { time: '06:30', title: 'Good morning! Start with a glass of warm water' },
        { time: '22:00', title: 'Wind down: aim to sleep by 10:30 PM' },
      ],
    },
  },
  {
    name: 'Weight loss',
    description: 'Water before meals, a daily walk and an early dinner.',
    settings: {
      ...BLANK_REMINDERS,
      meal_times: { dinner: '19:30' },
      custom: [
        { time: '06:30', title: 'Warm lemon water', body: 'One glass before anything else.' },
        { time: '07:00', title: 'Morning walk: 30 minutes' },
        { time: '13:00', title: 'Glass of water before lunch' },
        { time: '19:00', title: 'Glass of water before dinner' },
        { time: '20:15', title: '10-minute walk after dinner' },
      ],
    },
  },
  {
    name: 'Diabetic routine',
    description: 'Methi water, sugar checks, small regular meals and a walk after dinner.',
    settings: {
      ...BLANK_REMINDERS,
      custom: [
        { time: '06:30', title: 'Methi water', body: 'Soaked fenugreek water on an empty stomach.' },
        { time: '07:00', title: 'Check fasting sugar and note it down' },
        { time: '10:30', title: 'Check sugar 2 hours after breakfast' },
        { time: '20:30', title: '15-minute walk after dinner' },
        { time: '21:30', title: 'Take your night medicines, if any' },
      ],
    },
  },
];

const BASE = '/api/v1/workspaces/me';

export const remindersApi = {
  sequences: () => api.get<ReminderSequence[]>(`${BASE}/reminder-sequences`),
  createSequence: (body: { name: string; description?: string; settings: ReminderSettings }) =>
    api.post<ReminderSequence>(`${BASE}/reminder-sequences`, { body: { ...body, settings: settingsBody(body.settings) } }),
  updateSequence: (id: string, body: { name: string; description?: string; settings: ReminderSettings; reapply: boolean }) =>
    api.put<{ sequence: ReminderSequence; updated_clients: number }>(`${BASE}/reminder-sequences/${id}`, {
      body: { ...body, settings: settingsBody(body.settings) },
    }),
  deleteSequence: (id: string) => api.delete<{ deleted: true }>(`${BASE}/reminder-sequences/${id}`),
  apply: (id: string, clientIds: string[]) =>
    api.post<{ updated: number }>(`${BASE}/reminder-sequences/${id}/apply`, { body: { clientIds } }),
  forClient: (clientId: string) => api.get<ReminderSettings | null>(`${BASE}/clients/${clientId}/reminders`),
  setForClient: (clientId: string, s: ReminderSettings) =>
    api.put<ReminderSettings>(`${BASE}/clients/${clientId}/reminders`, { body: settingsBody(s) }),
};

/** Only the fields the server accepts (it rejects unknown ones). */
function settingsBody(s: ReminderSettings) {
  return {
    meals_enabled: s.meals_enabled,
    meal_times: s.meal_times,
    water_enabled: s.water_enabled,
    water_start: s.water_start,
    water_end: s.water_end,
    water_every_minutes: s.water_every_minutes,
    custom_enabled: s.custom_enabled,
    custom: s.custom.map((c) => ({ ...(c.id ? { id: c.id } : {}), time: c.time, title: c.title, ...(c.body ? { body: c.body } : {}) })),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "13:30" → "1:30 PM". */
export function formatTime(hhmm: string): string {
  const mins = toMinutes(hhmm);
  const h = Math.floor(mins / 60);
  return `${h % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const mealTimeFor = (s: ReminderSettings, slot: MealSlot) => s.meal_times[slot] ?? DEFAULT_MEAL_TIMES[slot];

export function waterCount(s: ReminderSettings): number {
  const span = toMinutes(s.water_end) - toMinutes(s.water_start);
  return span < 0 ? 0 : Math.floor(span / s.water_every_minutes) + 1;
}

/** "5 meal · 15 water · 4 routine reminders a day". */
export function reminderSummary(s: ReminderSettings, schedule: MealSlotEntry[]): string {
  const parts: string[] = [];
  if (s.meals_enabled) parts.push(`${schedule.length} meal`);
  if (s.water_enabled) parts.push(`${waterCount(s)} water`);
  if (s.custom_enabled && s.custom.length) parts.push(`${s.custom.length} routine`);
  const total = (s.meals_enabled ? schedule.length : 0) + (s.water_enabled ? waterCount(s) : 0) + (s.custom_enabled ? s.custom.length : 0);
  return parts.length ? `${parts.join(' · ')} · ${total} reminders a day` : 'All reminders off';
}

/** True when the settings can be saved (the server would refuse otherwise). */
export function remindersValid(s: ReminderSettings): boolean {
  return s.water_start < s.water_end && s.custom.every((c) => c.title.trim().length > 0);
}
