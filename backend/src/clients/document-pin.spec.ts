import {
  hashPin,
  verifyPin,
  isValidPinFormat,
  lockMinutesLeft,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
} from './document-pin';

/**
 * The PIN a practice sets on a client's documents. It gates a client's own
 * health records, so a wrong answer here either locks someone out of their
 * reports or lets the wrong person read them.
 */

describe('document PIN format', () => {
  it('accepts exactly four digits, leading zeros included', () => {
    // "0042" is a PIN people really choose; treating it as 42 would break it.
    for (const pin of ['0000', '0042', '1234', '9999']) {
      expect(isValidPinFormat(pin)).toBe(true);
    }
  });

  it('rejects anything that is not four digits', () => {
    for (const bad of ['123', '12345', '', 'abcd', '12 4', '12.4', '１２３４']) {
      expect(isValidPinFormat(bad)).toBe(false);
    }
  });
});

describe('hashing', () => {
  it('never stores the PIN itself', () => {
    const h = hashPin('1234');
    expect(h).not.toContain('1234');
  });

  it('gives two clients with the same PIN different hashes', () => {
    // A shared salt would make the column reveal which clients picked 1234.
    expect(hashPin('1234')).not.toBe(hashPin('1234'));
  });

  it('refuses to hash a malformed PIN', () => {
    expect(() => hashPin('12')).toThrow(/4 digits/);
    expect(() => hashPin('abcd')).toThrow(/4 digits/);
  });
});

describe('verifying', () => {
  it('accepts the right PIN', () => {
    expect(verifyPin('4821', hashPin('4821'))).toBe(true);
  });

  it('rejects a wrong PIN', () => {
    expect(verifyPin('4821', hashPin('1234'))).toBe(false);
  });

  it('keeps leading zeros significant', () => {
    const stored = hashPin('0042');
    expect(verifyPin('0042', stored)).toBe(true);
    expect(verifyPin('42', stored)).toBe(false);
    expect(verifyPin('4200', stored)).toBe(false);
  });

  it('denies when no PIN is set rather than letting anyone through', () => {
    // A null hash means "no PIN" at the storage layer; the caller decides
    // whether to prompt. Verification itself must never pass on null.
    expect(verifyPin('1234', null)).toBe(false);
    expect(verifyPin('1234', undefined)).toBe(false);
    expect(verifyPin('1234', '')).toBe(false);
  });

  it('denies a corrupt stored hash without throwing', () => {
    // A truncated or hand-edited row must fail closed, and must not 500 the
    // client's Files screen - they can ask the practice to set it again.
    for (const bad of ['garbage', 'nosalt:', ':nokey', 'aa:bb', 'zz:zz']) {
      expect(() => verifyPin('1234', bad)).not.toThrow();
      expect(verifyPin('1234', bad)).toBe(false);
    }
  });
});

describe('lockout', () => {
  it('is a low threshold, because 4 digits is only 10,000 guesses', () => {
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(LOCK_MINUTES).toBeGreaterThanOrEqual(10);
  });

  it('reports no lock when there is none', () => {
    expect(lockMinutesLeft(null)).toBe(0);
    expect(lockMinutesLeft(undefined)).toBe(0);
  });

  it('reports minutes remaining, rounded up', () => {
    const in90s = new Date(Date.now() + 90_000);
    expect(lockMinutesLeft(in90s)).toBe(2);
  });

  it('never reports a negative wait for a lock that has passed', () => {
    const past = new Date(Date.now() - 60_000);
    expect(lockMinutesLeft(past)).toBe(0);
  });

  it('treats an unparseable date as unlocked rather than locked forever', () => {
    expect(lockMinutesLeft('not-a-date')).toBe(0);
  });
});
