import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/**
 * One-time codes that prove a landing-page visitor owns the WhatsApp number
 * they typed, before they can book a call.
 *
 * Kept in memory: the API runs as a single process, codes live ten minutes, and
 * a restart simply means "request a new code" - not worth a table. Only a hash
 * of each code is held. A number that verified stays verified for
 * VERIFIED_TTL_MS so the booking that follows can confirm it server-side;
 * the browser's word is never trusted for this.
 */

const CODE_TTL_MS = 10 * 60_000;
const VERIFIED_TTL_MS = 30 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

interface Pending {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
  sentAt: number;
  sendsThisHour: number[];
}

export type SendResult =
  | { sent: true; resendInSec: number }
  | { sent: false; reason: 'unavailable' | 'too_soon' | 'too_many'; resendInSec?: number };

export type VerifyResult = { verified: true } | { verified: false; reason: 'wrong' | 'expired' | 'too_many' };

const hash = (code: string) => createHash('sha256').update(code).digest();

@Injectable()
export class LeadOtpService {
  private readonly logger = new Logger(LeadOtpService.name);
  private readonly pending = new Map<string, Pending>();
  private readonly verified = new Map<string, number>();

  constructor(private readonly whatsapp: WhatsappService) {}

  /** Send a fresh 6-digit code to `phone` (+91XXXXXXXXXX) on WhatsApp. */
  async send(phone: string): Promise<SendResult> {
    this.sweep();
    const now = Date.now();
    const prev = this.pending.get(phone);
    const recent = (prev?.sendsThisHour ?? []).filter((t) => now - t < 3_600_000);

    if (prev && now - prev.sentAt < RESEND_AFTER_MS) {
      return { sent: false, reason: 'too_soon', resendInSec: Math.ceil((RESEND_AFTER_MS - (now - prev.sentAt)) / 1000) };
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) return { sent: false, reason: 'too_many' };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ok = await this.whatsapp.sendPlatformText({
      to: phone,
      text: [
        `${code} is your NUSI verification code.`,
        '',
        'It expires in 10 minutes. Do not share this code with anyone.',
        '',
        '- Team NUSI',
      ].join('\n'),
    });
    if (!ok) {
      this.logger.warn(`OTP not delivered to ${phone} (WhatsApp unavailable)`);
      return { sent: false, reason: 'unavailable' };
    }

    this.pending.set(phone, {
      hash: hash(code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
      sendsThisHour: [...recent, now],
    });
    return { sent: true, resendInSec: RESEND_AFTER_MS / 1000 };
  }

  /** Check a code. On success the number counts as verified for 30 minutes. */
  verify(phone: string, code: string): VerifyResult {
    this.sweep();
    const entry = this.pending.get(phone);
    if (!entry || entry.expiresAt < Date.now()) return { verified: false, reason: 'expired' };
    if (entry.attempts >= MAX_ATTEMPTS) return { verified: false, reason: 'too_many' };

    entry.attempts += 1;
    const given = hash((code || '').replace(/\D/g, ''));
    if (given.length !== entry.hash.length || !timingSafeEqual(given, entry.hash)) {
      return entry.attempts >= MAX_ATTEMPTS ? { verified: false, reason: 'too_many' } : { verified: false, reason: 'wrong' };
    }

    this.pending.delete(phone);
    this.verified.set(phone, Date.now() + VERIFIED_TTL_MS);
    return { verified: true };
  }

  /** Did this number pass verification recently? Used when the lead is saved. */
  isVerified(phone: string): boolean {
    const until = this.verified.get(phone);
    return !!until && until > Date.now();
  }

  /** Drop expired entries so the maps can't grow without bound. */
  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.pending) {
      if (v.expiresAt < now && now - v.sentAt > 3_600_000) this.pending.delete(k);
    }
    for (const [k, until] of this.verified) if (until < now) this.verified.delete(k);
  }
}
