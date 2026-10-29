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

/**
 * The precision trap, found by measuring against the live API.
 *
 * Postgres stores timestamps to microseconds; a JavaScript Date holds only
 * milliseconds. So the cursor a client echoes back is the row's own
 * updated_at with the sub-millisecond digits lost, and a bare `updated_at >
 * cursor` reports that row as newer than itself - forever. The symptom was an
 * "idle" poll returning 1 message instead of 0, every 4 seconds.
 *
 * The fix truncates both sides to milliseconds, which is the precision the
 * client can actually represent.
 */
describe('cursor precision', () => {
  const toMs = (iso: string) => new Date(iso).toISOString();          // what JS can carry
  const truncd = (iso: string) => iso.replace(/(\.\d{3})\d+/, '$1');  // date_trunc('milliseconds')

  it('a JavaScript round-trip drops microseconds', () => {
    expect(toMs('2026-09-25T07:15:37.002318Z')).toBe('2026-09-25T07:15:37.002Z');
  });

  /** Compare as instants, the way Postgres does — not as strings. */
  const after = (a: string, b: string) => new Date(a).getTime() > new Date(b).getTime();

  /**
   * Microseconds as Postgres actually compares them. `Date` cannot hold them,
   * so the sub-millisecond part is carried separately here.
   */
  const afterMicros = (storedIso: string, micros: number, cursorIso: string) => {
    const base = new Date(storedIso).getTime();
    const cur = new Date(cursorIso).getTime();
    return base > cur || (base === cur && micros > 0);
  };

  it('plain greater-than would re-send the newest message on every poll', () => {
    // The stored value is ...002318; the cursor that comes back is ...002.
    // Postgres sees 318 microseconds of difference and calls the row newer
    // than its own cursor, every 4 seconds, forever.
    const stored = '2026-09-25T07:15:37.002Z';
    expect(afterMicros(stored, 318, toMs('2026-09-25T07:15:37.002318Z'))).toBe(true);
  });

  it('truncating both sides makes an idle poll return nothing', () => {
    const stored = '2026-09-25T07:15:37.002318Z';
    expect(after(truncd(stored), toMs(stored))).toBe(false);
  });

  it('still delivers a genuinely newer message', () => {
    const cursor = toMs('2026-09-25T07:15:37.002318Z');
    expect(after(truncd('2026-09-25T07:15:37.004000Z'), cursor)).toBe(true);
  });

  it('delays, never drops, a change inside the same millisecond', () => {
    // Two edits 300 microseconds apart collapse to one millisecond, so the
    // later is not in THIS poll. It arrives on the next one, because any
    // further change moves updated_at forward again - a 4-second delay in the
    // worst case, not a lost message.
    const cursor = truncd('2026-09-25T07:15:37.002318Z');
    expect(after(truncd('2026-09-25T07:15:37.002600Z'), cursor)).toBe(false);
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

/**
 * Optimistic rows meeting the incremental cursor.
 *
 * Applying a send to the screen immediately is what makes the chat feel fast,
 * but a `tmp_` row has no server `updated_at` - so the cursor and the merge
 * both have to account for one being on screen.
 */
describe('optimistic rows and the cursor', () => {
  const cursor = (held: Array<Partial<Msg> & { id: string }>): string | undefined => {
    let max: string | undefined;
    let sawServerRow = false;
    for (const m of held) {
      if (m.id.startsWith('tmp_')) continue;
      if (!m.updated_at) return undefined;
      sawServerRow = true;
      if (!max || m.updated_at > max) max = m.updated_at;
    }
    return sawServerRow ? max : undefined;
  };

  it('ignores the optimistic row instead of giving up on the cursor', () => {
    // Abandoning the cursor would drop the thread back to full fetches for as
    // long as one send is in flight - exactly when traffic matters least.
    const held = [
      { id: '1', updated_at: '2026-10-28T10:00:00Z' },
      { id: 'tmp_abc' },
    ];
    expect(cursor(held)).toBe('2026-10-28T10:00:00Z');
  });

  it('falls back to a full fetch when a REAL row lacks updated_at', () => {
    // An older server. Wasteful, but correct.
    expect(cursor([{ id: '1' }, { id: '2', updated_at: '2026-10-28T10:00:00Z' }])).toBeUndefined();
  });

  it('asks for everything when only an optimistic row is held', () => {
    expect(cursor([{ id: 'tmp_abc' }])).toBeUndefined();
  });
});

describe('a confirmed send must not show twice', () => {
  /** Mirrors the merge, including the tmp_ reconciliation. */
  const merge = (
    held: Array<Msg & { sender_type?: string }>,
    delta: Array<Msg & { sender_type?: string }>,
  ) => {
    const byId = new Map(held.map((m) => [m.id, m]));
    for (const m of delta) byId.set(m.id, m);
    const confirmed = new Set(
      delta.filter((m) => m.sender_type === 'client').map((m) => m.content),
    );
    for (const [key, m] of byId) {
      if (key.startsWith('tmp_') && m.sender_type === 'client' && confirmed.has(m.content)) {
        byId.delete(key);
      }
    }
    return [...byId.values()];
  };

  const at = '2026-10-28T10:00:00Z';

  it('drops the placeholder when the saved row arrives by poll', () => {
    // The send resolves after a poll has already delivered the saved row. Both
    // are present for an instant, and the user would see their message twice.
    const held = [{ id: 'tmp_x', content: 'hello', created_at: at, updated_at: at, sender_type: 'client' }];
    const delta = [{ id: 'real1', content: 'hello', created_at: at, updated_at: at, sender_type: 'client' }];
    const out = merge(held, delta);
    expect(out.map((m) => m.id)).toEqual(['real1']);
  });

  it('keeps a placeholder whose message has not landed yet', () => {
    const held = [{ id: 'tmp_x', content: 'still sending', created_at: at, updated_at: at, sender_type: 'client' }];
    const delta = [{ id: 'real1', content: 'something else', created_at: at, updated_at: at, sender_type: 'client' }];
    expect(merge(held, delta).map((m) => m.id)).toEqual(['tmp_x', 'real1']);
  });

  it('does not drop a placeholder because the OTHER side said the same words', () => {
    // An incoming admin message reading "ok" must not cancel the client's own
    // unsent "ok".
    const held = [{ id: 'tmp_x', content: 'ok', created_at: at, updated_at: at, sender_type: 'client' }];
    const delta = [{ id: 'real1', content: 'ok', created_at: at, updated_at: at, sender_type: 'admin' }];
    expect(merge(held, delta).map((m) => m.id)).toContain('tmp_x');
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
