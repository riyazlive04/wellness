import { LeadOtpService } from './lead-otp.service';

/** Codes gate who can book a call, so the rules around them are pinned here. */

function build(sendOk = true) {
  const sent: Array<{ to: string; text: string }> = [];
  const messenger = {
    send: async (_kind: string, to: string, _params: Record<string, string>, text: string) => {
      sent.push({ to, text });
      return sendOk;
    },
  };
  return { otp: new LeadOtpService(messenger as never), sent };
}

const PHONE = '+919876543210';
const codeFrom = (text: string) => text.match(/^(\d{6})/)![1];

describe('LeadOtpService', () => {
  it('sends a 6-digit code on WhatsApp and accepts it once', async () => {
    const { otp, sent } = build();
    expect((await otp.send(PHONE)).sent).toBe(true);
    const code = codeFrom(sent[0].text);
    expect(otp.isVerified(PHONE)).toBe(false);
    expect(otp.verify(PHONE, code)).toEqual({ verified: true });
    expect(otp.isVerified(PHONE)).toBe(true);
    // single use
    expect(otp.verify(PHONE, code)).toEqual({ verified: false, reason: 'expired' });
  });

  it('rejects a wrong code and locks after 5 tries', async () => {
    const { otp, sent } = build();
    await otp.send(PHONE);
    const code = codeFrom(sent[0].text);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect(otp.verify(PHONE, wrong)).toEqual({ verified: false, reason: 'wrong' });
    expect(otp.verify(PHONE, wrong)).toEqual({ verified: false, reason: 'too_many' });
    expect(otp.verify(PHONE, code)).toEqual({ verified: false, reason: 'too_many' });
  });

  it('makes a resend wait 30 seconds', async () => {
    const { otp } = build();
    await otp.send(PHONE);
    const again = await otp.send(PHONE);
    expect(again.sent).toBe(false);
    expect(again).toMatchObject({ reason: 'too_soon' });
  });

  it('reports unavailable when WhatsApp cannot deliver', async () => {
    const { otp } = build(false);
    expect(await otp.send(PHONE)).toEqual({ sent: false, reason: 'unavailable' });
  });

  it('never verifies a number that was not sent a code', () => {
    const { otp } = build();
    expect(otp.verify(PHONE, '123456')).toEqual({ verified: false, reason: 'expired' });
  });
});
