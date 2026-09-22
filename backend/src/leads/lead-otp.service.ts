import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { LeadMessengerService } from './lead-messenger.service';

/**
 * One-time codes that prove a landing-page visitor owns the WhatsApp number
 * and the email address they typed, before they can book a call.
 *
 * Kept in memory: the API runs as a single process, codes live ten minutes, and
 * a restart simply means "request a new code" - not worth a table. Only a hash
 * of each code is held. A number or address that verified stays verified for
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

/** Email codes share the maps with phone codes; the prefix keeps them apart. */
const emailKey = (email: string) => `email:${email}`;

@Injectable()
export class LeadOtpService {
  private readonly logger = new Logger(LeadOtpService.name);
  private readonly pending = new Map<string, Pending>();
  private readonly verified = new Map<string, number>();

  constructor(
    private readonly messenger: LeadMessengerService,
    private readonly mail: MailService,
  ) {}

  /** Send a fresh 6-digit code to `phone` (+91XXXXXXXXXX) on WhatsApp. */
  send(phone: string): Promise<SendResult> {
    return this.issue(phone, (code) => {
      const text = [
        `${code} is your NUSI verification code.`,
        '',
        'It expires in 10 minutes. Do not share this code with anyone.',
        '',
        '- Team NUSI',
      ].join('\n');
      return this.messenger.send('otp', phone, { code }, text);
    });
  }

  /** Send a fresh 6-digit code to `email` (already lower-cased). */
  sendEmail(email: string): Promise<SendResult> {
    return this.issue(emailKey(email), async (code) => {
      // Local dev has no Resend key: print the code so the form can still be tried.
      if (!this.mail.enabled && process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[dev] Email code for ${email}: ${code}`);
        return true;
      }
      return this.mail.send({ to: email, subject: `${code} is your NUSI verification code`, html: emailCodeHtml(code) });
    });
  }

  /** Check a code. On success the number counts as verified for 30 minutes. */
  verify(phone: string, code: string): VerifyResult {
    return this.check(phone, code);
  }

  verifyEmail(email: string, code: string): VerifyResult {
    return this.check(emailKey(email), code);
  }

  /** Did this number pass verification recently? Used when the lead is saved. */
  isVerified(phone: string): boolean {
    return this.passed(phone);
  }

  isEmailVerified(email: string): boolean {
    return this.passed(emailKey(email));
  }

  private async issue(key: string, deliver: (code: string) => Promise<boolean>): Promise<SendResult> {
    this.sweep();
    const now = Date.now();
    const prev = this.pending.get(key);
    const recent = (prev?.sendsThisHour ?? []).filter((t) => now - t < 3_600_000);

    if (prev && now - prev.sentAt < RESEND_AFTER_MS) {
      return { sent: false, reason: 'too_soon', resendInSec: Math.ceil((RESEND_AFTER_MS - (now - prev.sentAt)) / 1000) };
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) return { sent: false, reason: 'too_many' };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ok = await deliver(code).catch(() => false);
    if (!ok) {
      this.logger.warn(`OTP not delivered to ${key}`);
      return { sent: false, reason: 'unavailable' };
    }

    this.pending.set(key, {
      hash: hash(code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
      sendsThisHour: [...recent, now],
    });
    return { sent: true, resendInSec: RESEND_AFTER_MS / 1000 };
  }

  private check(key: string, code: string): VerifyResult {
    this.sweep();
    const entry = this.pending.get(key);
    if (!entry || entry.expiresAt < Date.now()) return { verified: false, reason: 'expired' };
    if (entry.attempts >= MAX_ATTEMPTS) return { verified: false, reason: 'too_many' };

    entry.attempts += 1;
    const given = hash((code || '').replace(/\D/g, ''));
    if (given.length !== entry.hash.length || !timingSafeEqual(given, entry.hash)) {
      return entry.attempts >= MAX_ATTEMPTS ? { verified: false, reason: 'too_many' } : { verified: false, reason: 'wrong' };
    }

    this.pending.delete(key);
    this.verified.set(key, Date.now() + VERIFIED_TTL_MS);
    return { verified: true };
  }

  private passed(key: string): boolean {
    const until = this.verified.get(key);
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

function emailCodeHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f8ee">
  <div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#4d7c0f;margin:0 0 16px">NUSI</div>
    <div style="background:#ffffff;border:1px solid #e2ecd3;border-radius:16px;padding:28px;color:#1f2937;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">Use this code to verify your email and book your NUSI call:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#3f6212;margin:8px 0 16px">${code}</div>
      <p style="margin:0;color:#6b7280;font-size:13px">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
  </div></body></html>`;
}
