import { AiKeyMissingException } from './ai-keys.service';
import { AiRuntimeService, jsonSafe, toJsonSchema } from './ai-runtime.service';

/**
 * Practices bring their own AI key, and a practice's AI must never run on
 * NUSI's server key. These pin which key a call gets.
 */

function build(opts: { keys?: Record<string, { provider: 'gemini' | 'openai'; key: string }>; tenantWs?: string | null; platformKey?: string }) {
  const aiKeys = {
    resolve: async (ws: string) => opts.keys?.[ws] ?? null,
    require: async (ws: string) => {
      const k = opts.keys?.[ws];
      if (!k) throw new AiKeyMissingException();
      return k;
    },
  };
  const config = { get: (k: string) => (k === 'GEMINI_API_KEY' ? opts.platformKey : undefined) };
  const tenant = { workspaceId: () => opts.tenantWs ?? null };
  return new AiRuntimeService(aiKeys as never, config as never, tenant as never);
}

describe('AiRuntimeService key rules', () => {
  const keys = { 'ws-1': { provider: 'openai' as const, key: 'sk-practice' } };

  it("uses the practice's own key", async () => {
    await expect(build({ keys, platformKey: 'nusi' }).keyFor('ws-1')).resolves.toEqual({ provider: 'openai', key: 'sk-practice' });
  });

  it("refuses a practice without a key - never falls back to NUSI's key", async () => {
    await expect(build({ keys, platformKey: 'nusi' }).keyFor('ws-2')).rejects.toBeInstanceOf(AiKeyMissingException);
    await expect(build({ keys, platformKey: 'nusi' }).hasKey('ws-2')).resolves.toBe(false);
  });

  it("uses the request's workspace when the caller didn't name one", async () => {
    const rt = build({ keys, tenantWs: 'ws-2', platformKey: 'nusi' });
    await expect(rt.keyFor(null)).rejects.toBeInstanceOf(AiKeyMissingException);
    await expect(build({ keys, tenantWs: 'ws-1', platformKey: 'nusi' }).provider(undefined)).resolves.toBe('openai');
  });

  it("uses NUSI's key only when no workspace is involved at all", async () => {
    await expect(build({ keys, tenantWs: null, platformKey: 'nusi' }).keyFor(null)).resolves.toEqual({ provider: 'gemini', key: 'nusi' });
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
