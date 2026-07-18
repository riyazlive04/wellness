import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlateInsightService } from './plate-insight.service';
import { UsageService } from '../usage/usage.service';
import type { PlateTotals } from './plate-vision.types';

// Usage metering is fire-and-forget; a no-op stub keeps these unit tests
// focused on the rule-based insight math.
const usageStub = {
  record: async () => {},
  checkQuota: async () => ({ exceeded: false, used: 0, limit: null }),
} as unknown as UsageService;

/**
 * PlateInsightService — the deterministic rule-based fallback.
 *
 * With no GEMINI_API_KEY the service must still produce a sound, numbers-faithful
 * insight: it interprets the totals it's given (macro balance, goal share, flags)
 * and NEVER invents nutrition values. These tests lock that math.
 */
function makeService(apiKey?: string): PlateInsightService {
  const config = { get: (k: string) => (k === 'GEMINI_API_KEY' ? apiKey : undefined) };
  const svc = new PlateInsightService(config as unknown as ConfigService, usageStub);
  svc.onModuleInit(); // no key → model stays null → rule path
  return svc;
}

const NO_GOAL = { target_kcal: null, goals: null, activity_level: null };

describe('PlateInsightService (rule fallback)', () => {
  let svc: PlateInsightService;

  beforeEach(() => {
    svc = makeService(undefined);
  });

  it('is constructable via the Nest DI container', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PlateInsightService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: UsageService, useValue: usageStub },
      ],
    }).compile();
    expect(moduleRef.get(PlateInsightService)).toBeInstanceOf(PlateInsightService);
  });

  it('returns an unresolved insight when no nutrition was computed', async () => {
    const totals: PlateTotals = { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0, fiber_g: null };
    const out = await svc.generate({ totals, items: [], mealType: 'lunch', client: NO_GOAL });
    expect(out.source).toBe('rule');
    expect(out.flags).toContain('unresolved_items');
    expect(out.score).toBeNull();
  });

  it('flags low protein and suggests a protein source', async () => {
    // 500 kcal, ~2% from protein → low.
    const totals: PlateTotals = { energy_kcal: 500, protein_g: 2.5, carbohydrate_g: 90, fat_g: 12, fiber_g: 2 };
    const out = await svc.generate({ totals, items: [{ name: 'rice', kcal: 500 }], mealType: 'lunch', client: NO_GOAL });
    expect(out.macro_balance.protein).toBe('low');
    expect(out.flags).toContain('low_protein');
    expect(out.suggestions.join(' ')).toMatch(/protein/i);
    expect(out.source).toBe('rule');
  });

  it('flags a fat-dense plate', async () => {
    // fat 9 kcal/g: 30g fat = 270 kcal of 500 = 54% → high.
    const totals: PlateTotals = { energy_kcal: 500, protein_g: 20, carbohydrate_g: 30, fat_g: 30, fiber_g: 6 };
    const out = await svc.generate({ totals, items: [{ name: 'fries', kcal: 500 }], mealType: 'dinner', client: NO_GOAL });
    expect(out.macro_balance.fat).toBe('high');
    expect(out.flags).toContain('high_fat');
  });

  it('reports the share of the daily target when a goal is set', async () => {
    const totals: PlateTotals = { energy_kcal: 600, protein_g: 40, carbohydrate_g: 70, fat_g: 18, fiber_g: 8 };
    const out = await svc.generate({
      totals,
      items: [{ name: 'thali', kcal: 600 }],
      mealType: 'lunch',
      client: { target_kcal: 2000, goals: 'fat loss', activity_level: 'moderate' },
    });
    // 600 / 2000 = 30%
    expect(out.summary).toMatch(/30%/);
    expect(out.summary).toMatch(/2000 kcal/);
  });

  it('scores a balanced plate higher than a skewed one', async () => {
    const balanced: PlateTotals = { energy_kcal: 600, protein_g: 34, carbohydrate_g: 82, fat_g: 18, fiber_g: 9 };
    const skewed: PlateTotals = { energy_kcal: 600, protein_g: 3, carbohydrate_g: 135, fat_g: 6, fiber_g: 1 };
    const b = await svc.generate({ totals: balanced, items: [], mealType: 'lunch', client: NO_GOAL });
    const s = await svc.generate({ totals: skewed, items: [], mealType: 'lunch', client: NO_GOAL });
    expect(b.score).not.toBeNull();
    expect(s.score).not.toBeNull();
    expect((b.score ?? 0)).toBeGreaterThan(s.score ?? 0);
  });

  it('never invents values - totals pass through untouched in the summary', async () => {
    const totals: PlateTotals = { energy_kcal: 423, protein_g: 21, carbohydrate_g: 55, fat_g: 12, fiber_g: 7 };
    const out = await svc.generate({ totals, items: [], mealType: 'breakfast', client: NO_GOAL });
    expect(out.summary).toContain('423');
  });
});
