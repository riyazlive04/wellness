import { deviceKindFromUserAgent } from './device-limit';

/**
 * The UA strings below are real ones taken from auth.sessions on production,
 * not invented - the whole rule rests on telling the app apart from a phone
 * browser, and that distinction is only worth testing against what devices
 * actually send.
 */
describe('deviceKindFromUserAgent', () => {
  it('counts the Android app as mobile', () => {
    expect(deviceKindFromUserAgent('okhttp/4.9.2')).toBe('mobile');
  });

  it('counts the iOS app as mobile', () => {
    expect(deviceKindFromUserAgent('NUSI/1.0.12 CFNetwork/1498.700.2 Darwin/23.6.0')).toBe('mobile');
  });

  it('counts a desktop browser as web', () => {
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
      ),
    ).toBe('web');
  });

  // The one that matters: a nutritionist opening nusi.in on their phone is
  // using the WEB app. Calling it mobile would let one person hold both slots
  // with two browsers and never trip the limit.
  it('counts a phone browser as web, not mobile', () => {
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('web');
    expect(
      deviceKindFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('web');
  });

  // Supabase can record a session with no UA at all. Guessing 'mobile' there
  // would hand out a free extra slot, so an unknown client counts as web.
  it('treats a missing or unknown user agent as web', () => {
    expect(deviceKindFromUserAgent(null)).toBe('web');
    expect(deviceKindFromUserAgent(undefined)).toBe('web');
    expect(deviceKindFromUserAgent('')).toBe('web');
    expect(deviceKindFromUserAgent('node')).toBe('web');
  });
});
