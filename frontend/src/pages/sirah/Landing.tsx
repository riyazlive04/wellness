import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Camera, BarChart3, ArrowRight, Check,
  UserPlus, Palette, Rocket, LineChart,
  ShieldCheck, BellRing, FileSpreadsheet, MessageCircle, CalendarClock,
  LayoutTemplate, ClipboardList, UserMinus, Clock,
  Smartphone, Users, HeartHandshake, LayoutDashboard, Stethoscope, FileText,
} from 'lucide-react';
import {
  BrandMark,
  Glass,
  fadeUp,
  stagger,
  Wordmark,
} from '@/design-system';
import { HeroSection } from './landing/HeroSection';
import { LeadForm } from './landing/LeadForm';

export default function SirahLanding() {
  useForceLightTheme();

  // The landing scrolls inside this container (not the window), so every
  // scroll-linked effect reads from it.
  const scrollRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const demoVideoRef = useRef<HTMLVideoElement>(null);
  // The walkthrough waits for a tap so its designed thumbnail is actually seen.
  const [demoStarted, setDemoStarted] = useState(false);
  const reduceMotion = useReducedMotion();

  const { scrollY, scrollYProgress } = useScroll({ container: scrollRef });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  // Header turns into a frosted bar once the visitor starts scrolling.
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  // Hero drifts up and fades slightly as it scrolls away.
  const heroY = useTransform(scrollY, [0, 700], [0, reduceMotion ? 0 : -90]);
  const heroOpacity = useTransform(scrollY, [0, 700], [1, reduceMotion ? 1 : 0.35]);

  // Demo video tilts up into place as it scrolls into view.
  const { scrollYProgress: demoProgress } = useScroll({
    container: scrollRef,
    target: demoRef,
    offset: ['start end', 'center center'],
  });
  const demoRotateX = useTransform(demoProgress, [0, 1], [reduceMotion ? 0 : 14, 0]);
  const demoScale = useTransform(demoProgress, [0, 1], [reduceMotion ? 1 : 0.92, 1]);

  return (
    <div ref={scrollRef} className="relative h-screen overflow-y-auto overflow-x-hidden bg-canvas text-foreground">
      {/* Reading progress bar */}
      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-teal-700 via-teal-500 to-teal-300"
      />

      {/* Grain overlay (subtle) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/></filter><rect width=\'100%\' height=\'100%\' filter=\'url(%23n)\' opacity=\'0.6\'/></svg>")',
        }}
      />

      {/* Top nav */}
      <header
        className={
          'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300 ' +
          (scrolled
            ? 'bg-canvas/75 shadow-[0_1px_0_0_hsl(var(--foreground)/0.06)] backdrop-blur-xl'
            : 'bg-transparent')
        }
      >
        <div
          className={
            'mx-auto flex max-w-7xl items-center justify-between px-6 transition-[padding] duration-300 md:px-10 ' +
            (scrolled ? 'py-3' : 'py-6')
          }
        >
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div className="flex flex-col leading-none">
            <Wordmark className="text-base" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              by Sirah Digital
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-3 whitespace-nowrap text-sm text-foreground/70 md:flex">
          <a
            href="#demo-form"
            className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            Book a demo
          </a>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <a
            href="#demo-form"
            className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white"
          >
            Book a demo
          </a>
        </div>
        </div>
      </header>

      {/* Hero - interactive wellness ecosystem */}
      <motion.div style={{ y: heroY, opacity: heroOpacity }}>
        <HeroSection />
      </motion.div>

      {/* What is NUSI - one-sentence definition + the three parts of the product */}
      <section id="what" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 pb-24 md:px-10">
        <Reveal className="mb-12 text-center">
          <Eyebrow>What is NUSI</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            One platform that runs your entire dietetics practice.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65 md:text-base">
            NUSI brings everything a dietitian does outside the consultation room - client records, diet plans, food tracking, follow-ups and appointments - into one system. You work from a dashboard; your clients follow their plan in an app branded as your practice.
          </p>
        </Reveal>
        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {productParts.map((part) => (
            <motion.div key={part.title} variants={fadeUp}>
              <Glass className={`h-full p-6 ${CARD_HOVER}`}>
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300 transition-transform duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110">
                  <part.icon className="h-5 w-5" />
                </span>
                <div className="mt-4 text-xs uppercase tracking-[0.14em] text-foreground/50">{part.label}</div>
                <div className="mt-1 text-base font-semibold text-foreground">{part.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-foreground/65">{part.body}</div>
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Problems we solve - each card is a real day-to-day pain, then the fix */}
      <section id="problems" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 pb-24 md:px-10">
        <Reveal className="mb-12 text-center">
          <Eyebrow>Problems we solve</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Running a nutrition practice shouldn't feel like this.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65 md:text-base">
            Most dietitians juggle WhatsApp, Excel, Word, a notebook and a UPI app - and lose hours every week to work that isn't nutrition. These are the problems NUSI was built to fix.
          </p>
        </Reveal>
        <motion.div
          variants={stagger(0.05, 0.06)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {painPoints.map((p) => (
            <motion.div key={p.problem} variants={fadeUp}>
              <Glass className={`flex h-full flex-col p-6 ${CARD_HOVER}`}>
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300 transition-transform duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110">
                  <p.icon className="h-5 w-5" />
                </span>
                <div className="mt-4 text-base font-semibold text-foreground">{p.problem}</div>
                <div className="mb-5 mt-2 text-sm leading-relaxed text-foreground/60">{p.pain}</div>
                <div className="mt-auto flex items-start gap-2 border-t border-foreground/[0.07] pt-4 text-sm text-foreground/85">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={2.5} />
                  <span><span className="font-semibold">With NUSI: </span>{p.fix}</span>
                </div>
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Features - compact 4x2 grid inside one bordered panel: small icon,
          title and a single line each, so the whole product fits one glance. */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <Reveal className="mb-10 text-center">
          <Eyebrow>Features</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Everything a nutrition practice runs on.
          </h2>
        </Reveal>
        <motion.div
          variants={stagger(0.03, 0.05)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.08] sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className="group flex items-start gap-3.5 bg-canvas p-5 transition-colors duration-200 hover:bg-teal-500/[0.05]"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-teal-500/10 text-teal-700 transition-transform duration-300 motion-safe:group-hover:scale-110 dark:text-teal-300">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{f.title}</div>
                <div className="mt-1 text-[13px] leading-snug text-foreground/60">{f.body}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Why NUSI - the reasons to buy, framed as outcomes for the practice */}
      <section id="why" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 pb-24 md:px-10">
        <Glass variant="heavy" className="relative overflow-hidden p-8 md:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(109,176,34,0.22), transparent 70%)' }}
          />
          <div className="relative">
        <Reveal className="mb-12 text-center">
          <Eyebrow>Why dietitians choose NUSI</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            More time for clients. Better results. A practice that grows.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65 md:text-base">
            NUSI isn't another app to manage - it replaces the ones you already juggle, and gives you back hours every week to spend on the clients you care for.
          </p>
        </Reveal>
            <motion.div
              variants={stagger(0.05, 0.06)}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: '-80px' }}
              className="grid grid-cols-1 gap-x-8 gap-y-7 text-left sm:grid-cols-2 lg:grid-cols-3"
            >
              {reasons.map((r) => (
                <motion.div key={r.title} variants={fadeUp} className="group flex gap-4">
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300 transition-transform duration-300 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground transition-colors group-hover:text-teal-700 dark:group-hover:text-teal-300">{r.title}</div>
                    <div className="mt-1.5 text-sm leading-relaxed text-foreground/60">{r.body}</div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Glass>
      </section>

      {/* How it works - five named stages of the dietitian's journey on NUSI.
          On large screens a connector line runs behind the numbered markers. */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 pb-24 md:px-10">
        <Reveal className="mb-14 text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Five steps from scattered to sorted.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/65 md:text-base">
            Most practices are fully set up in an afternoon.
          </p>
        </Reveal>
        <motion.ol
          variants={stagger(0.05, 0.1)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5"
        >
          <motion.span
            aria-hidden
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="pointer-events-none absolute left-[10%] right-[10%] top-6 hidden h-px origin-left bg-gradient-to-r from-transparent via-teal-500/50 to-transparent lg:block"
          />
          {steps.map((s, i) => (
            <motion.li key={s.stage} variants={fadeUp} className="group relative flex flex-col items-center text-center">
              <span className="relative grid h-12 w-12 place-items-center rounded-full border border-teal-500/30 bg-canvas text-teal-700 shadow-[0_0_0_6px_hsl(var(--canvas))] transition-all duration-300 group-hover:border-teal-500 group-hover:bg-teal-600 group-hover:text-white motion-safe:group-hover:scale-110 dark:text-teal-300 dark:group-hover:text-white">
                <s.icon className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
              </span>
              <div className="mt-5 bg-gradient-to-br from-teal-700 via-teal-500 to-teal-400 bg-clip-text text-lg font-bold uppercase tracking-[0.08em] text-transparent">
                {s.stage}
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">{s.title}</div>
              <div className="mt-2 max-w-[16rem] text-xs leading-relaxed text-foreground/60">{s.body}</div>
            </motion.li>
          ))}
        </motion.ol>
      </section>

      {/* Product demo — the new-nutritionist onboarding walkthrough, as a
          marketing tutorial. Silent screen recording with burned-in captions,
          so it autoplays muted + loops when scrolled into view. */}
      <section id="demo" className="relative z-10 mx-auto max-w-5xl px-6 pb-24 md:px-10">
        <Reveal className="mb-10 text-center">
          <Eyebrow>Watch the walkthrough</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            From sign-up to a live workspace, in minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/60 md:text-base">
            Watch a nutritionist pick a plan, brand their practice and verify their details -
            and go live in under a minute. No setup calls, no waiting.
          </p>
        </Reveal>

        <motion.div
          ref={demoRef}
          style={{ rotateX: demoRotateX, scale: demoScale, transformPerspective: 1400 }}
          className="relative origin-bottom"
        >
          {/* ambient brand glow so the frame lifts off the page */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 -bottom-6 top-10 -z-10 opacity-60 blur-3xl"
            style={{
              background:
                'radial-gradient(60% 60% at 50% 100%, hsl(var(--brand-magenta) / 0.18), transparent 70%)',
            }}
          />
          {/* Laptop: dark screen bezel with a camera dot, then an aluminium
              base with a thumb notch. The video fills the screen. */}
          <div className="mx-auto w-full max-w-[920px]">
            <div className="relative rounded-t-[1.4rem] rounded-b-md bg-[#0d1117] p-3 pt-6 shadow-[0_0_0_2px_#2a3240,0_44px_120px_-32px_rgba(12,20,34,0.5)] transition-shadow duration-500 hover:shadow-[0_0_0_2px_#2a3240,0_50px_130px_-30px_rgba(85,142,25,0.45)] md:p-4 md:pt-7">
              <span aria-hidden className="absolute left-1/2 top-2.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#2a3240] md:top-3" />
              <div className="relative overflow-hidden rounded-md">
                <video
                  ref={demoVideoRef}
                  src="/tutorial-onboarding.mp4"
                  poster="/tutorial-onboarding-poster.jpg"
                  muted
                  playsInline
                  controls={demoStarted}
                  preload="metadata"
                  onEnded={() => setDemoStarted(false)}
                  aria-label="NUSI new nutritionist onboarding walkthrough"
                  className="aspect-video w-full bg-black"
                />
                {!demoStarted && (
                  <button
                    type="button"
                    onClick={() => {
                      setDemoStarted(true);
                      void demoVideoRef.current?.play();
                    }}
                    aria-label="Play the onboarding walkthrough"
                    className="group absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-400/60"
                  >
                    {/* The thumbnail has its own play button; this just adds a hover lift. */}
                    <span className="absolute inset-0 bg-white/0 transition-colors duration-300 group-hover:bg-white/[0.04]" />
                  </button>
                )}
              </div>
            </div>
            <div aria-hidden className="relative -mx-[5%] h-3.5 rounded-b-2xl bg-gradient-to-b from-[#d5dbe1] to-[#a9b1ba] shadow-[0_18px_30px_-18px_rgba(12,20,34,0.45)] md:h-4">
              <span className="absolute left-1/2 top-0 h-1.5 w-[14%] -translate-x-1/2 rounded-b-lg bg-[#9aa3ad]" />
            </div>
          </div>
        </motion.div>

        {/* Chapter rail - the four stages the walkthrough covers, styled like
            video chapters: a bar segment, number, label and one-line summary. */}
        <motion.ol
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-60px' }}
          className="mt-10 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4"
        >
          {demoChapters.map((c, i) => (
            <motion.li key={c.label} variants={fadeUp} className="group">
              <span className="block h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                <span className="block h-full w-full origin-left scale-x-[0.35] rounded-full bg-gradient-to-r from-teal-700 to-teal-400 transition-transform duration-500 group-hover:scale-x-100" />
              </span>
              <div className="mt-4 flex items-center gap-2.5">
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-teal-500/30 text-xs font-semibold text-teal-700 transition-colors duration-300 group-hover:border-teal-600 group-hover:bg-teal-600 group-hover:text-white dark:text-teal-300">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-foreground/60">{c.body}</p>
            </motion.li>
          ))}
        </motion.ol>

        <Reveal className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
          <a
            href="#demo-form"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-7 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            Book a demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <span className="text-xs text-foreground/55">A short walkthrough, on your schedule</span>
        </Reveal>
      </section>

      {/* Lead capture - the destination for ad traffic */}
      <LeadForm />

      {/* Footer */}
      <footer className="relative z-10 border-t border-foreground/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-foreground/75 dark:text-foreground/55 md:flex-row md:px-10">
          <a
            href="https://sirahdigital.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 transition-colors hover:text-foreground"
          >
            <BrandMark size={20} animated={false} />
            <span>NUSI · Practice management for nutritionists · by Sirah Digital</span>
          </a>
          <div className="flex items-center gap-6">
            <a href="https://sirahdigital.in/privacy" target="_blank" rel="noreferrer" className="transition-colors hover:text-teal-700 dark:hover:text-teal-300">Privacy</a>
            <a href="https://sirahdigital.in/terms" target="_blank" rel="noreferrer" className="transition-colors hover:text-teal-700 dark:hover:text-teal-300">Terms</a>
            <a href="mailto:support@sirahdigital.in" className="transition-colors hover:text-teal-700 dark:hover:text-teal-300">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Shared hover for landing cards: lift, green edge and a soft green glow.
// `group` lets the card's icon pop at the same time. Movement is skipped for
// visitors who prefer reduced motion.
const CARD_HOVER =
  'group transition-[transform,border-color,box-shadow] duration-300 hover:border-teal-500/40 ' +
  'hover:shadow-[0_22px_45px_-22px_rgba(85,142,25,0.45)] motion-safe:hover:-translate-y-1';

/**
 * Section label shown above each heading - a tinted green pill with a dot, sized
 * and weighted to read clearly on both light and dark backgrounds.
 */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-teal-600/25 bg-teal-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-200 md:text-[13px]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal-600 dark:bg-teal-300" />
      {children}
    </span>
  );
}

/**
 * The landing page is always light, whatever theme the visitor last used in the
 * app (the app defaults to dark, which made the page black on phones). The
 * visitor's own preference is left untouched and restored when they navigate on.
 */
function useForceLightTheme() {
  const { resolvedTheme } = useTheme();
  const resolvedRef = useRef(resolvedTheme);
  resolvedRef.current = resolvedTheme;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevMeta = meta?.content;

    const applyLight = () => {
      if (root.classList.contains('dark')) root.classList.remove('dark');
      if (!root.classList.contains('light')) root.classList.add('light');
      if (root.style.colorScheme !== 'light') root.style.colorScheme = 'light';
    };
    applyLight();
    if (meta) meta.content = '#fafbfc';

    // The theme provider may re-apply its class after this mounts; keep light.
    const observer = new MutationObserver(applyLight);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      observer.disconnect();
      const theme = resolvedRef.current === 'light' ? 'light' : 'dark';
      root.classList.remove('light', 'dark');
      root.classList.add(theme);
      root.style.colorScheme = theme;
      if (meta && prevMeta) meta.content = prevMeta;
    };
  }, []);
}

/** Fades + lifts its children in the first time they scroll into view. */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-80px' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Features grid - one short line each; order reads as a practitioner's day.
const features = [
  { icon: LayoutTemplate, title: 'Program templates',      body: 'Build a protocol once, assign it to every client.' },
  { icon: Camera,         title: 'Food diary & Plate Vision', body: 'Photo, barcode or voice logging that knows Indian food.' },
  { icon: LineChart,      title: 'Adherence tracking',     body: 'See who is slipping and follow up early.' },
  { icon: CalendarClock,  title: 'Consultations',          body: 'Online booking, reminders and built-in video calls.' },
  { icon: MessageCircle,  title: 'Client chat',            body: 'Text, voice notes and photos, kept with each record.' },
  { icon: Smartphone,     title: 'Branded client app',     body: 'Your logo and colours on every client’s phone.' },
  { icon: ClipboardList,  title: 'Client records',         body: 'Health history, assessments, measurements and notes.' },
  { icon: BarChart3,      title: 'Progress reports',       body: 'One-click reports with AI progress summaries.' },
];

// Chapters of the onboarding walkthrough video.
const demoChapters = [
  { label: 'Choose a plan',          body: 'Pick the plan that fits the size of your practice.' },
  { label: 'Brand your practice',    body: 'Add your logo and colours to your client app.' },
  { label: 'Verify details',         body: 'Confirm your practice and credentials once.' },
  { label: 'Go live',                body: 'Finish, and your workspace is ready in seconds.' },
];

const steps = [
  { stage: 'Brand it',  icon: Palette,   title: 'Set up your practice',  body: 'Add your logo, colours and consultation details. Your client app is branded as yours instantly.' },
  { stage: 'Bring in',  icon: UserPlus,  title: 'Invite your clients',   body: 'Send a WhatsApp or email link. Clients fill in their health history before the first consult.' },
  { stage: 'Plan once', icon: Rocket,    title: 'Assign a program',      body: 'Pick one of your templates, personalise the meal plan and assign it. Daily tasks start right away.' },
  { stage: 'Track',     icon: LineChart, title: 'See what really happens', body: 'Food logs, weights and adherence flow into one dashboard - no chasing photos on WhatsApp.' },
  { stage: 'Grow',      icon: Users,     title: 'Coach more, stress less', body: 'Spend check-ins on the clients who need you, and take on more without losing the personal touch.' },
];

// What NUSI is - the three parts of the product.
const productParts = [
  {
    icon: LayoutDashboard,
    label: 'For you',
    title: 'A practice dashboard',
    body: 'Every client, program, appointment and message in one place - with a clear view of who is on track and who needs attention.',
  },
  {
    icon: Smartphone,
    label: 'For your clients',
    title: 'Your own branded app',
    body: 'Clients see their meal plan, log food, water and weight, chat with you and book follow-ups - in an app with your logo, free for them.',
  },
  {
    icon: Camera,
    label: 'For every meal',
    title: 'AI Plate Vision',
    body: 'Clients snap a photo of their plate and NUSI recognises the foods - Indian meals included - and turns every meal into clear nutrition insights you can act on.',
  },
];

// Problems we solve - the pain, what it costs, and the fix.
const painPoints = [
  {
    icon: FileSpreadsheet,
    problem: 'Writing diet charts from scratch',
    pain: 'Every new client means another Word or Excel diet chart - hours of copy-paste for protocols you have already written a hundred times.',
    fix: 'Save your weight-loss, PCOS or diabetes protocol as a template and personalise it for each client in minutes.',
  },
  {
    icon: MessageCircle,
    problem: 'A personal WhatsApp that never sleeps',
    pain: 'Food photos, questions and reports arrive at all hours, mixed with family chats - and important details get buried.',
    fix: 'A dedicated client chat and food diary, saved to each client’s record, on your terms.',
  },
  {
    icon: UserMinus,
    problem: 'Clients quietly dropping off',
    pain: 'Motivation fades after a few weeks. By the time you notice a client has stopped logging, they have already left.',
    fix: 'Adherence tracking flags clients going quiet, so you can reach out while they are still with you.',
  },
  {
    icon: Stethoscope,
    problem: 'No real picture of what clients eat',
    pain: 'Clients forget to log, guess portions, or send a single blurry photo - making it hard to adjust the plan with confidence.',
    fix: 'Clients log by photo, barcode or voice, and Plate Vision turns Indian meals into nutrition insights.',
  },
  {
    icon: BellRing,
    problem: 'Sending the same reminders every day',
    pain: 'Drink your water, log your lunch, weigh in on Monday - typing the same nudges to every client eats into your week.',
    fix: 'Automated daily tasks and reminders go out for you, so your messages can be the personal ones.',
  },
  {
    icon: CalendarClock,
    problem: 'Scheduling back-and-forth and no-shows',
    pain: 'Finding a slot takes five messages, meeting links get lost, and clients forget follow-ups.',
    fix: 'Clients book from your calendar, get automatic reminders, and join a built-in video call.',
  },
];

// Why NUSI - reasons to buy, framed as outcomes.
const reasons = [
  {
    icon: Clock,
    title: 'Get your evenings back',
    body: 'Templates, automated reminders and AI summaries take care of the repetitive admin that spills past working hours.',
  },
  {
    icon: HeartHandshake,
    title: 'Keep clients longer',
    body: 'Daily plans, check-ins and early drop-off alerts keep clients engaged - and engaged clients get results.',
  },
  {
    icon: Users,
    title: 'Take on more clients',
    body: 'Run a program for fifty clients as easily as five, without hiring an assistant or losing the personal touch.',
  },
  {
    icon: Smartphone,
    title: 'Look like a premium practice',
    body: 'Your own branded app puts you alongside big wellness brands and builds trust with every client.',
  },
  {
    icon: ShieldCheck,
    title: 'Your expertise stays in charge',
    body: 'AI assists, you decide. Every AI suggestion is reviewed by you before a client ever sees it.',
  },
  {
    icon: FileText,
    title: 'Made for Indian practices',
    body: 'Indian foods and meal patterns, Plate Vision for thalis, and WhatsApp invites. Your clients use the app free.',
  },
];




