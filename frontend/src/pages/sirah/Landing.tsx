import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Mic, Camera, ShieldCheck, BarChart3, Users } from 'lucide-react';
import {
  AIGlow,
  BrandMark,
  Glass,
  GradientOrb,
  fadeUp,
  stagger,
} from '@/design-system';

export default function SirahLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0C10] text-white">
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
            <span className="text-base font-semibold tracking-tight">SIRAH LIFE</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              by Sirah Digital
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#ai" className="transition-colors hover:text-white">AI</a>
          <a href="#plans" className="transition-colors hover:text-white">Plans</a>
          <Link
            to="/auth"
            className="rounded-full border border-white/15 px-5 py-2 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign in
          </Link>
        </nav>

        <Link
          to="/auth"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 md:hidden"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-16 text-center md:pt-24">
        <motion.div
          variants={stagger(0.1, 0.08)}
          initial="initial"
          animate="animate"
          className="flex flex-col items-center"
        >
          <motion.div variants={fadeUp}>
            <Glass
              variant="subtle"
              className="inline-flex items-center gap-2 rounded-full border-white/15 px-4 py-1.5 text-xs uppercase tracking-[0.18em] text-white/70"
            >
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
              Now in private beta
            </Glass>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-8 max-w-4xl text-balance bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-semibold leading-[1.05] tracking-tight text-transparent md:text-7xl"
          >
            A wellness operating system
            <br />
            for modern healthcare businesses.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-2xl text-pretty text-base text-white/60 md:text-lg"
          >
            SIRAH LIFE is an AI-native workspace for nutritionists and clinics. Run programs, coach
            clients with voice and vision AI, and bill effortlessly — all in one calm, elegant
            platform.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <AIGlow intensity="default" animated>
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-7 py-3.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                Start your free 30-day trial
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </AIGlow>
            <a
              href="#features"
              className="rounded-full border border-white/15 px-7 py-3.5 text-sm text-white/80 transition-colors hover:bg-white/5"
            >
              See how it works
            </a>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-white/40"
          >
            <span>No credit card to start</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
            <span>GDPR & HIPAA-aware</span>
            <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
            <span>GST-compliant invoicing</span>
          </motion.div>
        </motion.div>
      </section>

      {/* Features grid */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((f) => (
            <motion.div key={f.title} variants={fadeUp}>
              <Glass interactive className="h-full p-6">
                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/20 text-indigo-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-medium tracking-tight text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
              </Glass>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* AI band */}
      <section id="ai" className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-10">
        <Glass variant="heavy" className="overflow-hidden p-8 md:p-14">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-indigo-300">
                The AI inside SIRAH
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Calm intelligence, woven through every screen.
              </h2>
              <p className="mt-4 max-w-lg text-white/60">
                No bolt-on chatbot. Voice journaling, plate-vision macro tracking, and contextual
                AI suggestions live exactly where you need them — and never where you don't.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {aiCapabilities.map((c) => (
                <Glass key={c.title} className="p-4">
                  <c.icon className="h-5 w-5 text-emerald-300" />
                  <div className="mt-3 text-sm font-medium text-white">{c.title}</div>
                  <div className="mt-1 text-xs text-white/50">{c.sub}</div>
                </Glass>
              ))}
            </div>
          </div>
        </Glass>
      </section>

      {/* Plans teaser */}
      <section id="plans" className="relative z-10 mx-auto max-w-6xl px-6 pb-32 md:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs uppercase tracking-[0.18em] text-white/40">Pricing</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Plans that scale with your practice
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <Glass
              key={p.name}
              interactive
              variant={i === 1 ? 'heavy' : 'default'}
              className={i === 1 ? 'p-6 ring-1 ring-indigo-400/40' : 'p-6'}
            >
              {i === 1 && (
                <div className="mb-4 inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-indigo-200">
                  Most popular
                </div>
              )}
              <div className="text-sm text-white/60">{p.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-white">₹{p.price}</span>
                <span className="text-xs text-white/40">/month</span>
              </div>
              <div className="mt-4 text-xs text-white/55">{p.tagline}</div>
              <ul className="mt-6 space-y-2 text-xs text-white/70">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                    {pt}
                  </li>
                ))}
              </ul>
            </Glass>
          ))}
        </div>

        <div className="mt-10 text-center text-xs text-white/40">
          All plans include 30-day free trial · GST-compliant invoices · WhatsApp client invites
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-white/40 md:flex-row md:px-10">
          <div className="flex items-center gap-3">
            <BrandMark size={20} animated={false} />
            <span>SIRAH LIFE · by Sirah Digital</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white/70">Privacy</a>
            <a href="#" className="hover:text-white/70">Terms</a>
            <a href="#" className="hover:text-white/70">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: Users,
    title: 'Your workspace, your rules.',
    body: 'Invite clients via WhatsApp or email. Assign programs. Track activations. Each workspace is an isolated tenant — your data never mingles.',
  },
  {
    icon: Sparkles,
    title: 'Programs that practically design themselves.',
    body: 'AI-assisted templates for weight loss, PCOD, diabetes, sports nutrition and 20+ more specializations. Edit anything, ship in minutes.',
  },
  {
    icon: BarChart3,
    title: 'Analytics that read like a story.',
    body: 'Compliance, momentum, retention — surfaced as patterns, not pivot tables. Know who needs a check-in before they ghost.',
  },
  {
    icon: ShieldCheck,
    title: 'Billing the way India bills.',
    body: 'Razorpay subscriptions, automatic GST invoices, failed-payment recovery on day 3 / 7 / 14. No spreadsheet gymnastics.',
  },
  {
    icon: Mic,
    title: 'Voice-first, hands-free coaching.',
    body: 'Clients log meals by talking. You leave audio notes. SIRAH listens, transcribes, summarizes, suggests — in their language.',
  },
  {
    icon: Camera,
    title: 'Snap the plate. Skip the spreadsheet.',
    body: 'Plate Vision detects foods, estimates macros from Indian and global nutrition databases, and shows confidence per item.',
  },
];

const aiCapabilities = [
  { icon: Mic,       title: 'Voice journaling',  sub: 'Whisper · Aura 2' },
  { icon: Camera,    title: 'Plate Vision',      sub: 'GPT-4o · IFCT · USDA' },
  { icon: Sparkles,  title: 'Smart plans',       sub: 'GPT-4o · Claude' },
  { icon: BarChart3, title: 'Contextual insights', sub: 'LangChain · workspace memory' },
];

const plans = [
  {
    name: 'Starter',
    price: '999',
    tagline: 'Solo practitioner getting started',
    points: ['Up to 25 clients', '1,000 AI calls / month', 'Voice AI', 'Basic analytics'],
  },
  {
    name: 'Pro',
    price: '1,999',
    tagline: 'Established solo practice',
    points: ['Up to 100 clients', '5,000 AI calls / month', 'Voice + Vision AI', 'Team of 3'],
  },
  {
    name: 'Scale',
    price: '2,999',
    tagline: 'Small clinic',
    points: ['Up to 300 clients', '15,000 AI calls / month', 'Custom workflows', 'Team of 10'],
  },
  {
    name: 'Enterprise',
    price: '3,999',
    tagline: 'Multi-coach clinic',
    points: ['Unlimited clients', '50,000 AI calls / month', 'White-label invoices', 'Priority AI access'],
  },
];
