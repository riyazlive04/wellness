import { UsageDetailService, featureOf } from './usage-detail.service';

/** Where a practice's AI credits and storage go. */

describe('featureOf', () => {
  it('names AI features the way a practice owner would', () => {
    expect(featureOf('vision', null).label).toBe('Plate Vision photo analysis');
    expect(featureOf('voice', null).label).toBe('Voice notes');
    expect(featureOf('chat', 'meal_macro_estimate').label).toBe('Estimate with AI (meal nutrition)');
    expect(featureOf('chat', 'new_thing').label).toBe('New thing');
    expect(featureOf('chat', null).label).toBe('Other AI');
  });
});

describe('UsageDetailService.ai', () => {
  const at = new Date('2026-10-12T05:00:00Z');
  const events = [
    { service: 'vision', feature: null, user_id: 'u-client', status: 'success', created_at: at },
    { service: 'vision', feature: null, user_id: 'u-client', status: 'success', created_at: at },
    { service: 'chat', feature: 'meal_macro_estimate', user_id: 'u-owner', status: 'success', created_at: at },
    { service: 'chat', feature: 'meal_macro_estimate', user_id: 'u-owner', status: 'error', created_at: at },
    { service: 'chat', feature: 'weekly_summary', user_id: null, status: 'success', created_at: at },
  ];
  const people = [
    { id: 'u-client', client_name: 'Imthiyaz Ahmed', profile_name: null, meta_name: null, email: 'i@x.in' },
    { id: 'u-owner', client_name: null, profile_name: 'Syed', meta_name: null, email: 's@x.in' },
  ];
  const prisma = {
    $queryRawUnsafe: async (sql: string) => (sql.includes('ai_usage_events') ? events : people),
  };

  it('counts successful calls by feature and by person; failed calls are not charged', async () => {
    const out = await new UsageDetailService(prisma as never).ai('ws');
    expect(out.used).toBe(4);
    expect(out.failed).toBe(1);
    expect(out.byFeature).toEqual([
      { key: 'plate_vision', label: 'Plate Vision photo analysis', count: 2 },
      { key: 'meal_macro_estimate', label: 'Estimate with AI (meal nutrition)', count: 1 },
      { key: 'weekly_summary', label: 'Weekly client summaries', count: 1 },
    ]);
    expect(out.byPerson).toEqual([
      { name: 'Imthiyaz Ahmed', kind: 'client', count: 2 },
      { name: 'Syed', kind: 'staff', count: 1 },
      { name: 'Automatic (NUSI)', kind: 'system', count: 1 },
    ]);
    expect(out.recent).toHaveLength(5);
    expect(out.recent[3]).toMatchObject({ person: 'Syed', ok: false });
  });
});
