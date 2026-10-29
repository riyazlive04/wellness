/**
 * Incremental thread sync.
 *
 * An open conversation polled the whole thread every 4 seconds. With
 * attachments inlined as base64 that meant re-downloading about a megabyte
 * each time; even without them it re-sends every message to learn that
 * nothing changed.
 *
 * The fix is a cursor, and the cursor is `updated_at`, not `created_at`. These
 * pin why, and pin the merge - a merge bug here loses a message, which is
 * worse than any amount of extra traffic.
 */

interface Msg {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  metadata?: { deleted_at?: string; reactions?: Record<string, string> };
}

/** Mirrors the cursor the client sends: the newest updated_at it holds. */
const cursorOf = (held: Msg[]): string | undefined =>
  held.reduce<string | undefined>(
    (max, m) => (!max || m.updated_at > max ? m.updated_at : max),
    undefined,
  );

/** Mirrors the SQL predicate: updated_at > cursor. */
const changedSince = (all: Msg[], cursor?: string): Msg[] =>
  all.filter((m) => !cursor || m.updated_at > cursor);

/**
 * Mirrors the client-side merge: replace by id, append what is new, and keep
 * the thread in send order.
 */
const merge = (held: Msg[], incoming: Msg[]): Msg[] => {
  const byId = new Map(held.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
};

const msg = (id: string, at: string, over?: Partial<Msg>): Msg => ({
  id, content: `m${id}`, created_at: at, updated_at: at, ...over,
});

describe('the cursor', () => {
  it('is the newest change held, not the newest message', () => {
    // An old message edited a moment ago is the real high-water mark. Taking
    // the newest created_at instead would re-request that edit forever.
    const held = [
      msg('1', '2026-10-01T10:00:00Z', { updated_at: '2026-10-29T09:00:00Z' }),
      msg('2', '2026-10-28T10:00:00Z'),
    ];
    expect(cursorOf(held)).toBe('2026-10-29T09:00:00Z');
  });

  it('is absent on a first load, which asks for everything', () => {
    expect(cursorOf([])).toBeUndefined();
    expect(changedSince([msg('1', '2026-10-01T10:00:00Z')], undefined)).toHaveLength(1);
  });
});

describe('what comes back', () => {
  const all = [
    msg('1', '2026-10-28T10:00:00Z'),
    msg('2', '2026-10-28T11:00:00Z'),
  ];

  it('is nothing when nothing changed — the whole point', () => {
    expect(changedSince(all, cursorOf(all))).toHaveLength(0);
  });

  it('is just the new message when one arrives', () => {
    const next = [...all, msg('3', '2026-10-28T12:00:00Z')];
    const delta = changedSince(next, cursorOf(all));
    expect(delta.map((m) => m.id)).toEqual(['3']);
  });

  it('includes an OLD message that was edited', () => {
    // The reason the cursor is updated_at. On a created_at cursor this edit
    // would never be delivered, and the two screens would disagree forever.
    const edited = [
      { ...all[0], content: 'corrected', updated_at: '2026-10-29T09:00:00Z' },
      all[1],
    ];
    const delta = changedSince(edited, cursorOf(all));
    expect(delta.map((m) => m.id)).toEqual(['1']);
    expect(delta[0].content).toBe('corrected');
  });

  it('includes a reaction, which changes only metadata', () => {
    const reacted = [
      { ...all[0], updated_at: '2026-10-29T09:00:00Z', metadata: { reactions: { admin: '👍' } } },
      all[1],
    ];
    expect(changedSince(reacted, cursorOf(all)).map((m) => m.id)).toEqual(['1']);
  });

  it('includes a soft delete, so it disappears on the other screen too', () => {
    // Deletes are a metadata flag, never a removed row - which is also why a
    // cursor can never miss one.
    const deleted = [
      { ...all[0], updated_at: '2026-10-29T09:00:00Z', metadata: { deleted_at: '2026-10-29T09:00:00Z' } },
      all[1],
    ];
    const delta = changedSince(deleted, cursorOf(all));
    expect(delta[0].metadata?.deleted_at).toBeTruthy();
  });
});

describe('merging a delta into what is on screen', () => {
  const held = [
    msg('1', '2026-10-28T10:00:00Z'),
    msg('2', '2026-10-28T11:00:00Z'),
  ];

  it('appends a new message', () => {
    const out = merge(held, [msg('3', '2026-10-28T12:00:00Z')]);
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('replaces an edited message in place, not as a duplicate', () => {
    const out = merge(held, [{ ...held[0], content: 'corrected', updated_at: '2026-10-29T09:00:00Z' }]);
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe('corrected');
  });

  it('keeps send order when an old message is edited', () => {
    // Sorting by updated_at would jump the edited message to the bottom of the
    // conversation, which reads as a brand-new reply that nobody sent.
    const out = merge(held, [{ ...held[0], updated_at: '2026-10-29T09:00:00Z' }]);
    expect(out.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('is a no-op for an empty delta', () => {
    expect(merge(held, [])).toHaveLength(2);
  });

  it('does not drop anything already on screen', () => {
    // The delta is a patch, never the full truth - treating it as the whole
    // thread would blank the conversation on the first quiet poll.
    const out = merge(held, [msg('3', '2026-10-28T12:00:00Z')]);
    expect(out.map((m) => m.id)).toContain('1');
    expect(out.map((m) => m.id)).toContain('2');
  });

  it('survives the same delta arriving twice', () => {
    const delta = [msg('3', '2026-10-28T12:00:00Z')];
    const out = merge(merge(held, delta), delta);
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3']);
  });
});
