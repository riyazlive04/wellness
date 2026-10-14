import { BadRequestException } from '@nestjs/common';
import { cleanReminderSettings } from './reminder-settings';
import { RemindersService } from './reminders.service';
import type { ReminderSettings } from './reminders.types';

/** Meal-time, water and routine reminders set by the nutritionist or the client. */

const base = {
  meals_enabled: true,
  meal_times: { breakfast: '08:30' },
  water_enabled: true,
  water_start: '07:00',
  water_end: '21:00',
  water_every_minutes: 60,
};

describe('cleanReminderSettings', () => {
  it('keeps known meal times, drops unknown ones and bad clock times', () => {
    const out = cleanReminderSettings({ ...base, meal_times: { breakfast: '08:30', brunch: '11:00', lunch: '25:00' } });
    expect(out.meal_times).toEqual({ breakfast: '08:30' });
  });

  it("sorts the nutritionist's own reminders by time, gives them ids and drops empty ones", () => {
    const out = cleanReminderSettings({
      ...base,
      custom: [
        { time: '07:00', title: 'Walk 30 minutes' },
        { time: '06:30', title: 'Methi water', body: 'Soaked overnight' },
        { time: '09:00', title: '   ' },
      ],
    });
    expect(out.custom.map((c) => c.title)).toEqual(['Methi water', 'Walk 30 minutes']);
    expect(out.custom.every((c) => c.id.length > 0)).toBe(true);
    expect(out.custom_enabled).toBe(true);
  });

  it('refuses a water window that ends before it starts', () => {
    expect(() => cleanReminderSettings({ ...base, water_start: '21:00', water_end: '07:00' })).toThrow(BadRequestException);
  });
});

describe('RemindersService.setMySettings', () => {
  it("lets the client change times but keeps the nutritionist's reminders and sequence", async () => {
    const stored: ReminderSettings = {
      ...cleanReminderSettings({ ...base, custom: [{ id: 'r1', time: '06:30', title: 'Methi water' }] }),
      sequence_id: 'seq-1',
      sequence_name: 'Diabetic routine',
    };
    const writes: string[] = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
        if (sql.startsWith('SELECT')) return [{ id: 'client-1', reminder_settings: stored }];
        writes.push(args[1] as string);
        return [];
      },
    };
    const svc = new RemindersService(prisma as never, {} as never);
    // A client app can't send `custom`, but even if it did it must be ignored.
    const out = await svc.setMySettings('user-1', { ...base, water_every_minutes: 90, custom: [] });
    expect(out.water_every_minutes).toBe(90);
    expect(out.custom.map((c) => c.title)).toEqual(['Methi water']);
    expect(out).toMatchObject({ sequence_id: 'seq-1', sequence_name: 'Diabetic routine', updated_by: 'client' });
    expect(JSON.parse(writes[0]).custom).toHaveLength(1);
  });
});
