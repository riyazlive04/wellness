import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';

/**
 * The lead endpoint is public and sends WhatsApp, so what it accepts matters:
 * a loose phone rule would let anyone message arbitrary numbers from NUSI's
 * account. These pin the rule and the honesty of `whatsapp_sent`.
 */

function build(opts: { enabled?: boolean; sendOk?: boolean; verified?: boolean; mailOk?: boolean } = {}) {
  const inserted: unknown[][] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (_sql: string, ...args: unknown[]) => {
      inserted.push(args);
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
  const otp = { isVerified: () => opts.verified ?? true };
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const mail = {
    send: async (m: { to: string; subject: string; html: string }) => {
      emails.push(m);
      return opts.mailOk ?? true;
    },
  };
  const service = new LeadsService(prisma as never, messenger as never, otp as never, mail as never);
  return { service, inserted, sent, emails };
}

const base = { name: 'Priya Sharma', email: 'Priya@Example.com', phone: '9876543210' };

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

  it('does not email an unverified number', async () => {
    const { service, emails } = build({ verified: false });
    await expect(service.createLead(base)).rejects.toBeInstanceOf(BadRequestException);
    expect(emails).toHaveLength(0);
  });

});
