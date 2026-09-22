import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, Lock, Play, ShieldCheck, Volume2 } from 'lucide-react';

import { Glass, fadeUp } from '@/design-system';
import { api, ApiError } from '@/lib/api';
import {
  WATCHED_FRACTION,
  getWatched,
  markTestimonialWatched,
  subscribeWatched,
} from './testimonialWatch';

/**
 * Landing lead form — the destination for paid traffic (Meta ads).
 *
 * The visitor verifies their WhatsApp number with a one-time code, then
 * submits to POST /api/v1/public/leads, which books the call (saves the lead)
 * and sends a WhatsApp confirmation from NUSI's own number. The server refuses
 * any booking without a verified code. Ad parameters (utm_*, fbclid) ride along
 * in `source` so a lead can be traced back to the campaign that produced it.
 *
 * The table lives in supabase/migrations/20260918090000_landing_leads.sql.
 *
 * The form sits next to the testimonial and stays locked until the visitor has
 * watched it (here or in the hero), so every lead has seen a practising
 * dietitian talk about NUSI first.
 */

const PRACTICE_SIZES = [
  { value: 'solo', label: 'Just me' },
  { value: 'small', label: '2 - 5 people' },
  { value: 'large', label: '6 or more' },
] as const;

type Status = 'idle' | 'sending' | 'done' | 'error';

/** name@domain.tld - stricter than the browser's type="email", which allows a@b. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Keeps only the 10-digit mobile number: drops spaces and punctuation, and a
 * pasted country code or trunk prefix (+91 98765 43210, 098765 43210).
 */
