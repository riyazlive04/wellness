import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';

/**
 * The lead endpoint is public and sends WhatsApp, so what it accepts matters:
 * a loose phone rule would let anyone message arbitrary numbers from NUSI's
 * account. These pin the rule and the honesty of `whatsapp_sent`.
 */

function build(opts: { enabled?: boolean; sendOk?: boolean; onWhatsapp?: boolean | null } = {}) {
  const inserted: unknown[][] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (_sql: string, ...args: unknown[]) => {
      inserted.push(args);
      return [{ id: 'lead-1' }];
    },
  };
  const whatsapp = {
    enabled: opts.enabled ?? true,
    sendPlatformText: async (m: { to: string; text: string }) => {
      sent.push(m);
      return opts.sendOk ?? true;
    },
    isOnWhatsapp: async () => (opts.onWhatsapp === undefined ? true : opts.onWhatsapp),
  };
  const service = new LeadsService(prisma as never, whatsapp as never);
  return { service, inserted, sent };
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

  describe('checkWhatsapp', () => {
    it('passes the answer through, including "unknown"', async () => {
      expect(await build({ onWhatsapp: true }).service.checkWhatsapp('9876543210')).toEqual({ onWhatsapp: true });
      expect(await build({ onWhatsapp: false }).service.checkWhatsapp('+91 98765 43210')).toEqual({ onWhatsapp: false });
      expect(await build({ onWhatsapp: null }).service.checkWhatsapp('9876543210')).toEqual({ onWhatsapp: null });
    });

    it('refuses to look up anything but an Indian mobile', async () => {
      await expect(build().service.checkWhatsapp('+1 415 555 0100')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
