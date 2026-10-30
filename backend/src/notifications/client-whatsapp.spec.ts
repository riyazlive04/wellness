import { NotificationsService, clientWhatsappText } from './notifications.service';

/**
 * Client reminders go out on WhatsApp from the practice's OWN number, so they
 * must only fire when the practice opted in, the client hasn't opted out, and
 * the notification is one a client acts on - never a copy of every chat line.
 */

function build(opts: {
  gateway?: boolean;
  token?: string | null;
  clientAllowsWhatsapp?: boolean;
  categoryAllowed?: boolean;
  phone?: string | null;
} = {}) {
  const sent: Array<{ token: string; to: string; text: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string) =>
      sql.includes('FROM public.clients c JOIN public.workspaces w')
        ? [{ phone: opts.phone === undefined ? '+91 98765 43210' : opts.phone, practice: 'Sirah Nutrition' }]
        : [],
  };
  const push = { sendToClient: async () => 0, sendToClientByChannel: async () => ({ web: 0, mobile: 0 }) };
  const prefs = {
    clientDeliveryAllowed: async () => opts.categoryAllowed ?? true,
    clientWhatsappAllowed: async () => opts.clientAllowsWhatsapp ?? true,
  };
  const whatsapp = {
    enabled: opts.gateway ?? true,
    sendText: async (m: { token: string; to: string; text: string }) => (sent.push(m), true),
  };
  const connections = { resolveClientWhatsapp: async () => (opts.token === undefined ? 'tok-1' : opts.token) };
  const service = new NotificationsService(
    prisma as never,
    push as never,
    prefs as never,
    {} as never,
    whatsapp as never,
    connections as never,
  );
  return { service, sent };
}

const reminder = {
  type: 'appointment:reminder',
  title: '⏰ Your session is in 1 hour',
  body: 'Follow-up with Dt. Meera at 4:00 PM',
  url: '/portal/appointments',
};

describe('NotificationsService client WhatsApp', () => {
  it('sends an appointment reminder from the practice number, signed by the practice', async () => {
    const { service, sent } = build();
    await service.notifyClient('ws-1', 'c-1', reminder);
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe('tok-1');
    expect(sent[0].to).toBe('+91 98765 43210');
    expect(sent[0].text).toContain('*⏰ Your session is in 1 hour*');
    expect(sent[0].text).toContain('/portal/appointments');
    expect(sent[0].text.endsWith('- Sirah Nutrition')).toBe(true);
  });

  it('sends when a new meal plan is published', async () => {
    const { service, sent } = build();
    await service.notifyClient('ws-1', 'c-1', { type: 'meal_plan:published', title: 'Your meal plan is ready' });
    expect(sent).toHaveLength(1);
  });

  it('sends a payment reminder, with the balance and due date intact', async () => {
    // The reminder cron hands the whole sentence over in `body`; WhatsApp is
    // the channel that actually reaches a client who owes money.
    const { service, sent } = build();
    await service.notifyClient('ws-1', 'c-1', {
      type: 'invoice:reminder',
      title: 'Payment due in 7 days',
      body: 'Asha Menon, ₹4,500 on INV-0012, due 6 Nov 2026.',
      url: '/portal/invoices',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('₹4,500');
    expect(sent[0].text).toContain('INV-0012');
    expect(sent[0].text).toContain('due 6 Nov 2026');
  });

  it('a WhatsApp failure does not throw back into the caller', async () => {
    // The reminder row is already claimed by the time this runs: a throw here
    // would either crash the cron or leave the mark set with nothing sent.
    const { service } = build();
    (service as unknown as { whatsapp: { enabled: boolean; sendText: () => Promise<boolean> } }).whatsapp = {
      enabled: true,
      sendText: () => Promise.reject(new Error('gateway down')),
    };
    await expect(
      service.notifyClient('ws-1', 'c-1', { type: 'invoice:reminder', title: 'Payment due today' }),
    ).resolves.toBeUndefined();
  });

  it('does not copy chat messages to WhatsApp', async () => {
    const { service, sent } = build();
    await service.notifyClient('ws-1', 'c-1', { type: 'message:admin', title: 'A note from your nutritionist' });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['the practice has not turned client reminders on', { token: null }],
    ['the client switched WhatsApp off', { clientAllowsWhatsapp: false }],
    ['the client muted appointment reminders', { categoryAllowed: false }],
    ['the client has no phone number', { phone: null }],
    ['the WhatsApp gateway is not configured', { gateway: false }],
  ])('sends nothing when %s', async (_why, opts) => {
    const { service, sent } = build(opts);
    await service.notifyClient('ws-1', 'c-1', reminder);
    expect(sent).toHaveLength(0);
  });
});

describe('clientWhatsappText', () => {
  it('leaves out empty parts', () => {
    expect(clientWhatsappText({ title: 'Hello' }, null, null)).toBe('*Hello*');
  });
});
