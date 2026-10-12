import { AiKeyMissingException, AiKeysService, AiQuotaException } from './ai-keys.service';
import { AiRuntimeService, jsonSafe, toJsonSchema } from './ai-runtime.service';
import { PlanLimitException } from '../tenancy/limits.service';

/**
 * Which key a practice's AI call runs on: its own key if it added one, else
 * NUSI's when its plan includes AI (paid plans, live trials). Credits are
 * checked first, whichever key runs the call.
 */

type Ws = { plan: string; status?: string; trialEndsAt?: Date | null };
const DAY = 86_400_000;

function build(opts: {
  own?: Record<string, { provider: 'gemini' | 'openai'; key: string }>;
  workspaces?: Record<string, Ws>;
  tenantWs?: string | null;
  platformKey?: string;
  overQuota?: string[];
}) {
  const prisma = {
    $queryRawUnsafe: async (sql: string, ws: string) => {
      const w = opts.workspaces?.[ws];
      if (!w) return [];
      if (sql.includes('trial_ends_at')) return [{ status: w.status ?? 'active', trial_ends_at: w.trialEndsAt ?? null }];
      if (sql.includes('FROM public.workspaces w')) return [{ plan: w.plan, sub_plan: null }];
      return [];
    },
  };
  const config = { get: (k: string) => (k === 'GEMINI_API_KEY' ? opts.platformKey : undefined) };
  const aiKeys = new AiKeysService(prisma as never, config as never);
  jest.spyOn(aiKeys, 'resolve').mockImplementation(async (ws) => (ws && opts.own?.[ws]) || null);
  const tenant = { workspaceId: () => opts.tenantWs ?? null };
  const limits = {
    assertAiQuota: async (ws: string) => {
      if (opts.overQuota?.includes(ws)) throw new PlanLimitException('ai_calls', 500, 500, 'starter');
    },
  };
  return new AiRuntimeService(aiKeys, config as never, tenant as never, limits as never);
}

describe('AiRuntimeService key rules', () => {
  const own = { 'ws-own': { provider: 'openai' as const, key: 'sk-practice' } };
  const workspaces: Record<string, Ws> = {
    'ws-own': { plan: 'starter' },
    'ws-paid': { plan: 'growth' },
    'ws-trial': { plan: 'trial', trialEndsAt: new Date(Date.now() + 5 * DAY) },
    'ws-expired': { plan: 'trial', trialEndsAt: new Date(Date.now() - DAY) },
    'ws-suspended': { plan: 'growth', status: 'suspended' },
  };
  const nusi = { provider: 'gemini', key: 'nusi' };

  it("uses the practice's own key when it added one", async () => {
    await expect(build({ own, workspaces, platformKey: 'nusi' }).keyFor('ws-own')).resolves.toMatchObject({ provider: 'openai', key: 'sk-practice' });
  });

  it("runs paid plans and live trials on NUSI's key", async () => {
    const rt = build({ own, workspaces, platformKey: 'nusi' });
    await expect(rt.keyFor('ws-paid')).resolves.toMatchObject(nusi);
    await expect(rt.keyFor('ws-trial')).resolves.toMatchObject(nusi);
    await expect(rt.hasKey('ws-trial')).resolves.toBe(true);
  });

  it('refuses an ended trial or a suspended practice without its own key', async () => {
    const rt = build({ own, workspaces, platformKey: 'nusi' });
    await expect(rt.keyFor('ws-expired')).rejects.toBeInstanceOf(AiKeyMissingException);
    await expect(rt.keyFor('ws-suspended')).rejects.toBeInstanceOf(AiKeyMissingException);
    await expect(rt.hasKey('ws-expired')).resolves.toBe(false);
  });

  it("checks credits first, even on the practice's own key", async () => {
    const rt = build({ own, workspaces, platformKey: 'nusi', overQuota: ['ws-own', 'ws-paid'] });
    await expect(rt.keyFor('ws-own')).rejects.toBeInstanceOf(PlanLimitException);
    await expect(rt.keyFor('ws-paid')).rejects.toBeInstanceOf(PlanLimitException);
  });

  it("uses the request's workspace when the caller didn't name one", async () => {
    await expect(build({ own, workspaces, tenantWs: 'ws-expired', platformKey: 'nusi' }).keyFor(null)).rejects.toBeInstanceOf(AiKeyMissingException);
    await expect(build({ own, workspaces, tenantWs: 'ws-own', platformKey: 'nusi' }).provider(undefined)).resolves.toBe('openai');
  });

  it("uses NUSI's key directly when no workspace is involved", async () => {
    await expect(build({ own, workspaces, tenantWs: null, platformKey: 'nusi' }).keyFor(null)).resolves.toEqual(nusi);
  });

  it('has nothing to offer when the server has no key configured', async () => {
    await expect(build({ own, workspaces }).keyFor('ws-paid')).rejects.toBeInstanceOf(AiKeyMissingException);
  });
});

