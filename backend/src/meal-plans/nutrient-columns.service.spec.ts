import { BadRequestException } from '@nestjs/common';
import { NutrientColumnsService, cleanExtras } from './nutrient-columns.service';

/** The extra nutrient columns a practice shows on its meals, and the values meals store. */

function build(stored: unknown = []) {
  const writes: string[] = [];
  const prisma = {
    $queryRawUnsafe: async () => [{ extra_nutrients: stored }],
    $executeRawUnsafe: async (_sql: string, json: string) => { writes.push(json); return 1; },
  };
  return { svc: new NutrientColumnsService(prisma as never), writes };
}

describe('NutrientColumnsService', () => {
  it('uses standard names and units for food-database nutrients', async () => {
    const { svc } = build();
    const out = await svc.set('ws', [{ key: 'sodium_mg', label: 'whatever', unit: 'kg' }]);
    expect(out).toEqual([{ key: 'sodium_mg', label: 'Sodium', unit: 'mg', custom: false }]);
  });

  it("keys a practice's own nutrient from its name, and keeps the key on later saves", async () => {
    const { svc } = build();
    const [water] = await svc.set('ws', [{ label: '  Water  intake ', unit: 'ml' }]);
    expect(water).toEqual({ key: 'x_water_intake', label: 'Water intake', unit: 'ml', custom: true });
    const [again] = await svc.set('ws', [{ key: 'x_water_intake', label: 'Water', unit: 'ml' }]);
    expect(again.key).toBe('x_water_intake');
  });

  it('drops duplicate standard nutrients and de-duplicates custom keys', async () => {
    const { svc } = build();
    const out = await svc.set('ws', [{ key: 'iron_mg' }, { key: 'iron_mg' }, { label: 'Water', unit: 'ml' }, { label: 'Water', unit: 'L' }]);
    expect(out.map((c) => c.key)).toEqual(['iron_mg', 'x_water', 'x_water_2']);
  });

  it('refuses nameless, oversized or too many columns', async () => {
    const { svc } = build();
    await expect(svc.set('ws', [{ label: '' }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.set('ws', [{ label: 'x'.repeat(31) }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.set('ws', Array.from({ length: 13 }, (_, i) => ({ label: `N${i}` })))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads stored columns and ignores junk', async () => {
    const out = await build([{ key: 'calcium_mg', label: 'Calcium', unit: 'mg' }, null, { label: 'no key' }]).svc.forWorkspace('ws');
    expect(out).toEqual([{ key: 'calcium_mg', label: 'Calcium', unit: 'mg', custom: false }]);
  });
});

describe('cleanExtras', () => {
  it('keeps well-formed keys with non-negative numbers, rounded', () => {
    expect(cleanExtras({ sodium_mg: '320.456', x_water: 250, 'Bad Key': 5, empty: '' })).toEqual({ sodium_mg: 320.46, x_water: 250 });
  });
  it('treats missing as nothing and rejects bad values', () => {
    expect(cleanExtras(undefined)).toBeNull();
    expect(() => cleanExtras({ sodium_mg: -1 })).toThrow(BadRequestException);
    expect(() => cleanExtras([1, 2])).toThrow(BadRequestException);
  });
});
