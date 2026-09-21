import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, Check, Loader2, Lock, Play } from 'lucide-react';

import { Glass, fadeUp } from '@/design-system';
import { supabase } from '@/integrations/supabase/client';
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
 * Submits to POST /api/v1/public/leads, which saves the lead and sends the
 * visitor a WhatsApp confirmation from NUSI's own number. If the API can't be
 * reached, the lead is written straight to the `leads` table instead (RLS
 * allows INSERT only, so nobody can read leads back from the browser) - no
 * lead is ever lost. Ad parameters (utm_*, fbclid) ride along in `source` so a
 * lead can be traced back to the campaign that produced it.
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
    if (!EMAIL_RE.test(email)) {
      setStatus('error');
      setError('Enter a valid email address, like you@practice.com.');
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
      // A 4xx means the server refused the details — say so rather than saving
      // them anyway. Only an unreachable server (network, 404, 5xx) falls back
      // to writing the lead straight to Supabase, so no lead is ever lost.
      if (apiErr instanceof ApiError && apiErr.status >= 400 && apiErr.status < 500 && apiErr.status !== 404) {
        setStatus('error');
        setError(apiErr.message || 'Please check your details and try again.');
        return;
      }
      const { error: insertError } = await (supabase as SupabaseClient).from('leads').insert({
        ...leadPayload,
        city: leadPayload.city || null,
        practice_size: leadPayload.practice_size || null,
      });
      if (!insertError) submitted = true;
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
                />
                <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@practice.com" required />
                <Field label="City" name="city" autoComplete="address-level2" placeholder="Chennai" />

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

                {status === 'error' && (
                  <p role="alert" className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
                )}

                <div className="sm:col-span-2 flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-8 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97] disabled:opacity-60"
                  >
                    {status === 'sending' ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      <>Request my demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>
                    )}
                  </button>
                  <span className="text-xs text-foreground/55">Free 14-day trial · No obligation</span>
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

  function play() {
    setStarted(true);
    void videoRef.current?.play();
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
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.12em] text-foreground/60">
        {label}{required && <span className="text-teal-700 dark:text-teal-300"> *</span>}
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
          className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
        />
      </div>
    </label>
  );
}
