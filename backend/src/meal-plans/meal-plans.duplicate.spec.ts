import { MealPlansService } from './meal-plans.service';
import type { MealCard, MealPlan } from './meal-plans.types';

/** Copying a week: to the same client ("repeat"), or the same diet for another client. */

const card = (over: Partial<MealCard> = {}) =>
  ({
    id: 'c1', plan_id: 'src', day_number: 1, meal_type: 'breakfast', meal_name: 'Idli', description: null,
    kcal: 300, protein_g: 10, carbs_g: 50, fat_g: 5, fiber_g: 4, extra_nutrients: null, ingredients: null,
    instructions: null, source_type: null, source_id: null, quantity: 2, unit: 'pcs', ...over,
  }) as unknown as MealCard;

function build(opts: { failOnCard?: number } = {}) {
  const svc = new MealPlansService({} as never, {} as never, {} as never, {} as never);
  const source = { id: 'src', client_id: 'client-a', notes: 'Less salt', cards: [card(), card({ id: 'c2', day_number: 2 })] } as unknown as MealPlan;
  const created: Array<{ clientId: string; startDate: string }> = [];
  const added: unknown[] = [];
  const removed: string[] = [];
  const notes: Array<[string, string | null]> = [];
  jest.spyOn(svc, 'get').mockImplementation(async (_ws, id) => (id === 'src' ? source : ({ id, week_number: 3 } as unknown as MealPlan)));
  jest.spyOn(svc, 'create').mockImplementation(async (_ws, clientId, startDate) => {
    created.push({ clientId, startDate });
    return { id: 'new' } as unknown as MealPlan;
  });
  jest.spyOn(svc, 'addCard').mockImplementation(async (_ws, _plan, input) => {
    if (opts.failOnCard === added.length) throw new Error('boom');
    added.push(input);
    return {} as never;
  });
  jest.spyOn(svc, 'updateNotes').mockImplementation(async (_ws, id, n) => {
    notes.push([id, n]);
    return {} as never;
  });
  jest.spyOn(svc, 'remove').mockImplementation(async (_ws, id) => {
    removed.push(id);
    return { deleted: true };
  });
  return { svc, created, added, removed, notes };
}

describe('MealPlansService.duplicate', () => {
  it('repeats the week for the same client by default', async () => {
    const { svc, created } = build();
    await svc.duplicate('ws', 'src', '2026-10-19');
    expect(created).toEqual([{ clientId: 'client-a', startDate: '2026-10-19' }]);
  });

  it('copies every meal, with amounts and macros, and the notes to another client', async () => {
    const { svc, created, added, notes } = build();
    const out = await svc.duplicate('ws', 'src', '2026-10-19', 'client-b');
    expect(created).toEqual([{ clientId: 'client-b', startDate: '2026-10-19' }]);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ dayNumber: 1, mealType: 'breakfast', mealName: 'Idli', kcal: 300, protein: 10, quantity: 2, unit: 'pcs' });
    expect(notes).toEqual([['new', 'Less salt']]);
    expect(out.id).toBe('new');
  });

  it('removes the half-made copy when a meal fails to copy', async () => {
    const { svc, removed } = build({ failOnCard: 1 });
    await expect(svc.duplicate('ws', 'src', '2026-10-19', 'client-b')).rejects.toThrow('boom');
    expect(removed).toEqual(['new']);
  });
});
