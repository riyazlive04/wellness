import { LeadInputCheckService } from './lead-input-check.service';

/** Obvious junk is caught without the AI; a lead is never lost because the AI is missing or down. */
describe('LeadInputCheckService', () => {
  const noAi = () => new LeadInputCheckService({ get: () => undefined } as never);

  it('lets a real purpose through when no Gemini key is configured', async () => {
    await expect(noAi().checkPurpose('I want to see how diet plans and client follow-ups work')).resolves.toEqual({ valid: true });
  });

  it('rejects repeated-word padding without calling the AI', async () => {
    const verdict = await noAi().checkPurpose('test test test test test test test test test test');
    expect(verdict.valid).toBe(false);
    expect(verdict.message).toMatch(/tell us what/i);
  });

  it('lets an empty purpose through to the word-count rule', async () => {
    const service = new LeadInputCheckService({ get: () => 'key' } as never);
    await expect(service.checkPurpose('   ')).resolves.toEqual({ valid: true });
  });

  it.each(['asdf', 'Test', 'abc', 'x', '12345', 'Priya123', 'aaaa', 'na', 'AkjsaidjiQWI'])('rejects the name %s without calling the AI', async (name) => {
    await expect(noAi().checkName(name)).resolves.toMatchObject({ valid: false });
  });

  it.each(['Priya Sharma', 'Dr. Meera Nair', 'K. Priya', "D'Souza", 'McDonald', 'PRIYA SHARMA', 'அருண்', 'राहुल'])('lets the name %s through', async (name) => {
    await expect(noAi().checkName(name)).resolves.toEqual({ valid: true });
  });

  it('asks OpenAI when its key is set, and uses the verdict', async () => {
    const realFetch = global.fetch;
    let sentModel = '';
    global.fetch = (async (_url: string, init: { body: string }) => {
      sentModel = JSON.parse(init.body).model;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"valid": false, "hint": "Please enter your real name."}' } }] }) };
    }) as never;
    try {
      const service = new LeadInputCheckService({ get: (k: string) => (k === 'OPENAI_API_KEY' ? 'sk-test' : undefined) } as never);
      await expect(service.checkName('Lolz Lolz')).resolves.toEqual({ valid: false, message: 'Please enter your real name.' });
      expect(sentModel).toBe('gpt-4o-mini');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('lets the input through when OpenAI fails and no Gemini key is set', async () => {
    const realFetch = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) })) as never;
    try {
      const service = new LeadInputCheckService({ get: (k: string) => (k === 'OPENAI_API_KEY' ? 'sk-test' : undefined) } as never);
      await expect(service.checkName('Priya Sharma')).resolves.toEqual({ valid: true });
    } finally {
      global.fetch = realFetch;
    }
  });
});
