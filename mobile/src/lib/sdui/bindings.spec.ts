/**
 * Binding resolution runs against data that arrived over the network, inside a
 * layout that also arrived over the network. It is the one place in the app
 * where a remote string chooses which property gets read, so the path walk is
 * the thing these tests exist to hold down — everything else here is about the
 * renderer not blowing up on absent data, which is the normal case on a cold
 * start rather than an error.
 */
import { evaluate, interpolate, resolveArray, resolveNumber, resolveValue } from './bindings';
import type { UiCondition } from './types';

const scope = {
  home: {
    profile: { name: 'Priya Sharma', age: 32 },
    snapshot: { score: 82, streakDays: 0, waterMl: 1750, sleepHours: null },
    mood: [{ date: '2026-09-23', mood: 4 }],
    messages: [],
    program: null,
    tags: ['weight loss', 'sleep'],
  },
};

describe('path resolution', () => {
  it('reads a nested value', () => {
    expect(interpolate('Hi {{home.profile.name}}.', scope)).toBe('Hi Priya Sharma.');
  });

  it('indexes into an array', () => {
    expect(interpolate('{{home.mood[0].mood}}', scope)).toBe('4');
  });

  it('renders a missing path as empty rather than "undefined"', () => {
    expect(interpolate('Hi {{home.profile.nickname}}.', scope)).toBe('Hi .');
  });

  it('survives walking through a null', () => {
    expect(interpolate('{{home.program.title}}', scope)).toBe('');
  });

  it('leaves text with no bindings untouched', () => {
    expect(interpolate('Quick actions', scope)).toBe('Quick actions');
  });

  it('substitutes several holes in one string', () => {
    expect(interpolate('{{home.profile.name}} is {{home.profile.age}}', scope)).toBe(
      'Priya Sharma is 32',
    );
  });

  describe('cannot climb out of the data', () => {
    // A layout is remote input. Without own-property checks, a path like
    // `constructor.prototype` turns a template resolver into a read primitive
    // on JavaScript's own object graph.
    it.each([
      '{{home.__proto__}}',
      '{{home.constructor}}',
      '{{home.constructor.prototype}}',
      '{{home.profile.__proto__.polluted}}',
      '{{home.profile.constructor.name}}',
    ])('%s resolves to nothing', (template) => {
      expect(interpolate(template, scope)).toBe('');
    });

    it('does not read inherited properties', () => {
      const inherited = Object.create({ secret: 'leaked' }) as Record<string, unknown>;
      inherited.own = 'fine';
      const s = { data: inherited };

      expect(interpolate('{{data.own}}', s)).toBe('fine');
      expect(interpolate('{{data.secret}}', s)).toBe('');
    });

    it('does not let a global leak through a bare path', () => {
      expect(interpolate('{{process.env.HOME}}', scope)).toBe('');
      expect(interpolate('{{globalThis.process}}', scope)).toBe('');
    });
  });
});

describe('fallbacks', () => {
  it('uses ?? when the path misses', () => {
    expect(interpolate('Hi {{home.profile.nickname ?? there}}.', scope)).toBe('Hi there.');
  });

  it('uses ?? when the value is an empty string', () => {
    expect(interpolate('{{x.blank ?? fallback}}', { x: { blank: '' } })).toBe('fallback');
  });

  it('prefers the real value over the fallback', () => {
    expect(interpolate('{{home.profile.name ?? there}}', scope)).toBe('Priya Sharma');
  });

  it('does NOT treat 0 as missing', () => {
    // streakDays is a real zero, not an absent value — showing the fallback
    // here would turn "no streak yet" into whatever placeholder was written.
    expect(interpolate('{{home.snapshot.streakDays ?? none}}', scope)).toBe('0');
  });
});

describe('filters', () => {
  it('rounds', () => {
    expect(interpolate('{{x.v | round}}', { x: { v: 4.6 } })).toBe('5');
  });

  it('counts an array', () => {
    expect(interpolate('{{home.tags | count}}', scope)).toBe('2');
  });

  it('upper/lowercases', () => {
    expect(interpolate('{{home.profile.name | upper}}', scope)).toBe('PRIYA SHARMA');
    expect(interpolate('{{home.profile.name | lower}}', scope)).toBe('priya sharma');
  });

  it('renders an unparseable date as empty rather than "Invalid Date"', () => {
    expect(interpolate('{{x.d | date}}', { x: { d: 'not-a-date' } })).toBe('');
  });

  it('leaves a value alone when the filter does not apply to it', () => {
    expect(interpolate('{{x.v | round}}', { x: { v: 'abc' } })).toBe('abc');
  });
});

