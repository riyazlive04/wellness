import { ClientAssistantService, gateReply } from './client-assistant.service';

/**
 * Clients only reach the AI when their practice has switched the assistant on,
 * and only up to the practice's daily limit.
 */

const CLIENT = { id: 'u-client', workspaceId: 'ws-1', workspaceRole: null, isClient: true, isSuperAdmin: false } as never;

function build(opts: { enabled: boolean; limit?: number; usedToday?: number }) {
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string) => {
      if (sql.includes('client_assistant_enabled')) return [{ enabled: opts.enabled, daily_limit: opts.limit ?? 20 }];
      if (sql.includes('FROM public.assistant_messages m')) return [{ n: BigInt(opts.usedToday ?? 0) }];
      return [];
    }),
  };
  return new ClientAssistantService(prisma as never);
}

describe('ClientAssistantService.gate', () => {
  it('is off unless the practice switched it on', async () => {
    await expect(build({ enabled: false }).gate(CLIENT)).resolves.toMatchObject({ allowed: false, reason: 'off' });
  });

  it('allows questions under the daily limit', async () => {
    await expect(build({ enabled: true, limit: 20, usedToday: 19 }).gate(CLIENT)).resolves.toEqual({ allowed: true, limit: 20, used: 19 });
  });

  it('stops at the daily limit', async () => {
    await expect(build({ enabled: true, limit: 20, usedToday: 20 }).gate(CLIENT)).resolves.toMatchObject({ allowed: false, reason: 'limit', limit: 20 });
  });
});

describe('gateReply', () => {
  it('points the client to their nutritionist', () => {
    expect(gateReply({ allowed: false, reason: 'off', limit: 20, used: 0 })).toMatch(/hasn't switched on.*Chat/);
    expect(gateReply({ allowed: false, reason: 'limit', limit: 10, used: 10 })).toMatch(/today's limit of 10 questions/);
  });
});
