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
  ] as const)('%s -> %s sends: %s', (from, to, expected) => {
    expect(isForwardMove(from, to)).toBe(expected);
  });

  it('has a message for every stage after New, addressed by name', () => {
    for (const stage of ['contacted', 'demo_done', 'won', 'lost'] as const) {
      const text = stageMessage(stage, 'Priya')!;
      expect(text).toContain('Priya');
      expect(text.trim().endsWith('- Team NUSI')).toBe(true);
    }
    expect(stageMessage('new', 'Priya')).toBeNull();
  });
});
