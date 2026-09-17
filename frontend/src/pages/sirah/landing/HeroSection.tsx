import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Quote } from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';

/**
 * NUSI — landing hero.
 *
 * Two-column layout:
 *  - Left: question-hook headline + subhead + CTAs + trust strip
 *  - Right: a real dietitian's video testimonial in a portrait phone-style frame.
 *
 * The right column previously held a client → meal plan → progress card stack
 * (and before that an animated ecosystem diagram). A real practitioner talking
 * about NUSI is stronger proof than a mock UI, so the testimonial took its place.
 *
 * The video has sound, and browsers block unmuted autoplay, so it shows a poster
 * with a play button and starts with sound on the visitor's tap.
 */

// Fill these in to show a name/role caption under the video. Left blank until
// the real details are confirmed - never invent a testimonial's attribution.
const TESTIMONIAL = {
  name: '',
  role: '',
};

export function HeroSection() {
  return (
    <section className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-10 md:px-10 md:pt-16 lg:grid-cols-[1.25fr_1fr] lg:gap-10 lg:pb-32 lg:pt-20">
      {/* ── Text column ─────────────────────────────────────────────── */}
      <motion.div
        variants={stagger(0.08, 0.06)}
        initial="initial"
        animate="animate"
        className="relative flex flex-col items-start"
      >
        <motion.div variants={fadeUp}>
          <Glass
            variant="subtle"
            className="inline-flex items-center gap-2.5 rounded-full border-foreground/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground/70"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
            </span>
            For dietitians &amp; nutritionists
          </Glass>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 max-w-2xl text-balance text-[2.3rem] font-semibold leading-[1.06] tracking-tight text-foreground sm:text-5xl md:text-[3.4rem] lg:text-[3.8rem]"
        >
          Still running your diet practice on WhatsApp and Excel?{' '}
          <span className="bg-gradient-to-br from-teal-700 via-teal-500 to-teal-400 bg-clip-text text-transparent">
            There’s a better way.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-foreground/70 md:mt-7 md:text-lg"
        >
          NUSI is the all-in-one practice platform for dietitians and nutritionists. Manage clients,
          diet plans, food diaries, consultations and follow-ups in one place - and give every
          client your own branded app.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center md:mt-10"
        >
          <AIGlow intensity="default" animated>
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-7 py-3.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] cta-glow active:scale-[0.97] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </AIGlow>
          <a
            href="mailto:support@sirahdigital.in?subject=NUSI%20LIFE%20demo%20request"
            className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-white/40 px-7 py-3.5 text-sm text-foreground/80 backdrop-blur transition-colors hover:bg-foreground/[0.04] dark:bg-foreground/[0.03]"
          >
            Book a demo
            <ArrowRight className="h-3.5 w-3.5 opacity-50 transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55"
        >
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            14-day free trial
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-cyan-500" />
            Clients join free
          </span>
        </motion.div>
      </motion.div>

      {/* ── Testimonial column ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative mx-auto w-full max-w-[340px]"
      >
        <TestimonialVideo />
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Testimonial video — portrait 9:16 frame, tap to play with sound.
// ─────────────────────────────────────────────────────────────────────

function TestimonialVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function play() {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    void v.play();
  }

  const hasAttribution = TESTIMONIAL.name.length > 0;

  return (
    <div className="relative">
      {/* Brand-tinted halo so the frame sits in the page's gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 rounded-full bg-gradient-to-br from-teal-500/15 via-teal-400/10 to-teal-300/15 blur-3xl"
      />

      {/* Phone bezel: dark frame, hairline edge ring and a camera pill. */}
      <div className="relative rounded-[2.75rem] bg-[#0d1117] p-2.5 shadow-[0_0_0_2px_#2a3240,0_40px_100px_-30px_rgba(12,20,34,0.55)] transition-[transform,box-shadow] duration-500 hover:shadow-[0_0_0_2px_#2a3240,0_48px_110px_-28px_rgba(85,142,25,0.55)] motion-safe:hover:-translate-y-1.5 motion-safe:hover:rotate-[0.6deg]">
        <span aria-hidden className="absolute left-1/2 top-[18px] z-20 h-[18px] w-[72px] -translate-x-1/2 rounded-full bg-[#0d1117]" />
        <div className="relative overflow-hidden rounded-[2.2rem] bg-black">
          <video
            ref={videoRef}
            src="/testimonial.mp4"
            poster="/testimonial-poster.jpg"
            playsInline
            preload="metadata"
            controls={started}
            onEnded={() => setStarted(false)}
            className="aspect-[9/16] w-full object-cover"
          />

          {!started && (
            <button
              type="button"
              onClick={play}
              aria-label="Play testimonial video"
              className="group absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-black/0 to-black/25 p-5 pt-12 text-left"
            >
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white backdrop-blur">
                <Quote className="h-3 w-3" /> Dietitian story
              </span>

              <span className="grid h-16 w-16 place-items-center self-center rounded-full bg-white/90 text-teal-700 shadow-xl transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
                <Play className="ml-1 h-7 w-7 fill-current" />
              </span>

              <span className="text-sm font-medium leading-snug text-white">
                Hear from a practising dietitian who runs their practice on NUSI.
                <span className="mt-1 block text-xs font-normal text-white/70">1 min · tap to play with sound</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {hasAttribution && (
        <Glass className="relative mx-auto -mt-6 w-[88%] px-4 py-3 text-center">
          <div className="text-sm font-semibold text-foreground">{TESTIMONIAL.name}</div>
          {TESTIMONIAL.role && <div className="text-xs text-foreground/55">{TESTIMONIAL.role}</div>}
        </Glass>
      )}
    </div>
  );
}
