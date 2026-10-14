import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MEAL_SLOTS } from '../meal-plans/meal-plans.types';
import type { CustomReminder, ReminderSettings } from './reminders.types';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const INTERVALS = [30, 60, 90, 120];
export const MAX_CUSTOM = 20;

/** Settings as they arrive from a caller: anything may be missing, own reminders may lack ids. */
export type ReminderSettingsInput = Partial<Omit<ReminderSettings, 'custom'>> & { custom?: Array<Partial<CustomReminder>> };

/**
 * Validate and tidy reminder settings from the web, the nutritionist app or
 * the client app. Unknown meal times and bad clock times are dropped; the
 * water window must be a real span. Never trusts ids or lengths from the caller.
 */
export function cleanReminderSettings(input: ReminderSettingsInput): ReminderSettings {
  const mealTimes: Record<string, string> = {};
  for (const [slot, time] of Object.entries(input.meal_times ?? {})) {
    if ((MEAL_SLOTS as readonly string[]).includes(slot) && typeof time === 'string' && HHMM.test(time)) {
      mealTimes[slot] = time;
    }
  }

  const waterStart = HHMM.test(String(input.water_start)) ? String(input.water_start) : '07:00';
  const waterEnd = HHMM.test(String(input.water_end)) ? String(input.water_end) : '21:00';
  if (waterStart >= waterEnd) {
    throw new BadRequestException('Water reminders must end later in the day than they start.');
  }
  const every = Number(input.water_every_minutes);

  const custom: CustomReminder[] = [];
  for (const raw of Array.isArray(input.custom) ? input.custom : []) {
    const time = String(raw?.time ?? '');
    const title = String(raw?.title ?? '').trim().slice(0, 60);
    if (!HHMM.test(time) || !title) continue;
    const body = String(raw?.body ?? '').trim().slice(0, 140);
    const id = typeof raw?.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : randomUUID();
    custom.push({ id, time, title, ...(body ? { body } : {}) });
  }
  if (custom.length > MAX_CUSTOM) {
    throw new BadRequestException(`Up to ${MAX_CUSTOM} of your own reminders a day.`);
  }
  custom.sort((a, b) => a.time.localeCompare(b.time));

  return {
    meals_enabled: !!input.meals_enabled,
    meal_times: mealTimes,
    water_enabled: !!input.water_enabled,
    water_start: waterStart,
    water_end: waterEnd,
    water_every_minutes: INTERVALS.includes(every) ? every : 60,
    custom_enabled: input.custom_enabled === undefined ? true : !!input.custom_enabled,
    custom,
  };
}
