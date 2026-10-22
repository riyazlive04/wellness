import { TrialService } from './trial.service';

/**
 * Meta counts template parameters and rejects the whole send when the count
 * does not match the approved template:
 *
 *   (#132000) body: number of localizable_params (5) does not match the
 *   expected number of params (4)
 *
 * An extra key is NOT ignored. `days_left` was being sent to both trial
 * templates and is used by neither, so every trial reminder over Wasi failed
 * and fell back to the Evolution number - silently, because the fallback
 * succeeds. Caught by sending a real message, not by any test.
 *
 * The approved templates are:
 *   nusi_trial_ending   customer_name, practice_name, ends_on, pay_url
 *   nusi_trial_ended    customer_name, practice_name, pay_url
 */

const ROW = {
  workspace_id: 'ws-1',
  name: 'Aboothahir - Wellness Coach',
  owner_email: 'owner@example.test',
  owner_phone: '8428865514',
  owner_name: 'syed abuthahir',
};

/** Captures what the service hands Wasi, without sending anything. */
function harness(templateEnv: Record<string, string>) {
  const sent: Array<{ template: string; params: Record<string, string> }> = [];

  const ctx = {
    config: { get: (k: string) => templateEnv[k] },
    wasi: {
      enabled: true,
      sendTemplate: async (_to: string, template: string, params: Record<string, string>) => {
        sent.push({ template, params });
        return true; // accepted, so no fallback
      },
    },
    whatsapp: {
      sendPlatformText: async () => {
        throw new Error('fell back to Evolution - the Wasi send was rejected');
      },
    },
    logger: { warn: () => {} },
  } as unknown as TrialService;

  type SendWhatsapp = (
    row: typeof ROW, days: number, when: string, payUrl: string, text: string,
  ) => Promise<boolean>;
  const send = (TrialService.prototype as unknown as { sendWhatsapp: SendWhatsapp })
    .sendWhatsapp.bind(ctx);

  return { sent, send };
}

const ENV = {
  WASI_TEMPLATE_TRIAL_ENDING: 'nusi_trial_ending',
  WASI_TEMPLATE_TRIAL_ENDED: 'nusi_trial_ended',
};

describe('trial reminder template parameters', () => {
  it('sends exactly the four params nusi_trial_ending declares', async () => {
    const { sent, send } = harness(ENV);
    await send(ROW, 2, 'ends in 2 days', 'https://nusi.in/billing', 'fallback text');

    expect(sent).toHaveLength(1);
    expect(sent[0].template).toBe('nusi_trial_ending');
    expect(Object.keys(sent[0].params).sort()).toEqual(
      ['customer_name', 'ends_on', 'pay_url', 'practice_name'],
    );
  });

  it('sends exactly the three params nusi_trial_ended declares', async () => {
    const { sent, send } = harness(ENV);
    // days <= 0 selects the ENDED template, which has no ends_on.
    await send(ROW, 0, 'ended today', 'https://nusi.in/billing', 'fallback text');

    expect(sent[0].template).toBe('nusi_trial_ended');
    expect(Object.keys(sent[0].params).sort()).toEqual(
      ['customer_name', 'pay_url', 'practice_name'],
    );
    expect(sent[0].params).not.toHaveProperty('ends_on');
  });

  it('never sends days_left, which neither template accepts', async () => {
    const { sent, send } = harness(ENV);
    await send(ROW, 7, 'ends in 7 days', 'https://nusi.in/billing', 'fallback text');
    await send(ROW, -1, 'ended yesterday', 'https://nusi.in/billing', 'fallback text');

    for (const s of sent) expect(s.params).not.toHaveProperty('days_left');
  });

  it('titlecases the owner name, since every template opens "Hi {{name}},"', async () => {
    const { sent, send } = harness(ENV);
    await send(ROW, 3, 'ends in 3 days', 'https://nusi.in/billing', 'fallback text');

    expect(sent[0].params.customer_name).toBe('Syed Abuthahir');
  });
});
