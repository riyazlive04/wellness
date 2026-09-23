/**
 * The validator is the security boundary for server-driven UI: it is what
 * stands between "a workspace admin can rearrange their clients' app" and "a
 * workspace admin can point it anywhere or brick it". These tests are written
 * against the things that would actually hurt if they regressed, not for
 * coverage of the happy path.
 */
import { DEFAULT_SCREENS, defaultScreen } from './sdui.defaults';
import { SCREEN_KEYS, type ScreenKey, type UiNode, type UiScreen } from './sdui.types';
import { pruneForFeatures, validateScreen } from './sdui.validator';

/** Minimal valid home tree to mutate per-case. */
function homeTree(root: UiNode): unknown {
  return {
    version: 1,
    screen: 'home',
    revision: 1,
    data: [{ key: 'home', source: 'me.home' }],
    root,
  };
}

const messagesOf = (r: ReturnType<typeof validateScreen>) => r.errors.map((e) => e.message).join(' | ');

describe('validateScreen', () => {
  describe('the shipped defaults', () => {
    it.each(SCREEN_KEYS)('%s validates', (key) => {
      const result = validateScreen(defaultScreen(key), key);
      expect(messagesOf(result)).toBe('');
      expect(result.ok).toBe(true);
    });
  });

  describe('node allowlist', () => {
    it('rejects an unknown node type', () => {
      const result = validateScreen(
        homeTree({ id: 'a', type: 'webview' } as unknown as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('Unknown node type');
    });

    it('rejects a prop the node does not declare', () => {
      const result = validateScreen(
        homeTree({ id: 'a', type: 'text', value: 'hi', onTap: 'doSomething' } as unknown as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('has no prop "onTap"');
    });

    it('rejects a node used on the wrong screen', () => {
      // `tab` is legal only on the tabs screen.
      const result = validateScreen(
        homeTree({ id: 'a', type: 'tab', route: 'index', label: 'Today', icon: 'home' } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('not allowed on the home screen');
    });

    it('rejects an unknown built-in block', () => {
      const result = validateScreen(
        homeTree({ id: 'a', type: 'native', component: 'home.stealCredentials' } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('navigation and links', () => {
    it('rejects a route that is not in the allowlist', () => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'button',
          label: 'Go',
          action: { kind: 'navigate', href: '/admin/secrets' },
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('not a screen this app can open');
    });

    it('accepts an allowlisted route with a templated segment', () => {
      const result = validateScreen(
        homeTree({
          id: 'root',
          type: 'repeat',
          each: '{{home.messages}}',
          as: 'item',
          children: [
            {
              id: 'r',
              type: 'row',
              label: 'Open',
              action: { kind: 'navigate', href: '/(tabs)/more/program/{{item.id}}' },
            },
          ],
        } as UiNode),
        'home',
      );
      expect(messagesOf(result)).toBe('');
      expect(result.ok).toBe(true);
    });

    it('rejects a templated segment that escapes into another area', () => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'button',
          label: 'Go',
          // Two segments where the pattern allows one.
          action: { kind: 'navigate', href: '/(tabs)/more/program/{{item.id}}/edit' },
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
    });

    it.each([
      ['http://evil.test', 'plain http'],
      ['javascript:alert(1)', 'a script url'],
      ['sirah://deep/link', 'a custom scheme'],
    ])('rejects %s as an external link (%s)', (url) => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'button',
          label: 'Go',
          action: { kind: 'openUrl', url },
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('https');
    });

    it('accepts an https link', () => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'button',
          label: 'Go',
          action: { kind: 'openUrl', url: 'https://example.test/guide' },
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('bindings', () => {
    it('rejects a binding whose scope the screen never declared', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'home',
          revision: 1,
          data: [{ key: 'home', source: 'me.home' }],
          root: { id: 'a', type: 'text', value: 'Hi {{secrets.apiKey}}' },
        },
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('not a data source on this screen');
    });

    it('rejects an unknown data source', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'home',
          revision: 1,
          data: [{ key: 'x', source: 'https://evil.test/steal' }],
          root: { id: 'a', type: 'text', value: 'hi' },
        },
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('Unknown data source');
    });

    it('accepts a loop variable inside the repeat that declares it', () => {
      const result = validateScreen(
        homeTree({
          id: 'r',
          type: 'repeat',
          each: '{{home.mood}}',
          as: 'day',
          children: [{ id: 't', type: 'text', value: '{{day.mood}}' }],
        } as UiNode),
        'home',
      );
      expect(messagesOf(result)).toBe('');
      expect(result.ok).toBe(true);
    });

    it('rejects a loop variable used outside its repeat', () => {
      const result = validateScreen(
        homeTree({
          id: 'stack',
          type: 'stack',
          children: [
            {
              id: 'r',
              type: 'repeat',
              each: '{{home.mood}}',
              as: 'day',
              children: [{ id: 't', type: 'text', value: '{{day.mood}}' }],
            },
            // `day` is out of scope here.
            { id: 't2', type: 'text', value: '{{day.mood}}' },
          ],
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('structural limits', () => {
    it('rejects a tree past the node ceiling', () => {
      const children: UiNode[] = Array.from({ length: 500 }, (_, i) => ({
        id: `t${i}`,
        type: 'text',
        value: 'x',
      })) as UiNode[];
      const result = validateScreen(
        homeTree({ id: 'root', type: 'stack', children } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('exceeds');
    });

    it('rejects a tree past the depth ceiling', () => {
      let node: UiNode = { id: 'leaf', type: 'text', value: 'x' } as UiNode;
      for (let i = 0; i < 20; i++) {
        node = { id: `s${i}`, type: 'stack', children: [node] } as UiNode;
      }
      const result = validateScreen(homeTree(node), 'home');
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('Nesting');
    });

    it('rejects duplicate node ids', () => {
      const result = validateScreen(
        homeTree({
          id: 'root',
          type: 'stack',
          children: [
            { id: 'same', type: 'text', value: 'a' },
            { id: 'same', type: 'text', value: 'b' },
          ],
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('Duplicate node id');
    });

    it('assigns ids to nodes saved without one', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'home',
          revision: 1,
          data: [],
          root: { type: 'stack', children: [{ type: 'text', value: 'hi' }] },
        },
        'home',
      );
      expect(result.ok).toBe(true);
      expect(result.value!.root.id).toBeTruthy();
    });

    it('refuses reserved keys in a native prop bag', () => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'native',
          component: 'home.scoreHero',
          props: { __proto__: { polluted: true } },
        } as unknown as UiNode),
        'home',
      );
      // Either rejected outright or stripped — what must NOT happen is the key
      // surviving into the payload handed to a client renderer.
      const serialized = JSON.stringify(result.value ?? {});
      expect(serialized).not.toContain('polluted');
    });
  });

  describe('screen invariants', () => {
    it('refuses a tab bar without the home tab', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'tabs',
          revision: 1,
          data: [],
          root: {
            id: 'root',
            type: 'stack',
            children: [
              { id: 'a', type: 'tab', route: 'meals', label: 'Meals', icon: 'restaurant' },
              { id: 'b', type: 'tab', route: 'more', label: 'More', icon: 'ellipsis-horizontal' },
            ],
          },
        },
        'tabs',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('index');
    });

    it('refuses a duplicated tab', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'tabs',
          revision: 1,
          data: [],
          root: {
            id: 'root',
            type: 'stack',
            children: [
              { id: 'a', type: 'tab', route: 'index', label: 'Today', icon: 'home' },
              { id: 'b', type: 'tab', route: 'index', label: 'Again', icon: 'home' },
            ],
          },
        },
        'tabs',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('listed twice');
    });

    it('refuses an onboarding field the submit endpoint would discard', () => {
      const result = validateScreen(
        {
          version: 1,
          screen: 'onboarding',
          revision: 1,
          data: [],
          root: {
            id: 'root',
            type: 'stack',
            children: [
              {
                id: 's',
                type: 'step',
                key: 'basics',
                title: 'Basics',
                children: [
                  { id: 'f', type: 'field', key: 'salary', label: 'Salary', kind: 'number' },
                ],
              },
            ],
          },
        },
        'onboarding',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('not a profile field');
    });

    it('refuses onboarding-only actions on other screens', () => {
      const result = validateScreen(
        homeTree({
          id: 'a',
          type: 'button',
          label: 'Finish',
          action: { kind: 'submitOnboarding' },
        } as UiNode),
        'home',
      );
      expect(result.ok).toBe(false);
      expect(messagesOf(result)).toContain('only works during onboarding');
    });
  });
});

describe('pruneForFeatures', () => {
  const screenWith = (root: UiNode): UiScreen => ({
    version: 1,
    screen: 'more',
    revision: 1,
    data: [],
    root,
  });

  it('removes a node whose feature the plan lacks', () => {
    const pruned = pruneForFeatures(
      screenWith({
        id: 'root',
        type: 'stack',
        children: [
          {
            id: 'community',
            type: 'row',
            label: 'Community',
            when: { op: 'feature', feature: 'community' },
          },
          { id: 'settings', type: 'row', label: 'Settings' },
        ],
      } as UiNode),
      ['calorie_counting'],
    );

    const json = JSON.stringify(pruned);
    expect(json).not.toContain('Community');
    expect(json).toContain('Settings');
  });

  it('keeps the node and drops the now-settled guard when the plan has it', () => {
    const pruned = pruneForFeatures(
      screenWith({
        id: 'root',
        type: 'stack',
        children: [
          {
            id: 'community',
            type: 'row',
            label: 'Community',
            when: { op: 'feature', feature: 'community' },
          },
        ],
      } as UiNode),
      ['community'],
    );

    const row = (pruned.root as { children: UiNode[] }).children[0];
    expect(row.id).toBe('community');
    expect(row.when).toBeUndefined();
  });

  it('leaves data-dependent conditions for the device to evaluate', () => {
    const pruned = pruneForFeatures(
      screenWith({
        id: 'root',
        type: 'stack',
        children: [
          {
            id: 'x',
            type: 'row',
            label: 'Streak',
            when: { op: 'gt', left: '{{home.snapshot.streakDays}}', right: 0 },
          },
        ],
      } as UiNode),
      ['community'],
    );

    const row = (pruned.root as { children: UiNode[] }).children[0];
    expect(row.when).toEqual({ op: 'gt', left: '{{home.snapshot.streakDays}}', right: 0 });
  });

  it('collapses an if whose feature branch is settled', () => {
    const pruned = pruneForFeatures(
      screenWith({
        id: 'root',
        type: 'stack',
        children: [
          {
            id: 'gate',
            type: 'if',
            cond: { op: 'feature', feature: 'recipes' },
            then: [{ id: 'yes', type: 'row', label: 'Recipes' }],
            else: [{ id: 'no', type: 'row', label: 'Upgrade' }],
          },
        ],
      } as UiNode),
      [],
    );

    const json = JSON.stringify(pruned);
    expect(json).toContain('Upgrade');
    expect(json).not.toContain('Recipes');
  });

  it('produces trees that still validate', () => {
    for (const key of SCREEN_KEYS) {
      const pruned = pruneForFeatures(defaultScreen(key), ['community', 'recipes']);
      const result = validateScreen(pruned, key as ScreenKey);
      expect(messagesOf(result)).toBe('');
    }
  });
});

describe('DEFAULT_SCREENS', () => {
  it('covers every screen key', () => {
    expect(Object.keys(DEFAULT_SCREENS).sort()).toEqual([...SCREEN_KEYS].sort());
  });

  it('hands out copies, so a caller cannot mutate the shared default', () => {
    const a = defaultScreen('home');
    a.root.id = 'mutated';
    expect(defaultScreen('home').root.id).not.toBe('mutated');
  });
});
