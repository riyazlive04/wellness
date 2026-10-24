import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * The 4-digit PIN a practice can set on a client's documents.
 *
 * Hashing and verification only - the storage and the endpoints live in
 * ClientsService, so this file stays testable without a database.
 *
 * scrypt rather than a plain SHA: a four-digit PIN has 10,000 possibilities,
 * so a fast hash is enumerable in milliseconds if the table ever leaks. scrypt
 * makes each guess cost real work. It is still only four digits, so the
 * attempt limiter is what actually protects a live PIN - see MAX_ATTEMPTS.
 *
 * Node's own crypto, deliberately: the project already derives keys with
 * scryptSync in connections/secret-crypto.ts, so this adds no dependency.
 */

/** Wrong tries before the PIN locks. Low, because guessing 4 digits is cheap. */
export const MAX_ATTEMPTS = 5;

/** How long a locked PIN stays locked. Long enough to make guessing futile. */
export const LOCK_MINUTES = 15;

/**
 * scrypt cost. 2^15 needs ~32MB, over node's 32MB default maxmem, so maxmem is
 * raised to match - without it scryptSync throws "memory limit exceeded" and
 * every PIN set or check fails. Memory is 128 * N * r, r defaulting to 8.
 */
const SCRYPT_COST = 32_768;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** A PIN is exactly four digits. Leading zeros are real: "0042" is valid. */
export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/**
 * Hash a PIN for storage, as `salt:key` in hex.
 *
 * Each PIN gets its own salt, so two clients who pick 1234 do not share a
 * hash - otherwise the column would leak which clients use the same PIN.
 */
export function hashPin(pin: string): string {
  if (!isValidPinFormat(pin)) {
    throw new Error('A document PIN must be exactly 4 digits.');
  }
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(pin, salt, KEY_BYTES, { N: SCRYPT_COST, maxmem: SCRYPT_MAXMEM });
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

/**
 * Check a PIN against a stored hash.
 *
 * Compared with timingSafeEqual so the time taken does not reveal how much of
 * the hash matched. Returns false rather than throwing on a malformed stored
 * value: a corrupt hash must not let someone in, and must not 500 the request
 * either - the practice can simply set the PIN again.
 */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !isValidPinFormat(pin)) return false;

  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;

    const actual = scryptSync(pin, salt, KEY_BYTES, { N: SCRYPT_COST, maxmem: SCRYPT_MAXMEM });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Minutes left on a lock, or 0 when it is not locked. Never negative. */
export function lockMinutesLeft(lockedUntil: Date | string | null | undefined): number {
  if (!lockedUntil) return 0;
  const until = new Date(lockedUntil).getTime();
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 60_000));
}
