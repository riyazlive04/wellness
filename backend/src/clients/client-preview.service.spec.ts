import { collapsePlates, lastDays, share, weightOf } from './client-preview.service';

/** The roster's client preview: logging, weight and today's plates. */

describe('lastDays', () => {
  it('lists the last n dates in India, oldest first', () => {
    // 20:00 UTC on 11 Oct is already 12 Oct in India.
    expect(lastDays(3, new Date('2026-10-11T20:00:00Z'))).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });
});

describe('share', () => {
  it('counts planned meals logged, capping extra meals at the plan', () => {
    expect(share([{ meals: 3 }, { meals: 5 }, { meals: 0 }, { meals: 1 }], 3)).toBe(58);
    expect(share([], 3)).toBe(0);
  });
});

describe('weightOf', () => {
  it('gives the change since the first weigh-in', () => {
    expect(weightOf([{ d: '2026-09-01', w: '80.6' }, { d: '2026-10-10', w: '78.2' }], '78.2'))
      .toEqual({ current: 78.2, start: 80.6, change: -2.4, since: '2026-09-01' });
  });
  it('falls back to the profile weight with no change when there is one reading', () => {
    expect(weightOf([], '64')).toEqual({ current: 64, start: null, change: null, since: null });
    expect(weightOf([{ d: '2026-10-01', w: '70' }, { d: '2026-10-01', w: '70' }], null)).toEqual({ current: 70, start: null, change: null, since: null });
    expect(weightOf([], null)).toBeNull();
  });
});

describe('collapsePlates', () => {
  it('shows a Plate Vision plate once with its foods and calories combined', () => {
    const out = collapsePlates([
      { plate: 'p1', meal_name: 'Rice', kcal: 200 },
      { plate: null, meal_name: 'Tea', kcal: 40 },
      { plate: 'p1', meal_name: 'Fish curry', kcal: 180 },
    ]);
    expect(out).toEqual([
      { plate: 'p1', meal_name: 'Rice, Fish curry', kcal: 380 },
      { plate: null, meal_name: 'Tea', kcal: 40 },
    ]);
  });
});
