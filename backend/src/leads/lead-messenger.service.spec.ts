import { LeadMessengerService } from './lead-messenger.service';

/** Wasi when its template is set and it succeeds; otherwise the Evolution number. */
function build(opts: { wasiEnabled?: boolean; wasiOk?: boolean } = {}) {
  const calls: string[] = [];
  const wasi = {
    enabled: opts.wasiEnabled ?? true,
    sendTemplate: async (_to: string, template: string, params: Record<string, string>) => {
      calls.push(`wasi:${template}:${JSON.stringify(params)}`);
      return opts.wasiOk ?? true;
    },
  };
  const evolution = {
    sendPlatformText: async ({ text }: { to: string; text: string }) => {
      calls.push(`evolution:${text}`);
      return true;
    },
  };
  return { messenger: new LeadMessengerService(wasi as never, evolution as never), calls };
}

describe('LeadMessengerService', () => {
  afterEach(() => {
    delete process.env.WASI_TEMPLATE_OTP;
  });

  it('uses the Wasi template when one is configured', async () => {
    process.env.WASI_TEMPLATE_OTP = 'nusi_otp';
    const { messenger, calls } = build();
    expect(await messenger.send('otp', '+919876543210', { code: '123456' }, 'text')).toBe(true);
    expect(calls).toEqual(['wasi:nusi_otp:{"code":"123456"}']);
  });

  it('falls back to Evolution when no template is configured', async () => {
    const { messenger, calls } = build();
    await messenger.send('otp', '+919876543210', { code: '123456' }, 'plain otp');
    expect(calls).toEqual(['evolution:plain otp']);
  });

  it('falls back to Evolution when Wasi rejects the send', async () => {
    process.env.WASI_TEMPLATE_OTP = 'nusi_otp';
    const { messenger, calls } = build({ wasiOk: false });
    expect(await messenger.send('otp', '+919876543210', { code: '1' }, 'plain')).toBe(true);
    expect(calls).toEqual(['wasi:nusi_otp:{"code":"1"}', 'evolution:plain']);
  });

  it('skips Wasi when its credentials are not set', async () => {
    process.env.WASI_TEMPLATE_OTP = 'nusi_otp';
    const { messenger, calls } = build({ wasiEnabled: false });
    await messenger.send('otp', '+919876543210', { code: '1' }, 'plain');
    expect(calls).toEqual(['evolution:plain']);
  });
});