function normalisePhone(raw: string) {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** "Mobile numbers start with 6-9" under the field, for a complete but impossible number. */
function PhoneHint({ phone }: { phone: string }) {
  if (phone.length === 10 && !/^[6-9]/.test(phone)) {
    return <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">Mobile numbers start with 6, 7, 8 or 9.</p>;
  }
  return null;
}

interface OtpState {
  stage: 'idle' | 'sending' | 'sent' | 'verifying';
  verified: boolean;
  /** The code couldn't be delivered - booking is allowed unverified. */
  undeliverable: boolean;
  error: string;
  resendIn: number;
  send: () => void;
  verify: (code: string) => void;
}

type OtpChannel = 'phone' | 'email';

/** Where each channel's code is sent/checked, and what it is sent with. */
const OTP_API: Record<OtpChannel, { send: string; verify: string; body: (target: string) => Record<string, string> }> = {
  phone: {
    send: '/api/v1/public/leads/otp/send',
    verify: '/api/v1/public/leads/otp/verify',
    body: (phone) => ({ phone: `+91${phone}` }),
  },
  email: {
    send: '/api/v1/public/leads/otp/email/send',
    verify: '/api/v1/public/leads/otp/email/verify',
    body: (email) => ({ email }),
  },
};

/**
 * One-time code for the phone number (on WhatsApp) or the email address. The
 * server keeps the code and records the verification itself, so a lead is
 * only ever marked verified if the right code really reached them.
 */
function useOtp(target: string, channel: OtpChannel = 'phone'): OtpState {
  const [stage, setStage] = useState<OtpState['stage']>('idle');
  const [verified, setVerified] = useState(false);
  const [undeliverable, setUndeliverable] = useState(false);
  const [error, setErr] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // A different number / address starts over.
  useEffect(() => {
    setStage('idle');
    setVerified(false);
    setUndeliverable(false);
    setErr('');
    setResendIn(0);
  }, [target]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function send() {
    setStage('sending');
    setErr('');
    try {
      const res = await api.post<{ sent: boolean; reason?: string; resendInSec?: number }>(
        OTP_API[channel].send,
        { body: OTP_API[channel].body(target), skipAuth: true },
      );
      if (res?.sent || res?.reason === 'too_soon') {
        setStage('sent');
        setResendIn(res.resendInSec ?? 30);
      } else if (res?.reason === 'too_many') {
        setStage('idle');
        setErr('Too many codes requested. Please try again in an hour.');
      } else {
        setStage('idle');
        setUndeliverable(true);
      }
    } catch {
      setStage('idle');
      setUndeliverable(true);
    }
  }

  async function verify(code: string) {
    setStage('verifying');
    setErr('');
    try {
      const res = await api.post<{ verified: boolean; reason?: string }>(OTP_API[channel].verify, {
        body: { ...OTP_API[channel].body(target), code },
        skipAuth: true,
      });
      setStage('sent');
      if (res?.verified) {
        setVerified(true);
        return;
      }
      setErr(
        res?.reason === 'expired'
          ? 'That code has expired. Tap "Resend code".'
          : res?.reason === 'too_many'
            ? 'Too many wrong tries. Tap "Resend code" for a new one.'
            : 'That code is not right. Please check and try again.',
      );
    } catch {
      setStage('sent');
      setErr('Could not check the code. Please try again.');
    }
  }

  return { stage, verified, undeliverable, error, resendIn, send, verify };
}

const OTP_COPY: Record<OtpChannel, { done: string; intro: string; enter: string }> = {
  phone: {
    done: 'Number verified',
    intro: "We'll send a code to this number on WhatsApp to confirm your booking.",
    enter: 'Enter the 6-digit code we sent you on WhatsApp.',
  },
  email: {
    done: 'Email verified',
    intro: "We'll email a code to this address to confirm it.",
    enter: 'Enter the 6-digit code we emailed you. Check spam if you do not see it.',
  },
};

/** "Send code" -> enter the 6 digits -> verified. Sits under its field. */
function OtpBox({ otp, channel = 'phone' }: { otp: OtpState; channel?: OtpChannel }) {
  const [code, setCode] = useState('');
  const copy = OTP_COPY[channel];

  if (otp.verified) {
    return (
      <p className="sm:col-span-2 -mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4" /> {copy.done}
      </p>
    );
  }
  if (otp.undeliverable) {
    return (
      <div className="sm:col-span-2 -mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
        <span>We couldn&apos;t send the code right now. Please try again in a minute.</span>
        <button type="button" onClick={otp.send} className="font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300">
          Try again
        </button>
      </div>
    );
  }

  const sent = otp.stage === 'sent' || otp.stage === 'verifying';

  return (
    <div className="sm:col-span-2 -mt-1 rounded-xl border border-teal-600/20 bg-teal-500/[0.05] p-3.5">
      {!sent ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-foreground/75">{copy.intro}</span>
          <button
            type="button"
            onClick={otp.send}
            disabled={otp.stage === 'sending'}
            className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600"
          >
            {otp.stage === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {otp.stage === 'sending' ? 'Sending...' : 'Send code'}
          </button>
        </div>
      ) : (
        <div>
          <div className="text-sm text-foreground/75">{copy.enter}</div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (code.length === 6) otp.verify(code);
                }
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="------"
              aria-label="Verification code"
              className="w-36 rounded-lg border border-foreground/15 bg-canvas px-3 py-2 text-center text-lg tracking-[0.4em] text-foreground focus:border-teal-600/50 focus:outline-none focus:ring-4 focus:ring-teal-500/15"
            />
            <button
              type="button"
              onClick={() => otp.verify(code)}
              disabled={code.length !== 6 || otp.stage === 'verifying'}
              className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600"
            >
              {otp.stage === 'verifying' && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify
            </button>
            <button
              type="button"
              onClick={otp.send}
              disabled={otp.resendIn > 0}
              className="text-xs text-foreground/60 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60"
            >
              {otp.resendIn > 0 ? `Resend in ${otp.resendIn}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}
      {otp.error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{otp.error}</p>}
    </div>
  );
}

/** Ad/campaign parameters from the URL, so leads can be attributed. */
function captureSource() {
  const params = new URLSearchParams(window.location.search);
  const source: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']) {
    const value = params.get(key);
    if (value) source[key] = value.slice(0, 200);
  }
  if (document.referrer) source.referrer = document.referrer.slice(0, 200);
  return source;
}

export function LeadForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  // Indian mobile: exactly 10 digits, starting 6-9. Kept controlled so typed
  // spaces, +91 or extra digits can never reach the database.
  const [phone, setPhone] = useState('');
  // Only claim a WhatsApp confirmation when the backend says it actually sent one.
  const [confirmedOnWhatsapp, setConfirmedOnWhatsapp] = useState(false);
  const validMobile = /^[6-9]\d{9}$/.test(phone);
  const otp = useOtp(phone);
  const [emailInput, setEmailInput] = useState('');
  const emailValue = emailInput.trim().toLowerCase();
  const validEmail = EMAIL_RE.test(emailValue);
  const emailOtp = useOtp(validEmail ? emailValue : '', 'email');
  const watched = useSyncExternalStore(subscribeWatched, getWatched, () => false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;
    const data = new FormData(e.currentTarget);

    if (!/^[6-9]\d{9}$/.test(phone)) {
      setStatus('error');
      setError('Enter a 10-digit mobile number (it should start with 6, 7, 8 or 9).');
      return;
    }

    const email = String(data.get('email') ?? '').trim().toLowerCase();
    // A call is only booked once the WhatsApp code is verified (the server
    // enforces this too).
    if (!otp.verified) {
      setStatus('error');
      setError('Please verify your number - tap "Send code" and enter the code we send on WhatsApp.');
      return;
    }

    if (!EMAIL_RE.test(email)) {
      setStatus('error');
      setError('Enter a valid email address, like you@practice.com.');
      return;
    }

    if (!emailOtp.verified) {
      setStatus('error');
      setError('Please verify your email - tap "Send code" under the email and enter the code we send you.');
      return;
    }

    // What they want from the call, in their own words - the caller reads it first.
    const purpose = String(data.get('purpose') ?? '').trim();
    if (purpose.length < 3) {
      setStatus('error');
      setError('Tell us what you would like the call to be about.');
      return;
    }

    setStatus('sending');
    setError('');

    const leadPayload = {
      name: String(data.get('name') ?? '').trim(),
      phone: `+91${phone}`,
      email,
      city: String(data.get('city') ?? '').trim() || undefined,
      practice_size: String(data.get('practice_size') ?? '') || undefined,
      purpose,
      source: captureSource(),
    };

    let submitted = false;
    let whatsappSent = false;

    // 1. The backend saves the lead AND sends the WhatsApp confirmation.
    try {
      const res = await api.post<{ ok: boolean; whatsapp_sent: boolean }>('/api/v1/public/leads', {
        body: leadPayload,
        skipAuth: true,
      });
      submitted = true;
      whatsappSent = !!res?.whatsapp_sent;
    } catch (apiErr) {
      // No direct-to-database fallback: it would book a call without the
      // verified code. Show why instead.
      setStatus('error');
      setError(
        apiErr instanceof ApiError && apiErr.status >= 400 && apiErr.status < 500
          ? apiErr.message || 'Please check your details and try again.'
          : 'Something went wrong. Please try again in a moment.',
      );
      return;
    }

    if (!submitted) {
      setStatus('error');
      setError('Something went wrong. Please try again, or WhatsApp us.');
      return;
    }
    setConfirmedOnWhatsapp(whatsappSent);
    setStatus('done');
  }

  return (
    <section id="demo-form" className="relative z-10 mx-auto max-w-4xl scroll-mt-8 px-6 pb-24 md:px-10">
      <motion.div variants={fadeUp} initial="initial" whileInView="animate" viewport={{ once: true, margin: '-80px' }}>
        <Glass variant="heavy" className="relative overflow-hidden p-8 md:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(109,176,34,0.22), transparent 70%)' }}
          />

          {status === 'done' ? (
            <div className="relative py-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                <Check className="h-7 w-7" strokeWidth={2.5} />
              </span>
              <h2 className="mt-5 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Thank you — we have your details!
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-foreground/65 md:text-base">
                {confirmedOnWhatsapp && (
                  <>
                    We’ve sent a confirmation to your WhatsApp (
                    <span className="font-medium text-foreground">+91 {phone}</span>).{' '}
                  </>
                )}
                Someone from the NUSI team will call you within one working day to set up your practice and walk you through the platform.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-600/25 bg-teal-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-200 md:text-[13px]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal-600 dark:bg-teal-300" />
                  Book a free demo
                </span>
                <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  See NUSI with your own practice in mind.
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-foreground/65 md:text-base">
                  Leave your details and we will call you within one working day - a short walkthrough,
                  your questions answered, and help moving your existing clients across.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,240px)_1fr] md:items-start">
                <SideTestimonial />

                <div className="relative">
                  {!watched && (
                    <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-canvas/70 backdrop-blur-[3px]">
                      <div className="px-6 text-center">
                        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                          <Lock className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          Watch the 1-minute story to unlock
                        </p>
                        <p className="mt-1 text-xs text-foreground/60">
                          Hear Dt. Aysha Nasreen, then tell us about your practice.
                        </p>
                      </div>
                    </div>
                  )}

              <form onSubmit={handleSubmit} aria-hidden={!watched} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <fieldset disabled={!watched} className="contents">
                <Field label="Your name" name="name" autoComplete="name" placeholder="Dt. Priya Sharma" required />
                <Field label="City" name="city" autoComplete="address-level2" placeholder="Chennai" />
                <Field
                  label="Phone / WhatsApp"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  prefix="+91"
                  value={phone}
                  onChange={(v) => setPhone(normalisePhone(v))}
                  required
                  className="sm:col-span-2"
                  hint={<PhoneHint phone={phone} />}
                />
                {validMobile && <OtpBox otp={otp} />}
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@practice.com"
                  value={emailInput}
                  onChange={setEmailInput}
                  required
                  className="sm:col-span-2"
                />
                {validEmail && <OtpBox otp={emailOtp} channel="email" />}

                <div className="sm:col-span-2">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-foreground/60">
                    How many people in your practice?
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {PRACTICE_SIZES.map((size, i) => (
                      <label
                        key={size.value}
                        className="cursor-pointer rounded-full border border-foreground/12 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/75 transition-colors has-[:checked]:border-teal-600/50 has-[:checked]:bg-teal-500/12 has-[:checked]:text-teal-800 hover:border-teal-500/40 dark:has-[:checked]:text-teal-200"
                      >
                        <input
                          type="radio"
                          name="practice_size"
                          value={size.value}
                          defaultChecked={i === 0}
                          className="sr-only"
                        />
                        {size.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="lead-purpose"
                    className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-foreground/60"
                  >
                    What is the purpose of the call? <span className="text-teal-600">*</span>
                  </label>
                  <textarea
                    id="lead-purpose"
                    name="purpose"
                    rows={3}
                    maxLength={300}
                    required
                    placeholder="E.g. I want to move my 40 clients from Excel and see how diet plans and follow-ups work."
                    className="w-full resize-none rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-foreground/35 transition-colors focus:border-teal-500/50 focus:bg-background focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                {status === 'error' && (
                  <p role="alert" className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
                )}

                <div className="sm:col-span-2 flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
                  <button
                    type="submit"
                    disabled={status === 'sending' || !otp.verified || !emailOtp.verified}
                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-8 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-60"
                  >
                    {status === 'sending' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      <>Book a call with us <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                    )}
                  </button>
                  <span className="text-xs text-foreground/55">
                    {otp.verified && emailOtp.verified
                      ? 'Free 14-day trial · No obligation'
                      : !otp.verified && !emailOtp.verified
                        ? 'Verify your number and email to book'
                        : !otp.verified
                          ? 'Verify your number to book'
                          : 'Verify your email to book'}
                  </span>
                </div>
                </fieldset>
              </form>
                </div>
              </div>
            </div>
          )}
        </Glass>
      </motion.div>
    </section>
  );
}

/** The testimonial, playable right here so nobody has to scroll back up. */
function SideTestimonial() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);

  function play() {
    setStarted(true);
    void videoRef.current?.play();
  }

  /**
   * Starts by itself when the booking section scrolls into view (once per
   * visit, and not if it has already been watched). Browsers only allow sound
   * after the visitor has tapped the page, so it tries with sound and falls
   * back to muted with a "Tap for sound" button. Pauses when scrolled away.
   */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let tried = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6 && !tried && !getWatched()) {
          tried = true;
          setStarted(true);
          v.muted = false;
          v.play().catch(() => {
            v.muted = true;
            setMuted(true);
            v.play().catch(() => setStarted(false));
          });
        } else if (entry.intersectionRatio < 0.2 && !v.paused) {
          v.pause();
        }
      },
      { threshold: [0, 0.2, 0.6] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  function unmute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    void v.play();
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (v && v.duration && v.currentTime >= v.duration * WATCHED_FRACTION) {
      markTestimonialWatched();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[240px]">
      <div className="relative overflow-hidden rounded-[1.6rem] bg-black shadow-[0_24px_50px_-28px_rgba(12,20,34,0.6)] ring-1 ring-foreground/10">
        <video
          ref={videoRef}
          src="/testimonial.mp4"
          poster="/testimonial-poster-v2.jpg"
          playsInline
          preload="metadata"
          controls={started}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            markTestimonialWatched();
            setStarted(false);
          }}
          className="aspect-[9/16] w-full object-cover"
        />
        {!started && (
          <button
            type="button"
            onClick={play}
            aria-label="Play Dt. Aysha Nasreen's story"
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-black/70 via-black/10 to-black/25 text-white"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-teal-700 shadow-xl transition-transform duration-200 group-hover:scale-105">
              <Play className="ml-1 h-6 w-6 fill-current" />
            </span>
            <span className="px-4 text-xs font-medium leading-snug">Play the 1-minute story</span>
          </button>
        )}
        {started && muted && (
          <button
            type="button"
            onClick={unmute}
            className="absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-teal-800 shadow-lg transition-transform hover:scale-105"
          >
            <Volume2 className="h-3.5 w-3.5" /> Tap for sound
          </button>
        )}
      </div>
      <div className="mt-3 text-center">
        <div className="text-sm font-semibold text-foreground">Dt. Aysha Nasreen</div>
        <div className="text-xs text-foreground/55">Dietitian</div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
  required,
  autoComplete,
  inputMode,
  maxLength,
  prefix,
  value,
  onChange,
  hint,
  suffix,
  labelAside,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: 'numeric' | 'tel' | 'text';
  maxLength?: number;
  /** Fixed, non-editable lead-in shown inside the field (e.g. the +91 country code). */
  prefix?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Live feedback shown under the input. */
  hint?: ReactNode;
  /** Shown inside the field, after the value (e.g. the WhatsApp result). */
  suffix?: ReactNode;
  /** Extra classes on the wrapper, e.g. to span both grid columns. */
  className?: string;
  /** Shown at the right end of the label row (e.g. the WhatsApp result). */
  labelAside?: ReactNode;
}) {
  return (
    <label className={className ? `block ${className}` : 'block'}>
      <span className="mb-2 flex items-baseline justify-between gap-2 text-xs font-medium uppercase tracking-[0.12em] text-foreground/60">
        <span>
          {label}{required && <span className="text-teal-700 dark:text-teal-300"> *</span>}
        </span>
        {labelAside && <span className="text-[11px] normal-case tracking-normal">{labelAside}</span>}
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-foreground/12 bg-foreground/[0.03] px-4 focus-within:border-teal-600/50 focus-within:ring-4 focus-within:ring-teal-500/15">
        {prefix && <span className="text-sm text-foreground/60">{prefix}</span>}
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className="w-full min-w-0 bg-transparent py-3 text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
        />
        {suffix}
      </div>
      {hint}
    </label>
  );
}
