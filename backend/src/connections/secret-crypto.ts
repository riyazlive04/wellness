import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Symmetric encryption for per-workspace connection secrets (Resend keys, SMTP
 * passwords, Evolution tokens) so they're never stored in plaintext.
 *
 * The key is DERIVED from an existing server secret (`SUPABASE_JWT_SECRET`, or
 * `CONNECTIONS_ENC_KEY` if you'd rather set a dedicated one) via scrypt — so no
 * new env var is required to ship. Rotating that secret invalidates stored
 * ciphertexts (they'd need re-entering), which is the correct security posture.
 *
 * Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>` (AES-256-GCM, authenticated).
 */

const SALT = 'sirah:workspace-connections:v1';

function key(): Buffer {
  const secret =
    process.env.CONNECTIONS_ENC_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    // No server secret at all — refuse rather than encrypt with a known key.
    throw new Error('No server secret available to derive the connections encryption key.');
  }
  return scryptSync(secret, SALT, 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted secret.');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
