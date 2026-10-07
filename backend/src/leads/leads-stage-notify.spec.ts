import { LeadsService } from './leads.service';

/**
 * Moving a lead between stages: the admin sees what would be sent and
 * decides. "No" still changes the stage but messages nobody.
 */

const LEAD = {
  name: 'Aboothahir',
  phone: '919876543210',
  email: 'abu@example.com',
  status: 'contacted',
  source: {} as Record<string, unknown>,
  slot_start: new Date('2026-10-09T06:30:00Z'),
};

function build(lead: Partial<typeof LEAD> = {}) {
  const row = { ...LEAD, ...lead };
  const updates: unknown[][] = [];
  const prisma = {
    $queryRawUnsafe: jest.fn(async () => [row]),
    $executeRawUnsafe: jest.fn(async (...args: unknown[]) => { updates.push(args); return 1; }),
  };
  const messenger = { send: jest.fn(async () => true) };
  const mail = { send: jest.fn(async () => true) };
  const service = new LeadsService(prisma as never, messenger as never, {} as never, mail as never, {} as never, {} as never);
  return { service, messenger, mail, updates };
}

describe('LeadsService stage changes', () => {
  it('previews the message a forward move would send', async () => {
    const { service } = build();
    const p = await service.previewStage('lead-1', 'demo_done');
    expect(p.will_message).toBe(true);
    expect(p.whatsapp).toBe(true);
    expect(p.email).toBe(true);
    expect(p.text).toContain('Aboothahir');
  });

  it('previews nothing for a backward move', async () => {
    const { service } = build({ status: 'demo_done' });
    const p = await service.previewStage('lead-1', 'contacted');
    expect(p).toMatchObject({ will_message: false, text: null, whatsapp: false, email: false });
  });

  it("doesn't offer a channel that already went out for that stage", async () => {
    const { service } = build({ source: { whatsapp_sent: { demo_done: '2026-10-07' } } });
    const p = await service.previewStage('lead-1', 'demo_done');
    expect(p).toMatchObject({ will_message: true, whatsapp: false, email: true });
  });

  it('sends the message when the admin says yes', async () => {
    const { service, messenger, mail } = build();
    const r = await service.changeStage('lead-1', 'demo_done', true);
    expect(r).toEqual({ status: 'demo_done', whatsapp_sent: true, email_sent: true });
    expect(messenger.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('changes the stage but sends nothing when the admin says no', async () => {
    const { service, messenger, mail, updates } = build();
    const r = await service.changeStage('lead-1', 'demo_done', false);
    expect(r).toEqual({ status: 'demo_done', whatsapp_sent: false, email_sent: false });
    expect(messenger.send).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    expect(updates[0][0]).toContain('SET status = $2');
    expect(updates[0][2]).toBe('demo_done');
  });
});
