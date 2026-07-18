import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  Apple,
  ArrowRight,
  Banana,
  Bean,
  Carrot,
  Cherry,
  Citrus,
  Egg,
  Grape,
  Leaf,
  LeafyGreen,
  Milk,
  Nut,
  Salad,
  Sprout,
  Wheat,
} from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';

/**
 * SIRAH LIFE — landing hero.
 *
 * Two-column layout:
 *  - Left: headline + subhead + CTAs + trust strip
 *  - Right: a photographic produce visual — a finished nourish bowl ringed by
 *    the raw ingredients that went into it.
 *
 * This column previously held an animated "ecosystem" diagram: a Workspace hub
 * with six orbiting glass cards (Voice AI / Plate Vision / Analytics / Clients
 * / Programs / Wellness Score), Bezier connectors and mouse parallax. It was
 * replaced deliberately. The trade is real and worth remembering: the diagram
 * showed the product's surface area above the fold, while the photograph sells
 * the outcome. The feature cards live on in the sections below the fold, and
 * the old implementation is in git if the diagram is ever wanted back.
 *
 * Interaction is deliberately minimal here — a slow float plus a small mouse
 * parallax on the image, sharing the spring already driven by the section. A
 * photograph does not need to be animated to be persuasive, and an over-moving
 * hero fights the "one calm platform" promise in the subhead.
 */

