import { ConnectionsService } from './connections.service';

/**
 * Which number a practice's WhatsApp goes out from.
 *
 * 'platform' means NUSI's own official Meta sender (Wasi) - nothing to link.
 * 'own' means the practice's linked Evolution instance.
 *
 * The rule worth testing is the one that is easy to get wrong: choosing
 * 'platform' must stop the dispatcher using the practice's own number EVEN
 * WHEN that number is linked and working. Without it the choice would be
 * cosmetic, and a practice told "messages come from NUSI" would still see
 * their own number on every send.
 *
 * resolveWhatsapp / resolveClientWhatsapp hand the dispatcher a token, so
 * returning null is exactly "do not send from their number".
 */

const WS = '33333333-3333-4333-8333-333333333333';

/** A linked, working connection row, with whatever config a test needs. */
function linkedRow(config: Record<string, unknown>) {
  return {
    channel: 'whatsapp',
    status: 'connected',
    provider: 'evolution',
    config: { id: 'inst-1', token_enc: 'enc', ...config },
  };
}

function svc(rows: unknown[]) {
  const ctx = {
    rows: async () => rows,
    // Stand in for decryption: any stored secret resolves to this token.
    tryDecrypt: () => 'tok-1',
  } as unknown as ConnectionsService;
  return {
    staff: () => ConnectionsService.prototype.resolveWhatsapp.call(ctx, WS),
    clients: () => ConnectionsService.prototype.resolveClientWhatsapp.call(ctx, WS),
    sender: () => ConnectionsService.prototype.whatsappSender.call(ctx, WS),
  };
}

describe('WhatsApp sender choice', () => {
  it("uses the practice's own number when they chose it", async () => {
    const s = svc([linkedRow({ sender: 'own', notify_clients: true })]);
    await expect(s.staff()).resolves.toBe('tok-1');
    await expect(s.clients()).resolves.toBe('tok-1');
    await expect(s.sender()).resolves.toBe('own');
  });

  it("ignores a linked number when the practice is on NUSI's sender", async () => {
    // The whole point: linked AND working, but deliberately not used.
    const s = svc([linkedRow({ sender: 'platform', notify_clients: true })]);
    await expect(s.staff()).resolves.toBeNull();
    await expect(s.clients()).resolves.toBeNull();
    await expect(s.sender()).resolves.toBe('platform');
  });

  it("defaults to NUSI's sender when nothing was chosen", async () => {
    // Every practice predates this setting, so the default decides what they
    // get. It must be 'platform' - the behaviour they already had.
    const s = svc([linkedRow({ notify_clients: true })]);
    await expect(s.sender()).resolves.toBe('platform');
  });

  it("still sends from their own number when only notify_clients is unset", async () => {
    // Guards against the sender check swallowing the separate client opt-in.
    const s = svc([linkedRow({ sender: 'own' })]);
    await expect(s.staff()).resolves.toBe('tok-1');
    await expect(s.clients()).resolves.toBeNull(); // opt-in missing, not sender
  });

  it('sends from nobody when the instance is not connected', async () => {
    const s = svc([{ channel: 'whatsapp', status: 'pending', config: { sender: 'own' } }]);
    await expect(s.staff()).resolves.toBeNull();
    await expect(s.clients()).resolves.toBeNull();
  });

  it('defaults safely when the practice has no connection row at all', async () => {
    const s = svc([]);
    await expect(s.staff()).resolves.toBeNull();
    await expect(s.sender()).resolves.toBe('platform');
  });
});
