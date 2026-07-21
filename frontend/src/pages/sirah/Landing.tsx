import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
// Lucide icons still in use by aiCapabilities + nav. Users / ShieldCheck dropped
// when the feature cards switched to custom SVG illustrations.
import {
  Mic, Camera, BarChart3, Sparkles, ArrowRight, Plus,
  UserPlus, Palette, Rocket, LineChart, User, Building2, Dumbbell,
  ShieldCheck, Lock, BadgeCheck, Receipt, KeyRound, Database,
} from 'lucide-react';
import {
  BrandMark,
  Glass,
  GradientOrb,
  fadeUp,
  stagger,
  Wordmark,
} from '@/design-system';
import { ThemeToggle } from '@/modules/workspace/ThemeToggle';
import { HeroSection } from './landing/HeroSection';
import { FeatureCard, type FeatureAccent } from './landing/FeatureCard';
import {
  AnalyticsIllustration,
  AppointmentsIllustration,
  BillingIllustration,
  ClientAppIllustration,
  MessagingIllustration,
  ProgramsIllustration,
  VisionIllustration,
  VoiceIllustration,
  WorkspaceIllustration,
} from './landing/illustrations';

export default function SirahLanding() {
  return (
    <div className="relative h-screen overflow-y-auto overflow-x-hidden bg-canvas text-foreground">
      {/* Ambient orbs */}
      <GradientOrb color="blue" size={620} position="-top-40 -left-32" />
      <GradientOrb color="magenta" size={520} position="top-1/3 -right-32" delay={2} driftDuration={22} />
      <GradientOrb color="mixed" size={440} position="bottom-0 left-1/4" delay={4} driftDuration={26} />

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
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <div className="flex flex-col leading-none">
            <Wordmark className="text-base" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
              by Sirah Digital
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-foreground/70 md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#demo" className="transition-colors hover:text-foreground">Demo</a>
          <a href="#ai" className="transition-colors hover:text-foreground">AI</a>
          <a href="#model" className="transition-colors hover:text-foreground">Why SIRAH LIFE</a>
          <a href="#security" className="transition-colors hover:text-foreground">Security</a>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          <ThemeToggle className="flex" />
          <Link
            to="/auth"
            className="rounded-full border border-foreground/15 px-5 py-2 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2 font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            Start free trial
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle className="flex" />
          <Link
            to="/auth"
            className="rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/80"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero - interactive wellness ecosystem */}
      <HeroSection />

      {/* Features grid - 3D-tilt cards with per-card ambient orb. perspective
          must live on the grid container so each card rotates in shared 3D
          space; without it the tilt reads as a flat skew. */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          style={{ perspective: '1200px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <motion.div key={f.title} variants={fadeUp} className="h-full">
              <FeatureCard visual={f.visual} title={f.title} body={f.body} accent={f.accent} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">How it works</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Live in an afternoon, not a quarter.
          </h2>
        </div>
        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {steps.map((s, i) => (
            <motion.div key={s.title} variants={fadeUp}>
              <Glass className="h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="text-2xl font-semibold text-foreground/15">0{i + 1}</span>
                </div>
                <div className="mt-4 text-sm font-semibold text-foreground">{s.title}</div>
                <div className="mt-1.5 text-xs leading-relaxed text-foreground/60">{s.body}</div>
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Product demo — the new-nutritionist onboarding walkthrough, as a
          marketing tutorial. Silent screen recording with burned-in captions,
          so it autoplays muted + loops when scrolled into view. */}
      <section id="demo" className="relative z-10 mx-auto max-w-5xl px-6 pb-24 md:px-10">
        <div className="mb-10 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
            Watch the walkthrough
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            From sign-up to a live workspace, in minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/60 md:text-base">
            Follow a nutritionist as they pick a plan, brand their practice, verify their
            details, and land on a ready-to-use dashboard — no setup calls, no waiting.
          </p>
        </div>

        <motion.div
          variants={fadeUp}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
        >
          <Glass variant="heavy" className="overflow-hidden rounded-3xl p-2 md:p-3">
            {/* faux app-window bar for polish */}
            <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] text-foreground/40">
                SIRAH LIFE — new nutritionist onboarding
              </span>
            </div>
            <video
              src="/tutorial-onboarding.webm"
              autoPlay
              muted
              loop
              playsInline
              controls
              preload="metadata"
              className="aspect-video w-full rounded-2xl bg-black"
            />
          </Glass>
        </motion.div>

        <div className="mt-8 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-6 py-3 font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
          >
            Start your free trial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* AI band */}
      <section id="ai" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <Glass variant="heavy" className="overflow-hidden p-8 md:p-14">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                The AI inside SIRAH LIFE
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Calm intelligence, woven through every screen.
              </h2>
              <p className="mt-4 max-w-lg text-foreground/75 dark:text-foreground/60">
                No bolt-on chatbot. Voice journaling, plate-vision macro tracking, and contextual
                AI suggestions live exactly where you need them - and never where you don't.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {aiCapabilities.map((c) => (
                <Glass key={c.title} className="p-4">
                  <c.icon className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  <div className="mt-3 text-sm font-medium text-foreground">{c.title}</div>
                  <div className="mt-1 text-xs text-foreground/50">{c.sub}</div>
                </Glass>
              ))}
            </div>
          </div>
        </Glass>
      </section>

      {/* Built for your practice - audience */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Built for your practice</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Whether you're solo or a whole clinic.
          </h2>
        </div>
        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {audiences.map((a) => (
            <motion.div key={a.title} variants={fadeUp}>
              <Glass className="h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                  <a.icon className="h-5 w-5" />
                </span>
                <div className="mt-4 text-base font-semibold text-foreground">{a.title}</div>
                <div className="mt-1 text-xs text-foreground/55">{a.tagline}</div>
                <ul className="mt-4 space-y-2 text-xs text-foreground/70">
                  {a.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* The SIRAH LIFE deal - value model. Deliberately no price: the message is
          "you pay for the platform, your clients never do, and you run your
          whole practice freely." */}
      <section id="model" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <Glass variant="heavy" className="relative overflow-hidden p-8 text-center md:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(14,154,168,0.22), transparent 70%)' }}
          />
          <div className="relative">
            <span className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              The SIRAH LIFE deal
            </span>
            <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              One platform. Your entire practice. Your clients pay nothing.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-foreground/70 dark:text-foreground/60 md:text-base">
              You subscribe to SIRAH LIFE - then run every client, program, and conversation with total
              freedom. No per-client fees, no charging your clients, no meters on how you coach.
            </p>

            <motion.div
              variants={stagger(0.05, 0.08)}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true, margin: '-80px' }}
              className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3"
            >
              {valueModel.map((v) => (
                <motion.div key={v.title} variants={fadeUp}>
                  <Glass className="h-full p-6">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                      <v.icon className="h-5 w-5" />
                    </span>
                    <div className="mt-4 text-sm font-semibold text-foreground">{v.title}</div>
                    <div className="mt-1.5 text-xs leading-relaxed text-foreground/60">{v.body}</div>
                  </Glass>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </Glass>
      </section>

      {/* Trust & security */}
      <section id="security" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">Security &amp; trust</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Built to be trusted with health data.
          </h2>
        </div>
        <motion.div
          variants={stagger(0.05, 0.06)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {trustPoints.map((t) => (
            <motion.div key={t.title} variants={fadeUp}>
              <Glass className="h-full p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-300">
                  <t.icon className="h-5 w-5" />
                </span>
                <div className="mt-4 text-sm font-semibold text-foreground">{t.title}</div>
                <div className="mt-1.5 text-xs leading-relaxed text-foreground/60">{t.body}</div>
              </Glass>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55">
          <span className="text-foreground/40">Works with</span>
          {['Razorpay', 'WhatsApp', 'Video calls', 'Gemini AI', 'Open Food Facts'].map((n) => (
            <span key={n} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-teal-400" />
              {n}
            </span>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto max-w-3xl px-6 pb-28 md:px-10">
        <div className="mb-10 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">FAQ</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Questions, answered.
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <Glass key={f.q} className="overflow-hidden p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-foreground">
                  {f.q}
                  <Plus className="h-4 w-4 flex-shrink-0 text-foreground/50 transition-transform group-open:rotate-45" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-foreground/65">{f.a}</div>
              </details>
            </Glass>
          ))}
        </div>
      </section>

      {/* Final CTA band */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28 md:px-10">
        <Glass variant="heavy" className="relative overflow-hidden p-10 text-center md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.25), transparent 70%)' }}
          />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Pay for the platform. Run your whole practice - freely.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-foreground/65 md:text-base">
              Start free for 30 days - no card required. Bring your clients, programs, and AI into one calm platform they never pay for.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-7 py-3.5 text-sm font-medium text-white transition-transform hover:scale-[1.02] cta-glow active:scale-[0.97]"
              >
                Start free trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full border border-foreground/15 px-7 py-3.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/[0.04]"
              >
                Explore features
              </a>
            </div>
          </div>
        </Glass>
      </section>

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
            <span>SIRAH LIFE · by Sirah Digital</span>
          </a>
          <div className="flex items-center gap-6">
            <a href="https://sirahdigital.in/privacy" target="_blank" rel="noreferrer" className="hover:text-foreground/70">Privacy</a>
            <a href="https://sirahdigital.in/terms" target="_blank" rel="noreferrer" className="hover:text-foreground/70">Terms</a>
            <a href="mailto:support@sirahdigital.in" className="hover:text-foreground/70">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Accent rotation across the 3×3 grid — 3 violet, 3 cyan, 3 blue. Distribution
// is intentional so the eye doesn't track diagonal stripes of one hue.
type FeatureEntry = {
  visual: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: FeatureAccent;
};

const features: FeatureEntry[] = [
  {
    visual: WorkspaceIllustration,
    title: 'Your workspace, your rules.',
    body: 'Invite clients via WhatsApp or email. Assign programs. Track activations. Each workspace is an isolated tenant - your data never mingles.',
    accent: 'violet',
  },
  {
    visual: ProgramsIllustration,
    title: 'Programs that practically design themselves.',
    body: 'AI-assisted templates for weight loss, PCOD, diabetes, sports nutrition and 20+ more specializations. Edit anything, ship in minutes.',
    accent: 'cyan',
  },
  {
    visual: AnalyticsIllustration,
    title: 'Analytics that read like a story.',
    body: 'Compliance, momentum, retention - surfaced as patterns, not pivot tables. Know who needs a check-in before they ghost.',
    accent: 'blue',
  },
  {
    visual: AppointmentsIllustration,
    title: 'Booking, reminders, and video - sorted.',
    body: 'Clients book from your calendar and get automatic reminders that cut no-shows. Every session opens a built-in video room - no Zoom links to juggle.',
    accent: 'violet',
  },
  {
    visual: MessagingIllustration,
    title: 'Stay close between sessions.',
    body: 'Secure in-app chat with every client - text, voice notes and photos. AI drafts smart replies and summarizes long threads so nothing slips.',
    accent: 'blue',
  },
  {
    visual: ClientAppIllustration,
    title: 'A branded app your clients love.',
    body: 'Your practice in their pocket - installable, push-notified, and badged with your own logo and colors. They log meals, follow plans and check in on the go.',
    accent: 'cyan',
  },
  {
    visual: BillingIllustration,
    title: 'Billing the way India bills.',
    body: 'Razorpay subscriptions, automatic GST invoices, failed-payment recovery on day 3 / 7 / 14. No spreadsheet gymnastics.',
    accent: 'blue',
  },
  {
    visual: VoiceIllustration,
    title: 'Voice-first, hands-free coaching.',
    body: 'Clients log meals by talking. You leave audio notes. SIRAH LIFE listens, transcribes, summarizes, suggests - in their language.',
    accent: 'cyan',
  },
  {
    visual: VisionIllustration,
    title: 'Snap the plate. Skip the spreadsheet.',
    body: 'Plate Vision detects foods, estimates macros from Indian and global nutrition databases, and shows confidence per item.',
    accent: 'violet',
  },
];

const steps = [
  { icon: Palette,   title: 'Set up your workspace', body: 'Add your logo, brand colors, and practice details. Your client portal is instantly branded as yours.' },
  { icon: UserPlus,  title: 'Invite your clients',   body: 'Send a personalized link via WhatsApp or email. Clients onboard themselves in minutes.' },
  { icon: Rocket,    title: 'Assign programs',       body: 'Build a plan from a template or scratch, assign it, and let daily tasks + AI tracking run.' },
  { icon: LineChart, title: 'Track & grow',          body: 'Watch compliance, engagement, and revenue in one dashboard - with AI surfacing who needs you.' },
];

// The three-beat "SIRAH LIFE deal" — you pay, clients don't, you run free.
const valueModel = [
  {
    icon: Building2,
    title: 'You subscribe to SIRAH LIFE',
    body: 'One platform subscription covers your practice - clients, programs, AI and all. That’s the only bill.',
  },
  {
    icon: User,
    title: 'Your clients join free',
    body: 'Every client gets your branded app, chat, plans and reminders at zero cost to them. You never charge them to use it.',
  },
  {
    icon: Rocket,
    title: 'Run your practice freely',
    body: 'Unlimited messages, check-ins and coaching - no per-client fees, no meters on how you work with the people you serve.',
  },
];

const audiences = [
  {
    icon: User,
    title: 'Solo nutritionist',
    tagline: 'Everything in one place, finally.',
    points: ['Client CRM + programs', 'Plate Vision & voice logging', 'AI weekly summaries', 'GST-ready invoices'],
  },
  {
    icon: Building2,
    title: 'Multi-coach clinic',
    tagline: 'Run a team without the chaos.',
    points: ['Staff roles & permissions', 'Shared notes & team chat', 'Workspace-wide analytics', 'White-label client portal'],
  },
  {
    icon: Dumbbell,
    title: 'Coach / gym',
    tagline: 'Keep members engaged between sessions.',
    points: ['Habits, goals & streaks', 'Community & challenges', 'Automated check-ins', 'Progress photos & measurements'],
  },
];

const trustPoints = [
  { icon: Database,    title: 'Tenant isolation',        body: 'Every workspace is a separate tenant. Your clients, programs, and notes never mix with another practice’s data.' },
  { icon: Lock,        title: 'Privacy by design',       body: 'Built with India’s DPDP expectations in mind. You own your data and can export it - it’s your practice, your records.' },
  { icon: BadgeCheck,  title: 'Practitioner verification', body: 'Workspaces are reviewed and verified by our team, so the practitioners on SIRAH LIFE are who they say they are.' },
  { icon: KeyRound,    title: 'Role-based access',       body: 'Owners, nutritionists, and staff each see exactly what their role allows - enforced on the server, not just the screen.' },
  { icon: Receipt,     title: 'GST-compliant billing',   body: 'Razorpay subscriptions with automatic GST invoices and India-ready tax handling - no spreadsheet gymnastics.' },
  { icon: ShieldCheck, title: 'You control the AI',      body: 'AI suggestions pass through a review queue. Nothing reaches a client without your sign-off.' },
];

const faqs = [
  { q: 'Do I need a credit card to start?', a: 'No. Every plan starts with a 30-day free trial and no card is required - you only pay from day 31 if you choose to continue.' },
  { q: 'Is my data isolated from other practices?', a: 'Yes. Each workspace is a separate tenant. Your clients, programs, and notes never mix with another practice’s data, and access is enforced server-side by role.' },
  { q: 'Can I use my own branding?', a: 'Yes. Add your logo and brand colors, and your client portal and invoices appear under your practice name - white-label on the higher plans.' },
  { q: 'How accurate is the AI?', a: 'Plate Vision and AI summaries are assistive - they give a fast first estimate, and you stay in control with a review queue so nothing reaches a client without your sign-off.' },
  { q: 'Are invoices GST-compliant?', a: 'Yes. Billing runs on Razorpay with automatic GST invoices and India-ready tax handling, plus failed-payment recovery.' },
  { q: 'Can my clients use it on their phone?', a: 'Yes. SIRAH LIFE is mobile-first and installable as an app (PWA), with push notifications for both you and your clients.' },
];

const aiCapabilities = [
  { icon: Mic,       title: 'Voice logging',      sub: 'Gemini · speech-to-text' },
  { icon: Camera,    title: 'Plate Vision',       sub: 'Gemini Vision · nutrition DB' },
  { icon: Sparkles,  title: 'Smart summaries',    sub: 'Gemini 2.5 Flash' },
  { icon: BarChart3, title: 'Contextual insights', sub: 'Gemini · workspace memory' },
];
