import { BadRequestException } from '@nestjs/common';
import { VideoKeysService, testDailyKey } from './video-keys.service';
import { encryptSecret } from '../connections/secret-crypto';

/** A practice's own Daily.co key: tested before it's kept, used only while it works. */

// The key is stored encrypted; give the test a server secret to derive the key from.
process.env.CONNECTIONS_ENC_KEY = process.env.CONNECTIONS_ENC_KEY || 'test-secret-for-video-keys-spec';

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

function mockDaily(status: number, body: unknown = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }) as never;
}

describe('testDailyKey', () => {
  it('accepts a working key and reads the account domain', async () => {
    mockDaily(200, { domain_name: 'mypractice' });
    expect(await testDailyKey('k'.repeat(40))).toEqual({ ok: true, domain: 'mypractice' });
  });
  it('rejects a key Daily.co refuses', async () => {
    mockDaily(401);
    expect(await testDailyKey('k'.repeat(40))).toEqual({ ok: false, error: 'the key is not valid' });
  });
});

describe('VideoKeysService', () => {
  const prismaWith = (row: unknown) => ({
    $queryRawUnsafe: jest.fn().mockResolvedValue(row ? [row] : []),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
  });

  it('refuses to save a key Daily.co rejects', async () => {
    mockDaily(401);
    const svc = new VideoKeysService(prismaWith(null) as never);
    await expect(svc.save('ws', 'u', 'k'.repeat(40))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the practice key only while it is connected', async () => {
    const key = 'k'.repeat(40);
    const ok = new VideoKeysService(prismaWith({ key_enc: encryptSecret(key), status: 'connected' }) as never);
    expect(await ok.resolve('ws')).toBe(key);
    const broken = new VideoKeysService(prismaWith({ key_enc: encryptSecret(key), status: 'error' }) as never);
    expect(await broken.resolve('ws')).toBeNull();
    const none = new VideoKeysService(prismaWith(null) as never);
    expect(await none.resolve('ws')).toBeNull();
  });

  it('shows NUSI as the source until a working key is saved', async () => {
    const svc = new VideoKeysService(prismaWith(null) as never);
    expect((await svc.view('ws')).source).toBe('nusi');
  });
});
