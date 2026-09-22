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

/**
 * The verification email - "digit boxes" design: each digit in its own green
 * box, like the code field on the booking form. Tables and inline styles only,
 * because Gmail and Outlook ignore flexbox, grid and <style> blocks.
 */
function emailCodeHtml(code: string): string {
  const font = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
  const digits = code
    .split('')
    .map(
      (d) =>
        `<td style="padding:0 4px"><div style="width:44px;height:54px;line-height:54px;border:2px solid #6db022;` +
        `border-radius:10px;background:#f6fbef;text-align:center;font-family:${font};font-size:26px;` +
        `font-weight:800;color:#3f6212">${d}</div></td>`,
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f8ee">
  <div style="display:none;max-height:0;overflow:hidden">${code} is your NUSI verification code. It expires in 10 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8ee">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:460px;background:#ffffff;border:1px solid #e5e9df;border-radius:14px">
        <tr><td style="padding:24px 22px 8px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px">
              <img src="https://nusi.in/icon-192.png" width="32" height="32" alt="NUSI"
                   style="display:block;border:0;border-radius:8px">
            </td>
            <td style="font-family:${font};font-size:17px;font-weight:700;color:#1a2e05">NUSI</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 22px 0;font-family:${font};font-size:15px;line-height:1.6;color:#1f2937">
          Here is your code to verify your email:
        </td></tr>
        <tr><td align="center" style="padding:18px 18px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
        </td></tr>
        <tr><td style="padding:0 22px 24px;font-family:${font};font-size:13px;line-height:1.6;color:#6b7280">
          This code expires in 10 minutes. If you didn't request it, you can ignore this email.
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-family:${font};font-size:12px;color:#8a9480">
        <a href="https://nusi.in" style="color:#4d7c0f;text-decoration:none">nusi.in</a> &middot; support@nusi.in
      </p>
    </td></tr>
  </table>
</body></html>`;
}
