/** One of the nutritionist's own daily reminders, e.g. 06:30 "Methi water". */
export interface CustomReminder {
  id: string;
  /** "HH:MM" on the client's phone clock. */
  time: string;
  title: string;
  body?: string;
}

/**
 * Reminders the client app schedules on the phone. Stored per client
 * (clients.reminder_settings) and as a practice's reusable sequence.
 */
export interface ReminderSettings {
  meals_enabled: boolean;
  /** Meal time → "HH:MM", e.g. { breakfast: "08:30" }. Missing = the app's default. */
  meal_times: Record<string, string>;
  water_enabled: boolean;
  water_start: string;
  water_end: string;
  water_every_minutes: number;
  custom_enabled: boolean;
  custom: CustomReminder[];
  /** Which sequence these came from, if any. */
  sequence_id?: string | null;
  sequence_name?: string | null;
  /** Who last changed them, and when. */
  updated_by?: 'nutritionist' | 'client';
  updated_at?: string;
}

export interface ReminderSequence {
  id: string;
  name: string;
  description: string | null;
  settings: ReminderSettings;
  /** Clients currently on this sequence. */
  client_count: number;
  updated_at: string;
}
