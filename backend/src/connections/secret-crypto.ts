import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Symmetric encryption for per-workspace secrets (practice AI keys, Resend
 * keys, Evolution tokens) so they're never stored in plaintext.
 *
 * New secrets are encrypted with a key derived (scrypt) from
 * `CONNECTIONS_ENC_KEY`, a secret used for nothing else. Before that existed
 * they were encrypted with `SUPABASE_JWT_SECRET` (or the service-role key), so
 * decryption also tries those: GCM's auth tag tells us which key was right.
 * That tie mattered because rotating the JWT secret, a routine Supabase
 * action, would otherwise have made every stored secret unreadable. Once
 * stored secrets are re-encrypted (scripts/reencrypt-secrets), rotating the
 * JWT secret no longer touches them.
 *
 * Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>` (AES-256-GCM, authenticated).
 */

const SALT = 'sirah:workspace-connections:v1';

const derived = new Map<string, Buffer>();

/** scrypt is deliberately slow; derive each secret's key once per process. */
function derive(secret: string): Buffer {
  let k = derived.get(secret);
  if (!k) {
    k = scryptSync(secret, SALT, 32);
    derived.set(secret, k);
  }
  return k;
}

/** Secrets that may have encrypted a stored value, the current one first. */
function candidateSecrets(): string[] {
  const all = [
    process.env.CONNECTIONS_ENC_KEY,
    process.env.SUPABASE_JWT_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((s): s is string => !!s && !!s.trim());
  return Array.from(new Set(all));
}

function currentKey(): Buffer {
  const [secret] = candidateSecrets();
  if (!secret) {
    // No server secret at all — refuse rather than encrypt with a known key.
    throw new Error('No server secret available to derive the connections encryption key.');
  }
  return derive(secret);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', currentKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Decrypt, and say whether the value was sealed with the current key. A value
 * sealed with an older key still decrypts but should be re-encrypted.
 */
export function decryptSecretDetailed(payload: string): { plain: string; current: boolean } {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const secrets = candidateSecrets();
  if (!secrets.length) {
    throw new Error('No server secret available to derive the connections encryption key.');
  }
  for (let i = 0; i < secrets.length; i++) {
    try {
      return { plain: decryptWith(derive(secrets[i]), ivB64, tagB64, dataB64), current: i === 0 };
    } catch {
      // Wrong key: the auth tag didn't verify. Try the next one.
    }
  }
  throw new Error('Could not decrypt the secret with any configured key.');
}

export function decryptSecret(payload: string): string {
  return decryptSecretDetailed(payload).plain;
}
