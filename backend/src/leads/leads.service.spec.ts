import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { openSlots } from './call-slots';

/** Purpose checker that approves everything, for tests not about the AI check. */
const validPurpose = { checkPurpose: async () => ({ valid: true }), checkName: async () => ({ valid: true }) };

/**
 * The lead endpoint is public and sends WhatsApp, so what it accepts matters:
 * a loose phone rule would let anyone message arbitrary numbers from NUSI's
 * account. These pin the rule and the honesty of `whatsapp_sent`.
 */

function build(
  opts: { enabled?: boolean; sendOk?: boolean; verified?: boolean; emailVerified?: boolean; mailOk?: boolean } = {},
) {
  const inserted: unknown[][] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('INSERT')) inserted.push(args);
      return [{ id: 'lead-1' }];
    },
  };
  const messenger = {
    send: async (_kind: string, to: string, _params: Record<string, string>, text: string) => {
      if (!(opts.enabled ?? true)) return false;
      sent.push({ to, text });
      return opts.sendOk ?? true;
    },
  };
  const otp = { isVerified: () => opts.verified ?? true, isEmailVerified: () => opts.emailVerified ?? true };
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const mail = {
    send: async (m: { to: string; subject: string; html: string }) => {
      emails.push(m);
      return opts.mailOk ?? true;
    },
  };
  const calendar = { enabled: false, createEvent: async () => null, freeBusy: async () => [] };
  const service = new LeadsService(
    prisma as never,
    messenger as never,
    otp as never,
    mail as never,
    calendar as never,
    validPurpose as never,
  );
  return { service, inserted, sent, emails };
}

const base = {
  slot_start: openSlots([], new Date())[0],
  name: 'Priya Sharma',
  email: 'Priya@Example.com',
  phone: '9876543210',
  purpose: 'I want to move my forty clients from Excel and see diet plans',
};

describe('LeadsService.createLead with a booked slot', () => {
  function buildBooked(bookedTemplate: string | null) {
    const sent: Array<{ kind: string; text: string; params: Record<string, string> }> = [];
    const emails: Array<{ html: string }> = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string) => (sql.includes('INSERT') ? [{ id: 'lead-1' }] : []),
      $executeRawUnsafe: async () => 1,
    };
    const messenger = {
      templateFor: (kind: string) => (kind === 'lead_booked' ? bookedTemplate : 'nusi_lead_confirmation'),
      send: async (kind: string, _to: string, params: Record<string, string>, text: string) => {
        sent.push({ kind, text, params });
        return true;
      },
    };
    const otp = { isVerified: () => true, isEmailVerified: () => true };
    const mail = { send: async (m: { html: string }) => (emails.push(m), true) };
    const calendar = {
      enabled: true,
      freeBusy: async () => [],
      createEvent: async () => ({ id: 'evt-1', meetUrl: 'https://meet.google.com/abc-defg-hij' }),
    };
    const service = new LeadsService(prisma as never, messenger as never, otp as never, mail as never, calendar as never, validPurpose as never);
    return { service, sent, emails };
  }

  it('uses the booked-call template once it is configured', async () => {
    const { service, sent } = buildBooked('nusi_demo_booked');
    await service.createLead({ ...base, slot_start: openSlots([], new Date())[0] });
    expect(sent[0].kind).toBe('lead_booked');
  });

  it('keeps using the name-only confirmation until the booked-call template exists', async () => {
    const { service, sent } = buildBooked(null);
    await service.createLead({ ...base, slot_start: openSlots([], new Date())[0] });
    expect(sent[0].kind).toBe('lead_confirmation');
  });

  it('sends the call time and the Google Meet link on WhatsApp and email', async () => {
    const slot = openSlots([], new Date())[0];
    const sent: Array<{ text: string; params: Record<string, string> }> = [];
    const emails: Array<{ html: string }> = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string) => (sql.includes('INSERT') ? [{ id: 'lead-1' }] : []),
      $executeRawUnsafe: async () => 1,
    };
    const messenger = {
      templateFor: () => null,
      send: async (_k: string, _to: string, params: Record<string, string>, text: string) => {
        sent.push({ text, params });
        return true;
      },
    };
    const otp = { isVerified: () => true, isEmailVerified: () => true };
    const mail = { send: async (m: { html: string }) => (emails.push(m), true) };
    const calendar = {
      enabled: true,
      freeBusy: async () => [],
      createEvent: async () => ({ id: 'evt-1', meetUrl: 'https://meet.google.com/abc-defg-hij' }),
    };
    const service = new LeadsService(prisma as never, messenger as never, otp as never, mail as never, calendar as never, validPurpose as never);

    const res = await service.createLead({ ...base, slot_start: slot });
    expect(res.slot_start).toContain('IST');
    expect(sent[0].text).toContain(res.slot_start!);
    expect(sent[0].text).toContain('https://meet.google.com/abc-defg-hij');
    expect(sent[0].params).toMatchObject({ call_time: res.slot_start, meet_link: 'https://meet.google.com/abc-defg-hij' });
    expect(emails[0].html).toContain('href="https://meet.google.com/abc-defg-hij"');
  });
});

