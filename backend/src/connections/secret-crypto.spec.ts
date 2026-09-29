import { decryptSecret, decryptSecretDetailed, encryptSecret } from './secret-crypto';

/**
 * Stored secrets must survive the move to a dedicated CONNECTIONS_ENC_KEY:
 * values sealed with the old JWT-derived key still open, and are flagged for
 * re-encryption.
 */
describe('secret-crypto', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  function env(vars: Record<string, string | undefined>) {
    delete process.env.CONNECTIONS_ENC_KEY;
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  }

  it('round-trips with the dedicated key', () => {
    env({ CONNECTIONS_ENC_KEY: 'dedicated', SUPABASE_JWT_SECRET: 'jwt' });
    const sealed = encryptSecret('sk-practice-key');
    expect(decryptSecretDetailed(sealed)).toEqual({ plain: 'sk-practice-key', current: true });
  });

  it('still opens values sealed with the old JWT-derived key, flagged as not current', () => {
    env({ SUPABASE_JWT_SECRET: 'jwt' });
    const old = encryptSecret('AIza-old');
    env({ CONNECTIONS_ENC_KEY: 'dedicated', SUPABASE_JWT_SECRET: 'jwt' });
    expect(decryptSecretDetailed(old)).toEqual({ plain: 'AIza-old', current: false });
  });

  it('refuses a value no configured key can open', () => {
    env({ CONNECTIONS_ENC_KEY: 'a' });
    const sealed = encryptSecret('x');
    env({ CONNECTIONS_ENC_KEY: 'b' });
    expect(() => decryptSecret(sealed)).toThrow('Could not decrypt');
  });

  it('rejects malformed payloads and a missing secret', () => {
    env({ CONNECTIONS_ENC_KEY: 'a' });
    expect(() => decryptSecret('nope')).toThrow('Malformed');
    env({});
    expect(() => encryptSecret('x')).toThrow('No server secret');
  });
});