// ─────────────────────────────────────────────────────────────────────
// HeroSection
// ─────────────────────────────────────────────────────────────────────

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  // Critically-damped spring — feels heavy, premium, never overshoots.
  const smoothX = useSpring(mouseX, { stiffness: 60, damping: 22, mass: 0.6 });
  const smoothY = useSpring(mouseY, { stiffness: 60, damping: 22, mass: 0.6 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Normalised offset from centre, ranging roughly -0.5..0.5
    mouseX.set((e.clientX - rect.left - rect.width / 2) / rect.width);
    mouseY.set((e.clientY - rect.top - rect.height / 2) / rect.height);
  }
  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-10 md:px-10 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-20"
    >
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
            AI Wellness OS · for wellness practices
          </Glass>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 max-w-2xl text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4.3rem]"
        >
          The{' '}
          <span className="bg-gradient-to-br from-blue-600 via-teal-500 to-cyan-400 bg-clip-text text-transparent">
            AI Wellness
          </span>
          <br />
          Operating System
          <br />
          <span className="text-foreground/55">for modern wellness practices.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-foreground/70 md:mt-7 md:text-lg"
        >
          Manage clients, programs, AI meal plans, voice coaching, plate-vision analysis,
          appointments and automation - from one calm platform your clients use free.
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
            href="mailto:support@sirahdigital.in?subject=SIRAH LIFE%20LIFE%20demo%20request"
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
            <span className="h-1 w-1 rounded-full bg-teal-500" />
            No card required
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-cyan-500" />
            DPDP-ready
          </span>
        </motion.div>
      </motion.div>

      {/* ── Produce column ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative mx-auto aspect-square w-full max-w-[560px]"
      >
        <ProduceVisual mouseX={smoothX} mouseY={smoothY} />
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Produce visual
// ─────────────────────────────────────────────────────────────────────

/**
 * The wordmark inside the ring.
 *
 * NOTE: this page's product is SIRAH LIFE; "Sirah Digital" is the company, and
 * already appears in the nav as "by Sirah Digital". Swap this one line to
 * 'SIRAH LIFE' if the hero should lead with the product instead.
 */
const RING_WORDMARK = 'Sirah Digital';
const RING_TAGLINE = 'Nutrition · Wellness';

/**
 * The produce ring. Drawn with icons rather than a generated picture on
 * purpose: it inherits the brand teal via currentColor, stays crisp at any
 * size, adds no image weight (lucide is already bundled), and the wordmark
 * stays real selectable text instead of pixels a screen reader can't read.
 *
 * Angles are computed, not hand-placed, so changing the array length re-spaces
 * the whole ring automatically.
 */
const RING_ICONS = [
  Apple, Carrot, LeafyGreen, Citrus, Banana, Sprout, Grape, Salad,
  Cherry, Wheat, Bean, Milk, Nut, Egg, Leaf, Sprout,
];

function ProduceVisual({
  mouseX,
  mouseY,
}: {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  // Small parallax — 14px at the extremes. Enough to feel alive on a mouse,
  // far short of the 32px the old orbit cards used; a hero that slides too far
  // reads as a bug rather than depth.
  const x = useTransform(mouseX, (v) => v * 14);
  const y = useTransform(mouseY, (v) => v * 14);

  return (
    <div className="relative h-full w-full">
      {/* Brand-tinted halo, so the circle sits in the page's gradient rather
          than being pasted onto it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/12 via-teal-500/10 to-cyan-400/12 blur-3xl"
      />

      <motion.div style={{ x, y }} className="absolute inset-0 grid place-items-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="relative grid h-full w-full place-items-center"
        >
          {/* ── Produce ring ──────────────────────────────────────────
              Counter-rotation: the ring turns slowly, and each icon turns
              back by the same amount, so the wreath revolves while every
              fruit stays upright. Without the counter-spin the icons
              cartwheel and it reads as a loading spinner. 90s is slow enough
              to be felt rather than watched. */}
          <motion.div
            aria-hidden
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          >
            {RING_ICONS.map((Icon, i) => {
              const angle = (i / RING_ICONS.length) * 360;
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 h-0 w-0"
                  style={{ transform: `rotate(${angle}deg) translateY(-44%)` }}
                >
                  {/* Counter-spin carries BOTH terms in one animation:
                      -angle undoes this icon's placement rotation, and the
                      further -360 undoes the ring's turn. Splitting them
                      across `style` and `animate` does not work - animate
                      wins and the placement term is silently dropped, which
                      cartwheels every icon. */}
                  <motion.div
                    animate={{ rotate: [-angle, -angle - 360] }}
                    transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
                    className="grid -translate-x-1/2 -translate-y-1/2 place-items-center"
                  >
                    <Icon
                      className="h-7 w-7 text-teal-600/70 dark:text-teal-300/60 md:h-8 md:w-8"
                      strokeWidth={1.5}
                    />
                  </motion.div>
                </div>
              );
            })}
          </motion.div>

          {/* Guide rings - kept from the old diagram; they give the wreath
              its structure and stop the icons floating in nothing. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[97%] w-[97%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-teal-600/15"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[74%] w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-600/15"
          />

          {/* ── Centrepiece ───────────────────────────────────────────
              The reference design puts a single hero fruit in the middle;
              here that's the real bowl - the outcome the practice actually
              delivers, rather than another icon. */}
          <div className="relative h-[62%] w-[62%]">
            <div className="h-full w-full overflow-hidden rounded-full ring-1 ring-white/60 shadow-[0_34px_80px_-28px_rgba(14,154,168,0.5)]">
              <img
                src="/illustrations/hero-produce-bowl.webp"
                srcSet="/illustrations/hero-produce-bowl-sm.webp 560w, /illustrations/hero-produce-bowl.webp 1120w"
                sizes="(max-width: 1024px) 60vw, 360px"
                alt="A nourish bowl of rice, dal and salad, made from fresh vegetables and fruit"
                width={1120}
                height={1120}
                /* Hero image and almost certainly the LCP element: eager +
                   high priority, never lazy. Lazy-loading an above-the-fold
                   hero delays the very paint the metric measures. */
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="h-full w-full scale-[1.35] object-cover"
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/25"
            />
          </div>

          {/* ── Wordmark ──────────────────────────────────────────────
              Real text, not baked into an image: crisp on every display,
              readable by a screen reader, and recolours with the theme. */}
          <div className="pointer-events-none absolute bottom-[7%] left-1/2 -translate-x-1/2 text-center">
            <div className="rounded-full border border-white/50 bg-white/70 px-4 py-1.5 shadow-[0_10px_30px_-12px_rgba(14,154,168,0.5)] backdrop-blur-md dark:bg-foreground/[0.08]">
              <div className="text-[13px] font-semibold tracking-[0.14em] text-foreground/85">
                {RING_WORDMARK}
              </div>
              <div className="text-[9px] uppercase tracking-[0.22em] text-foreground/45">
                {RING_TAGLINE}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