describe('LeadsService.createLead purpose check', () => {
  function withPurpose(verdict: { valid: boolean; message?: string }) {
    const inserted: unknown[] = [];
    const prisma = { $queryRawUnsafe: async (...args: unknown[]) => (inserted.push(args), [{ id: 'lead-1' }]) };
    const messenger = { send: async () => true };
    const otp = { isVerified: () => true, isEmailVerified: () => true };
    const mail = { send: async () => true };
    const calendar = { enabled: false, createEvent: async () => null, freeBusy: async () => [] };
    const purpose = { checkPurpose: async () => verdict, checkName: async () => ({ valid: true }) };
    const service = new LeadsService(prisma as never, messenger as never, otp as never, mail as never, calendar as never, purpose as never);
    return { service, inserted };
  }

  it('refuses a purpose the AI marks as not genuine, with its hint, and saves nothing', async () => {
    const { service, inserted } = withPurpose({ valid: false, message: 'Tell us what you would like to see.' });
    await expect(service.createLead(base)).rejects.toThrow('Tell us what you would like to see.');
    expect(inserted).toHaveLength(0);
  });

  it('refuses a name that is not a real name', async () => {
    const { service, inserted } = withPurpose({ valid: true });
    const checks = service as unknown as { inputCheck: { checkName: () => Promise<unknown> } };
    checks.inputCheck.checkName = async () => ({ valid: false, message: 'Please enter your real name.' });
    await expect(service.createLead({ ...base, name: 'asdf' })).rejects.toThrow('Please enter your real name.');
    expect(inserted).toHaveLength(0);
  });

  it('books when the purpose is genuine', async () => {
    const { service } = withPurpose({ valid: true });
    await expect(service.createLead(base)).resolves.toMatchObject({ ok: true });
  });
});

describe('LeadsService.createLead without a time', () => {
  function build(openSlotRows: Array<{ slot_start: Date }>) {
    const inserted: unknown[] = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
        if (sql.includes('INSERT')) return inserted.push(args), [{ id: 'lead-1' }];
        return openSlotRows;
      },
    };
    const calendar = { enabled: false, createEvent: async () => null, freeBusy: async () => [] };
    const service = new LeadsService(
      prisma as never,
      { send: async () => true } as never,
      { isVerified: () => true, isEmailVerified: () => true } as never,
      { send: async () => true } as never,
      calendar as never,
      validPurpose as never,
    );
    return { service, inserted };
  }

  it('refuses to book without a time while slots are open', async () => {
    const { service, inserted } = build([]);
    const { slot_start: _slot, ...noTime } = base;
    await expect(service.createLead(noTime)).rejects.toThrow('Please pick a date and time for your call.');
    expect(inserted).toHaveLength(0);
  });
});

