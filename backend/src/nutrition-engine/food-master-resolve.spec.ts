import { FoodMasterService } from './food-master.service';

/**
 * Resolving a detected food name: a wrong food is worse than "needs review",
 * so a weak winner is never accepted just for being the least bad.
 */
function withHits(hits: Array<[string, number]>) {
  const svc = new FoodMasterService({} as never, {} as never);
  jest.spyOn(svc, 'search').mockResolvedValue(
    hits.map(([name, similarity], i) => ({ food: { id: `f${i}`, canonical_name: name } as never, similarity, energy_kcal_per_100g: null, macros: {} as never, nutrients: {}, good_for: [] })),
  );
  return svc;
}

describe('FoodMasterService.resolve', () => {
  it('accepts a strong match', async () => {
    const r = await withHits([['Idli', 1], ['Instant idli', 0.7]]).resolve('Idli');
    expect(r).toMatchObject({ canonical_name: 'Idli' });
  });

  it('accepts a decent match with a clear lead', async () => {
    const r = await withHits([['Sambar', 0.7], ['Rasam', 0.4]]).resolve('sambhar');
    expect(r).toMatchObject({ canonical_name: 'Sambar' });
  });

  it('sends a weak winner to review even when it leads by a lot', async () => {
    // Before: "Vegetable fritter" 0.45 vs 0.29 was accepted on margin alone.
    const r = await withHits([['Pali kora', 0.45], ['Butter', 0.29]]).resolve('Vegetable fritter');
    expect(r).toMatchObject({ reason: 'ambiguous', recommended_action: 'manual_review_required' });
  });

  it('sends a lone weak hit to review', async () => {
    const r = await withHits([['Chicken, breast', 0.45]]).resolve('Chicken Biryani');
    expect(r).toMatchObject({ recommended_action: 'manual_review_required' });
  });

  it('sends close calls to review', async () => {
    const r = await withHits([['Soya chunks korma', 0.66], ['Soya chunks and peas', 0.6]]).resolve('Soya chunks fry');
    expect(r).toMatchObject({ reason: 'ambiguous' });
  });
});
