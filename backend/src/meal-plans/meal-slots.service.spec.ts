import { BadRequestException } from '@nestjs/common';
import { MealSlotsService, customLabels } from './meal-slots.service';

/** A practice's meal times: which slots its clients see, and their names. */

function build(stored: unknown) {
  const writes: string[] = [];
  const prisma = {
    $queryRawUnsafe: async () => [{ meal_slots: stored }],
    $executeRawUnsafe: async (_sql: string, json: string) => { writes.push(json); return 1; },
  };
  return { svc: new MealSlotsService(prisma as never), writes };
}

describe('MealSlotsService', () => {
  it('gives the standard five with standard names until the practice changes them', async () => {
    const out = await build(null).svc.forWorkspace('ws');
    expect(out.map((e) => e.label)).toEqual(['Breakfast', 'Mid-morning', 'Lunch', 'Evening snack', 'Dinner']);
    expect(out.every((e) => !e.custom)).toBe(true);
  });

  it("returns only the practice's meal times, renamed, in time-of-day order", async () => {
    const { svc } = build([
      { slot: 'dinner', label: 'Last Meal' },
      { slot: 'breakfast', label: 'First Meal' },
      { slot: 'lunch', label: 'Mid Meal' },
    ]);
    const out = await svc.forWorkspace('ws');
    expect(out).toEqual([
      { slot: 'breakfast', label: 'First Meal', custom: true },
      { slot: 'lunch', label: 'Mid Meal', custom: true },
      { slot: 'dinner', label: 'Last Meal', custom: true },
    ]);
    expect(customLabels(out)).toEqual({ breakfast: 'First Meal', lunch: 'Mid Meal', dinner: 'Last Meal' });
  });

  it('saves names trimmed, drops duplicates, and stores the standard name as no rename', async () => {
    const { svc, writes } = build(null);
    const out = await svc.set('ws', [
      { slot: 'breakfast', label: '  First   Meal ' },
      { slot: 'breakfast', label: 'ignored' },
      { slot: 'dinner', label: 'Dinner' },
    ]);
    expect(JSON.parse(writes[0])).toEqual([{ slot: 'breakfast', label: 'First Meal' }, { slot: 'dinner' }]);
    expect(out.map((e) => [e.slot, e.label, e.custom])).toEqual([
      ['breakfast', 'First Meal', true],
      ['dinner', 'Dinner', false],
    ]);
  });

  it('refuses no meal times, unknown slots and long names', async () => {
    const { svc } = build(null);
    await expect(svc.set('ws', [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.set('ws', [{ slot: 'brunch' }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.set('ws', [{ slot: 'lunch', label: 'x'.repeat(41) }])).rejects.toBeInstanceOf(BadRequestException);
  });
});