describe('typed resolution', () => {
  it('resolveValue keeps the raw type for a whole-string binding', () => {
    expect(resolveValue('{{home.snapshot.score}}', scope)).toBe(82);
    expect(resolveValue('{{home.tags}}', scope)).toEqual(['weight loss', 'sleep']);
  });

  it('resolveNumber coerces and falls back', () => {
    expect(resolveNumber('{{home.snapshot.waterMl}}', scope)).toBe(1750);
    expect(resolveNumber('{{home.nope}}', scope, 7)).toBe(7);
    expect(resolveNumber('{{home.profile.name}}', scope, -1)).toBe(-1);
  });

  it('resolveArray reads anything non-array as empty', () => {
    expect(resolveArray('{{home.mood}}', scope)).toHaveLength(1);
    expect(resolveArray('{{home.profile}}', scope)).toEqual([]);
    expect(resolveArray('{{home.missing}}', scope)).toEqual([]);
  });
});

describe('conditions', () => {
  const check = (c: UiCondition) => evaluate(c, scope);

  it('an absent condition always passes', () => {
    expect(evaluate(undefined, scope)).toBe(true);
  });

  it('truthy / empty', () => {
    expect(check({ op: 'truthy', left: '{{home.profile.name}}' })).toBe(true);
    expect(check({ op: 'truthy', left: '{{home.messages}}' })).toBe(false);
    expect(check({ op: 'truthy', left: '{{home.program}}' })).toBe(false);
    expect(check({ op: 'empty', left: '{{home.messages}}' })).toBe(true);
  });

  it('treats a real zero as falsy but a populated array as truthy', () => {
    expect(check({ op: 'truthy', left: '{{home.snapshot.streakDays}}' })).toBe(false);
    expect(check({ op: 'truthy', left: '{{home.mood}}' })).toBe(true);
  });

  it('numeric comparison', () => {
    expect(check({ op: 'gt', left: '{{home.snapshot.score}}', right: 50 })).toBe(true);
    expect(check({ op: 'lte', left: '{{home.snapshot.score}}', right: 50 })).toBe(false);
  });

  it('a non-numeric operand compares false rather than throwing', () => {
    expect(check({ op: 'gt', left: '{{home.profile.name}}', right: 5 })).toBe(false);
    expect(check({ op: 'gt', left: '{{home.missing}}', right: 5 })).toBe(false);
  });

  it('equality crosses the string/number boundary', () => {
    // Ids and counts arrive as a string in one payload and a number in the
    // next; being strict here yields conditions that mysteriously never fire.
    expect(check({ op: 'eq', left: '{{home.profile.age}}', right: 32 })).toBe(true);
    expect(check({ op: 'eq', left: '{{home.profile.age}}', right: '32' })).toBe(true);
    expect(check({ op: 'ne', left: '{{home.profile.age}}', right: 33 })).toBe(true);
  });

  it('contains works on arrays and on strings', () => {
    expect(check({ op: 'contains', left: '{{home.tags}}', right: 'sleep' })).toBe(true);
    expect(check({ op: 'contains', left: '{{home.tags}}', right: 'cardio' })).toBe(false);
    expect(check({ op: 'contains', left: '{{home.profile.name}}', right: 'priya' })).toBe(true);
  });

  it('and / or / not', () => {
    const yes: UiCondition = { op: 'truthy', left: '{{home.profile.name}}' };
    const no: UiCondition = { op: 'truthy', left: '{{home.messages}}' };

    expect(check({ op: 'and', of: [yes, no] })).toBe(false);
    expect(check({ op: 'or', of: [yes, no] })).toBe(true);
    expect(check({ op: 'not', of: no })).toBe(true);
  });

  it('a feature gate reads true, because the server already pruned the losers', () => {
    // Anything still in the tree passed the server-side check. Showing it is
    // the safe failure: the screen behind it enforces its own entitlement.
    expect(check({ op: 'feature', feature: 'community' })).toBe(true);
  });
});

describe('malformed templates degrade quietly', () => {
  it.each([
    ['{{}}', ''],
    ['{{   }}', ''],
    ['{{home..profile}}', ''],
    ['{{ home.profile.name }}', 'Priya Sharma'],
  ])('%s → %s', (template, expected) => {
    expect(interpolate(template, scope)).toBe(expected);
  });

  it('renders an object binding as empty rather than [object Object]', () => {
    expect(interpolate('{{home.profile}}', scope)).toBe('');
  });

  it('renders an array binding as its length', () => {
    expect(interpolate('{{home.tags}}', scope)).toBe('2');
  });
});