describe('AiRuntimeService Gemini model fallback', () => {
  const workspaces: Record<string, Ws> = { ws: { plan: 'growth' } };
  const err = (code: number) => new Error(`[GoogleGenerativeAI Error]: Error fetching: [${code} Not Found] model gone`);

  function rt() {
    const r = build({ workspaces, platformKey: 'nusi' });
    const calls: string[] = [];
    const spy = jest.spyOn(r as never as { geminiGenerateWith: (...a: unknown[]) => unknown }, 'geminiGenerateWith');
    return { r, calls, spy };
  }

  it('moves to the next model when one is retired (404) or busy (503)', async () => {
    const { r, calls, spy } = rt();
    spy.mockImplementation(async (...a: unknown[]) => {
      const model = a[1] as string;
      calls.push(model);
      if (calls.length === 1) throw err(404);
      if (calls.length === 2) throw err(503);
      return { text: '{}', provider: 'gemini', model, inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    });
    const out = await r.generate({ workspaceId: 'ws', prompt: 'hi' });
    expect(calls).toEqual(['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest']);
    expect(out.model).toBe('gemini-flash-latest');
  });

  it("turns a used-up quota into a clear 429, naming whose key ran out", async () => {
    const { r, spy } = rt();
    spy.mockImplementation(async () => { throw err(429); });
    const e = await r.generate({ workspaceId: 'ws', prompt: 'hi' }).catch((x) => x);
    expect(e).toBeInstanceOf(AiQuotaException);
    expect(e.getStatus()).toBe(429);
    expect(e.getResponse().code).toBe('ai_quota_exceeded');
  });

  it('does not try other models for a bad key, or when the caller named a model', async () => {
    const { r, calls, spy } = rt();
    spy.mockImplementation(async (...a: unknown[]) => { calls.push(a[1] as string); throw err(400); });
    await expect(r.generate({ workspaceId: 'ws', prompt: 'hi' })).rejects.toThrow();
    spy.mockImplementation(async (...a: unknown[]) => { calls.push(a[1] as string); throw err(404); });
    await expect(r.generate({ workspaceId: 'ws', prompt: 'hi', geminiModel: 'pinned' })).rejects.toThrow();
    expect(calls).toEqual(['gemini-3.5-flash', 'pinned']);
  });
});

describe('toJsonSchema', () => {
  it('turns a Gemini response schema into JSON Schema for OpenAI', () => {
    const out = toJsonSchema({
      type: 'object',
      properties: {
        confidence: { type: 'string', enum: ['high', 'low'], format: 'enum' },
        note: { type: 'string', nullable: true },
        items: { type: 'array', items: { type: 'object', properties: { grams: { type: 'number' } } } },
      },
      required: ['confidence'],
    } as never);
    expect(out).toEqual({
      type: 'object',
      properties: {
        confidence: { type: 'string', enum: ['high', 'low'] },
        note: { type: ['string', 'null'] },
        items: { type: 'array', items: { type: 'object', properties: { grams: { type: 'number' } } } },
      },
      required: ['confidence'],
    });
  });
});

describe('jsonSafe', () => {
  it('makes raw SQL values serializable for tool results', () => {
    expect(jsonSafe({ n: BigInt(3), rows: [{ at: new Date('2026-09-28T00:00:00Z') }] })).toEqual({
      n: 3,
      rows: [{ at: '2026-09-28T00:00:00.000Z' }],
    });
  });
});
