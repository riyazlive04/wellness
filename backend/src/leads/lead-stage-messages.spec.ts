import { isForwardMove, stageMessage } from './lead-stage-messages';

/** A lead should hear from us once per step forward - never on a backwards drag. */
describe('lead stage messages', () => {
  it.each([
    ['new', 'contacted', true],
    ['contacted', 'demo_done', true],
    ['new', 'demo_done', true],
    ['demo_done', 'won', true],
    ['demo_done', 'contacted', false],
    ['won', 'demo_done', false],
    ['contacted', 'contacted', false],
    ['contacted', 'new', false],
    ['demo_done', 'lost', true],
    ['lost', 'lost', false],
    ['lost', 'contacted', false],
    ['new', 'no_show', true],
    ['contacted', 'no_show', true],
    ['no_show', 'demo_done', true],
    ['demo_done', 'no_show', false],
    ['no_show', 'no_show', false],
  ] as const)('%s -> %s sends: %s', (from, to, expected) => {
    expect(isForwardMove(from, to)).toBe(expected);
  });

  it('has a message for every stage after New, addressed by name', () => {
    for (const stage of ['contacted', 'no_show', 'demo_done', 'won', 'lost'] as const) {
      const text = stageMessage(stage, 'Priya')!;
      expect(text).toContain('Priya');
      expect(text.trim().endsWith('- Team NUSI')).toBe(true);
    }
    expect(stageMessage('new', 'Priya')).toBeNull();
  });

  it('tells a lead who missed the call when it was, and how to rebook', () => {
    const text = stageMessage('no_show', 'Priya', { callTime: 'Thu, 25 Sep · 11:00 AM IST' })!;
    expect(text).toContain('Thu, 25 Sep · 11:00 AM IST');
    expect(text).toContain('https://nusi.in/#demo-form');
    expect(stageMessage('no_show', 'Priya')).not.toContain('undefined');
  });
});
