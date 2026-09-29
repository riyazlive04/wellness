import { KnowledgeService, tidyAiAnswer } from './knowledge.service';

/**
 * "Ask NUSI" answers with the practice's own AI when it has a key, citing the
 * retrieved passages, and falls back to the model-free answer otherwise.
 */

const USER = { id: 'u1', workspaceId: 'ws-1', isSuperAdmin: false } as never;

const PASSAGE = {
  marker: 0, document_id: 'd1', title: 'NUSI guide', heading: 'Programs', chunk_index: 3,
  similarity: 0.6, content: 'Open a program and click Assign to add many clients at once.',
};

function build(opts: { hasKey: boolean; overQuota?: boolean; aiText?: string; aiFails?: boolean }) {
  const generate = jest.fn(async () => {
    if (opts.aiFails) throw new Error('provider down');
    return { text: opts.aiText ?? '', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: 10, outputTokens: 5, totalTokens: 15 };
  });
  const ai = { hasKey: async () => opts.hasKey, generate };
  const usage = { checkQuota: async () => ({ exceeded: !!opts.overQuota }), record: jest.fn(async () => {}) };
  const context = {
    build: async () => ({ type: 'clinical', data: { clients: { active: 4 } }, promptText: 'Workspace operations today:{"clients":{"active":4}}' }),
    clientFocus: async () => null,
    clientData: async () => [],
  };
  const svc = new KnowledgeService({} as never, context as never, ai as never, usage as never);
  jest.spyOn(svc, 'search').mockResolvedValue([PASSAGE]);
  return { svc, generate, usage };
}

describe('KnowledgeService.ask with the practice AI', () => {
  it("answers with the practice's AI and keeps only the passages it cited", async () => {
    const { svc, generate, usage } = build({
      hasKey: true,
      aiText: JSON.stringify({ answer: 'Open the program and click Assign [1].', answered: true, used_practice_data: false }),
    });
    const out = await svc.ask('How do I assign a program to many clients?', USER);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(out.outcome).toBe('grounded');
    expect(out.answer).toBe('Open the program and click Assign [1].');
    expect(out.citations).toEqual([expect.objectContaining({ marker: 1, document_id: 'd1' })]);
    expect(out.used).toEqual({ documents: true, workspace: false });
    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', metadata: { feature: 'knowledge' } }));
  });

  it('reports an honest miss as no_match', async () => {
    const { svc } = build({
      hasKey: true,
      aiText: JSON.stringify({ answer: "I don't have that in your documents. Try Settings.", answered: false, used_practice_data: false }),
    });
    const out = await svc.ask('What is our refund policy?', USER);
    expect(out.outcome).toBe('no_match');
    expect(out.citations).toEqual([]);
  });

  it('ignores citation numbers that do not match a passage', async () => {
    const { svc } = build({
      hasKey: true,
      aiText: JSON.stringify({ answer: 'You have 4 active clients [7].', answered: true, used_practice_data: true }),
    });
    const out = await svc.ask('How many active clients do I have?', USER);
    expect(out.citations).toEqual([]);
    expect(out.used).toEqual({ documents: false, workspace: true });
  });

  it('never calls the AI without a key', async () => {
    const { svc, generate } = build({ hasKey: false });
    await svc.ask('How do I assign a program to many clients?', USER);
    expect(generate).not.toHaveBeenCalled();
  });

  it('never calls the AI over quota', async () => {
    const { svc, generate } = build({ hasKey: true, overQuota: true });
    await svc.ask('How do I assign a program to many clients?', USER);
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls back to the search answer when the AI fails', async () => {
    const { svc, usage } = build({ hasKey: true, aiFails: true });
    const out = await svc.ask('How do I assign a program to many clients?', USER);
    expect(out.outcome).toBe('grounded');
    expect(out.answer).toContain('click Assign');
    expect(usage.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});

describe('tidyAiAnswer', () => {
  it('moves a line-leading citation to the end so it is not shown as a source label', () => {
    expect(tidyAiAnswer('[2] Assign from the program page.\n- Step one [1]')).toBe('Assign from the program page. [2]\n- Step one [1]');
  });
});