describe('LeadsService.createLead', () => {
  it.each(['9876543210', '+91 98765 43210', '919876543210', '09876543210', '98765-43210'])(
    'accepts %s and stores it as +919876543210',
    async (phone) => {
      const { service, inserted, sent } = build();
      await service.createLead({ ...base, phone });
      expect(inserted[0][1]).toBe('+919876543210');
      expect(sent[0].to).toBe('+919876543210');
    },
  );

  it.each(['5123456789', '12345', '+1 415 555 0100', '98765432101234', 'not a number'])(
    'rejects %s without saving or messaging',
    async (phone) => {
      const { service, inserted, sent } = build();
      await expect(service.createLead({ ...base, phone })).rejects.toBeInstanceOf(BadRequestException);
      expect(inserted).toHaveLength(0);
      expect(sent).toHaveLength(0);
    },
  );

  it('lower-cases the email and greets the lead by name', async () => {
    const { service, inserted, sent } = build();
    await service.createLead(base);
    expect(inserted[0][2]).toBe('priya@example.com');
    expect(sent[0].text.startsWith('Hi Priya Sharma!')).toBe(true);
    expect(sent[0].text).toContain('- Team NUSI');
  });

  it('reports whatsapp_sent only when the send succeeded', async () => {
    expect((await build({ sendOk: true }).service.createLead(base)).whatsapp_sent).toBe(true);
    expect((await build({ sendOk: false }).service.createLead(base)).whatsapp_sent).toBe(false);
  });

  it('still saves the lead when WhatsApp is not set up', async () => {
    const { service, inserted, sent } = build({ enabled: false });
    const res = await service.createLead(base);
    expect(res.ok).toBe(true);
    expect(res.whatsapp_sent).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('emails the lead the same confirmation, saying "reply to this email"', async () => {
    const { service, emails } = build();
    const res = await service.createLead(base);
    expect(res.email_sent).toBe(true);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('priya@example.com');
    expect(emails[0].subject).toBe('Your NUSI demo request is confirmed');
    expect(emails[0].html).toContain('Hi Priya Sharma!');
    expect(emails[0].html).toContain('reply to this email');
    expect(emails[0].html).not.toContain('reply to this message');
  });

  it('still books and sends WhatsApp when the email fails', async () => {
    const { service, sent } = build({ mailOk: false });
    const res = await service.createLead(base);
    expect(res).toMatchObject({ ok: true, whatsapp_sent: true, email_sent: false });
    expect(sent).toHaveLength(1);
  });

  it('refuses a purpose shorter than 10 words', async () => {
    const { service, inserted } = build();
    await expect(service.createLead({ ...base, purpose: 'just a demo please' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.createLead({ ...base, purpose: undefined })).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toHaveLength(0);
  });

  it('refuses to book when the email is not verified', async () => {
    const { service, inserted, sent } = build({ emailVerified: false });
    await expect(service.createLead(base)).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('does not email an unverified number', async () => {
    const { service, emails } = build({ verified: false });
    await expect(service.createLead(base)).rejects.toBeInstanceOf(BadRequestException);
    expect(emails).toHaveLength(0);
  });

});

/**
 * Deleting a lead frees its slot automatically (there is no separate slots
 * table - a slot is just "no lead row holds this timestamp"). What deleting
 * does NOT do for free is cancel the Google Calendar event, so that is
 * asserted explicitly here.
 */
describe('LeadsService.deleteLead', () => {
  function buildDelete(opts: { hasEvent?: boolean; calendarEnabled?: boolean; cancelOk?: boolean } = {}) {
    const calendarEventId = opts.hasEvent ?? true ? 'gcal-event-1' : null;
    const deleted: string[] = [];
    const cancelled: string[] = [];
    const prisma = {
      $queryRawUnsafe: async (sql: string, ..._args: unknown[]) => {
        if (sql.includes('SELECT calendar_event_id')) return [{ calendar_event_id: calendarEventId }];
        return [];
      },
      $executeRawUnsafe: async (sql: string, id: string) => {
        if (sql.includes('DELETE FROM public.leads')) {
          deleted.push(id);
          return 1;
        }
        return 0;
      },
    };
    const calendar = {
      enabled: opts.calendarEnabled ?? true,
      createEvent: async () => null,
      deleteEvent: async (eventId: string) => {
        cancelled.push(eventId);
        return opts.cancelOk ?? true;
      },
    };
    const service = new LeadsService(prisma as never, {} as never, {} as never, {} as never, calendar as never, validPurpose as never);
    return { service, deleted, cancelled };
  }

  it('deletes the row and cancels the calendar event', async () => {
    const { service, deleted, cancelled } = buildDelete();
    await expect(service.deleteLead('lead-1')).resolves.toEqual({ deleted: true });
    expect(deleted).toEqual(['lead-1']);
    expect(cancelled).toEqual(['gcal-event-1']);
  });

  it('deletes the lead even when it never had a calendar event', async () => {
    const { service, deleted, cancelled } = buildDelete({ hasEvent: false });
    await expect(service.deleteLead('lead-1')).resolves.toEqual({ deleted: true });
    expect(deleted).toEqual(['lead-1']);
    expect(cancelled).toEqual([]);
  });

  it('still deletes the lead when the calendar cancel fails', async () => {
    const { service, deleted } = buildDelete({ cancelOk: false });
    await expect(service.deleteLead('lead-1')).resolves.toEqual({ deleted: true });
    expect(deleted).toEqual(['lead-1']);
  });

  it('rejects an unknown lead id', async () => {
    const prisma = {
      $queryRawUnsafe: async () => [],
      $executeRawUnsafe: async () => 0,
    };
    const calendar = { enabled: false, createEvent: async () => null, deleteEvent: async () => false, freeBusy: async () => [] };
    const service = new LeadsService(prisma as never, {} as never, {} as never, {} as never, calendar as never, validPurpose as never);
    await expect(service.deleteLead('missing')).rejects.toThrow('Lead not found.');
  });
});
