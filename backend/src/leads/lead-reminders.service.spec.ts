import { LeadRemindersService, REMINDERS } from './lead-reminders.service';

/** Reminders go once, with the call time and Meet link, and only once their template exists. */
function build(opts: { template?: string | null; due?: Array<Record<string, unknown>> } = {}) {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const sent: Array<{ kind: string; to: string; params: Record<string, string>; text: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      queries.push({ sql, args });
      return opts.due ?? [];
    },
  };
  const messenger = {
    templateFor: () => (opts.template === undefined ? 'nusi_demo_reminder' : opts.template),
    send: async (kind: string, to: string, params: Record<string, string>, text: string) => {
      sent.push({ kind, to, params, text });
      return true;
    },
  };
  return { service: new LeadRemindersService(prisma as never, messenger as never), queries, sent };
}

const lead = {
  id: 'lead-1',
  name: 'Priya',
  phone: '+919876543210',
  slot_start: new Date('2026-09-25T05:30:00Z'), // 11:00 IST
  meet_url: 'https://meet.google.com/abc-defg-hij',
};

describe('LeadRemindersService', () => {
  it('sends 1 hour and 5 minutes before', () => {
    expect(REMINDERS.map((r) => [r.key, r.minutesBefore])).toEqual([
      ['1h', 60],
      ['5m', 5],
    ]);
  });

  it('claims due leads and records the reminder in one statement', async () => {
    const { service, queries } = build();
    await service.sendReminder(REMINDERS[0]);
    expect(queries[0].sql).toContain('UPDATE public.leads');
    expect(queries[0].sql).toContain("->>$1::text) IS NULL");
    expect(queries[0].args).toEqual(['1h', 15, 60]);
  });

  it('messages each due lead with the time and Meet link', async () => {
    const { service, sent } = build({ due: [lead] });
    await service.sendReminder(REMINDERS[1]);
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe('reminder_5m');
    expect(sent[0].params.call_time).toContain('11:00');
    expect(sent[0].params.meet_link).toBe(lead.meet_url);
    expect(sent[0].text).toContain('starts in 5 minutes');
  });

  it('points older bookings without a saved link to their calendar invite', async () => {
    const { service, sent } = build({ due: [{ ...lead, meet_url: null }] });
    await service.sendReminder(REMINDERS[0]);
    expect(sent[0].params.meet_link).toContain('calendar invite');
  });

  it('does nothing - and records nothing - until the template is configured', async () => {
    const { service, queries, sent } = build({ template: null, due: [lead] });
    await service.sendDue();
    expect(queries).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
