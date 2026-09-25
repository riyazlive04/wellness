import { LeadRemindersService, REMINDERS, type ReminderKey } from './lead-reminders.service';

/** Reminders go once, with the call time and Meet link, on the channels available. */
function build(opts: { template?: string | null; due?: Array<Record<string, unknown>> } = {}) {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const whatsapp: Array<{ kind: string; params: Record<string, string>; text: string }> = [];
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      queries.push({ sql, args });
      return opts.due ?? [];
    },
  };
  const messenger = {
    templateFor: () => (opts.template === undefined ? 'nusi_demo_reminder' : opts.template),
    send: async (kind: string, _to: string, params: Record<string, string>, text: string) => {
      whatsapp.push({ kind, params, text });
      return true;
    },
  };
  const mail = {
    send: async (m: { to: string; subject: string; html: string }) => {
      emails.push(m);
      return true;
    },
  };
  const service = new LeadRemindersService(prisma as never, messenger as never, mail as never);
  return { service, queries, whatsapp, emails };
}

const reminder = (key: ReminderKey) => REMINDERS.find((r) => r.key === key)!;

const lead = {
  id: 'lead-1',
  name: 'Priya',
  phone: '+919876543210',
  email: 'priya@example.com',
  slot_start: new Date('2026-09-25T05:30:00Z'), // 11:00 IST
  meet_url: 'https://meet.google.com/abc-defg-hij',
};

describe('LeadRemindersService', () => {
  it('reminds a day, an hour and five minutes before', () => {
    expect(REMINDERS.map((r) => [r.key, r.minutesBefore])).toEqual([
      ['1d', 1440],
      ['1h', 60],
      ['5m', 5],
    ]);
  });

  it('claims due leads and records the reminder in one statement', async () => {
    const { service, queries } = build();
    await service.sendReminder(reminder('1h'), true);
    expect(queries[0].sql).toContain('UPDATE public.leads');
    expect(queries[0].sql).toContain('->>$1::text) IS NULL');
    expect(queries[0].args).toEqual(['1h', 15, 60, null]);
  });

  it('sends the day-before reminder only for calls booked more than a day ahead', async () => {
    const { service, queries } = build();
    await service.sendReminder(reminder('1d'), true);
    expect(queries[0].sql).toContain('created_at <= slot_start - make_interval(mins => $4::int)');
    expect(queries[0].args).toEqual(['1d', 180, 1440, 1440]);
  });

  it('sends the day-before reminder on WhatsApp and by email, with the time and Meet link', async () => {
    const { service, whatsapp, emails } = build({ due: [lead] });
    await service.sendReminder(reminder('1d'), true);
    expect(whatsapp[0].kind).toBe('reminder_1d');
    expect(whatsapp[0].params.meet_link).toBe(lead.meet_url);
    expect(whatsapp[0].text).toContain('tomorrow');
    expect(emails[0].to).toBe('priya@example.com');
    expect(emails[0].subject).toMatch(/tomorrow/i);
    expect(emails[0].html).toContain('11:00');
  });

  it('emails the reminder while the WhatsApp template is still awaiting approval', async () => {
    const { service, whatsapp, emails } = build({ template: null, due: [lead] });
    await service.sendDue();
    expect(whatsapp).toHaveLength(0);
    expect(emails.length).toBeGreaterThan(0);
  });

  it('does not email the five-minute reminder', async () => {
    const { service, emails, whatsapp } = build({ due: [lead] });
    await service.sendReminder(reminder('5m'), true);
    expect(whatsapp).toHaveLength(1);
    expect(emails).toHaveLength(0);
  });

  it('skips the five-minute reminder entirely - recording nothing - until its template exists', async () => {
    const { service, queries } = build({ template: null, due: [lead] });
    await service.sendDue();
    expect(queries.map((q) => q.args[0])).toEqual(['1d', '1h']);
  });

  it('points older bookings without a saved link to their calendar invite', async () => {
    const { service, whatsapp } = build({ due: [{ ...lead, meet_url: null }] });
    await service.sendReminder(reminder('1h'), true);
    expect(whatsapp[0].params.meet_link).toContain('calendar invite');
  });
});
