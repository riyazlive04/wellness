import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, CalendarCheck, CreditCard, MessageSquare,
  Smartphone, Sparkles, UtensilsCrossed,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Section, SiteLayout } from '@/modules/site/SiteLayout';

const G = '#436F17';        // the logo green
const G_DARK = '#375818';
const G_PALE = '#F3FAE8';
const G_EDGE = '#E4F4CC';

/** Real product screenshots that ship with the app. */
const SHOTS = [
  { id: 'plans', label: 'Meal plans', icon: UtensilsCrossed, src: '/landing/problem-diet-templates.webp',
    blurb: 'Build a week once. Reuse it, or copy it to another client and pick which weeks carry over.' },
  { id: 'chat', label: 'Client chat', icon: MessageSquare, src: '/landing/problem-client-chat.webp',
    blurb: 'Every conversation in one place, attached to the client — not lost in your personal WhatsApp.' },
  { id: 'risk', label: 'Who has gone quiet', icon: BarChart3, src: '/landing/problem-at-risk.webp',
    blurb: 'A list of clients who stopped logging, while there is still time to call them.' },
  { id: 'vision', label: 'Plate scanner', icon: Sparkles, src: '/landing/problem-plate-vision.webp',
    blurb: 'A client photographs a plate; NUSI estimates what is on it. They correct it if needed.' },
  { id: 'daily', label: 'Daily tasks', icon: Smartphone, src: '/landing/problem-daily-tasks.webp',
    blurb: 'Meal and water reminders at the times you set, on the client’s phone.' },
  { id: 'appts', label: 'Appointments', icon: CalendarCheck, src: '/landing/problem-appointments.webp',
    blurb: 'Clients book inside your working hours. Video calls included from Growth.' },
] as const;

const BEFORE_AFTER = [
  ['Diet charts retyped in Word for every client', 'Build a plan once, reuse it, copy it across'],
  ['Client questions mixed into your personal WhatsApp', 'Conversations attached to the client record'],
  ['No idea who has stopped following the plan', 'A list of who has gone quiet, before they leave'],
  ['Chasing payments by message at month end', 'Subscriptions and invoices run themselves'],
  ['Notes in one app, weights in another, photos in a third', 'One record per client, everything in it'],
] as const;

const STEPS = [
  ['Brand it', 'Your practice name, logo and colours. Clients see you, not us.'],
  ['Bring your clients in', 'Import a list, or invite them one at a time. We help you do it.'],
  ['Plan once', 'Build your meal plans and programs. Reuse them from then on.'],
  ['Go live', 'Clients get the app, start logging, and you see it all in one place.'],
] as const;

const INCLUDED = [
  [UtensilsCrossed, 'Meal plans and programs', 'Build once, reuse, copy between clients. Multi-week programs with daily tasks.'],
  [Smartphone, 'A client app in your name', 'Your branding, on Android and iPhone. Food diary, reminders, progress.'],
  [Sparkles, 'AI that drafts, you approve', 'Plate scanning, plan drafts and summaries. Your judgement always leads.'],
  [BarChart3, 'Daily logs and charts', 'You choose the questions. Their answers plot over time.'],
  [MessageSquare, 'Chat and appointments', 'Conversations per client; booking inside your working hours.'],
  [CreditCard, 'Payments and invoices', 'Subscriptions, GST invoices and reminders, through Razorpay.'],
] as const;

const PLANS = [
  ['Starter', '₹3,999', 'For solo nutritionists', ['100 clients', '1 user', '500 AI actions a month', '5 GB storage'], false],
  ['Growth', '₹8,999', 'For growing practices', ['500 clients', '5 team members', '5,000 AI actions', 'Video consultations'], true],
  ['Scale Pro', '₹19,999', 'For clinics and centres', ['Unlimited clients', 'Unlimited team', 'Multi-branch', 'White-label'], false],
] as const;

export default function SiteHome() {
  const [shot, setShot] = useState<(typeof SHOTS)[number]['id']>('plans');
  const active = SHOTS.find((s) => s.id === shot)!;

  return (
    <SiteLayout
      title="NUSI — practice software for nutritionists"
      description="Meal plans, a client app, daily tracking and billing for nutrition practices in India. From ₹3,999 a month, with 14 days free."
    >
      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-[#ededea]"
        style={{ background: `radial-gradient(900px 420px at 15% -10%, ${G_PALE} 0%, transparent 70%), radial-gradient(700px 380px at 95% 0%, #EFF7FF 0%, transparent 65%)` }}>
        <Section className="pb-20 pt-16 sm:pt-24">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-[13px] font-medium"
              style={{ borderColor: G_EDGE, color: G }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: G }} />
              For nutritionists and dietitians in India
            </span>
          </Reveal>
          <Reveal delay={60}>
            <h1 className="mt-6 max-w-[18ch] text-[40px] font-normal leading-[1.03] tracking-[-0.04em] sm:text-[64px]">
              Run your practice,<br />not your admin.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[#5a5a56]">
              Meal plans, a client app, daily tracking and billing — one subscription,
              built for the way a nutrition practice actually works.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Cta to="/auth?mode=signup">Start free trial<ArrowRight className="h-4 w-4" /></Cta>
              <Link to="/booking-page"
                className="rounded-xl border border-[#d9d9d6] bg-white px-6 py-3.5 text-[15px] font-medium transition-colors hover:border-[#9b9b9b]">
                Book a walkthrough
              </Link>
            </div>
            <p className="mt-4 text-[14px] text-[#6b6b6b]">14 days free · no card needed · cancel any time</p>
          </Reveal>
        </Section>
      </div>

      {/* ── The product ─────────────────────────────────────────── */}
      <Section className="py-16 sm:py-20">
        <Reveal><SectionLabel>The product</SectionLabel></Reveal>
        <Reveal delay={60}>
          <h2 className="mt-3 max-w-[22ch] text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[38px]">
            Everything in one place, and all of it yours.
          </h2>
        </Reveal>

        <div className="mt-9 flex flex-wrap gap-2">
          {SHOTS.map((s) => {
            const on = shot === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setShot(s.id)}
                className={cn('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] transition-colors',
                  on ? 'text-white' : 'border-[#e7e7e4] bg-white text-[#5a5a56] hover:border-[#c9c9c5]')}
                style={on ? { background: G, borderColor: G } : undefined}>
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>

        <p className="mt-6 max-w-[62ch] text-[15.5px] leading-relaxed text-[#5a5a56]">{active.blurb}</p>

        <div className="mt-6 rounded-2xl border p-2 shadow-[0_24px_70px_-32px_rgba(20,33,15,.35)] sm:p-3"
          style={{ borderColor: G_EDGE, background: G_PALE }}>
          <img key={active.id} src={active.src} alt={active.label}
            width={1200} height={750} loading="eager"
            className="block w-full rounded-xl bg-white" />
        </div>
      </Section>

      {/* ── Before / after ──────────────────────────────────────── */}
      <div className="border-y border-[#ededea] bg-[#fafaf9]">
        <Section className="py-16 sm:py-20">
          <Reveal><SectionLabel>Why practices move</SectionLabel></Reveal>
          <Reveal delay={60}>
            <h2 className="mt-3 max-w-[24ch] text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[38px]">
              It works at ten clients. It breaks at fifty.
            </h2>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-10 overflow-hidden rounded-2xl border border-[#ededea] bg-white">
              <div className="grid grid-cols-2 border-b border-[#ededea] text-[12.5px] font-semibold uppercase tracking-[0.1em]">
                <div className="px-5 py-3 text-[#9b9b9b]">Without NUSI</div>
                <div className="border-l border-[#ededea] px-5 py-3" style={{ background: G_PALE, color: G }}>With NUSI</div>
              </div>
              {BEFORE_AFTER.map(([before, after], i) => (
                <div key={before} className={cn('grid grid-cols-2 text-[14.5px]', i > 0 && 'border-t border-[#ededea]')}>
                  <div className="px-5 py-4 text-[#9b9b9b]">{before}</div>
                  <div className="border-l border-[#ededea] px-5 py-4 text-[#2c2c28]">{after}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </Section>
      </div>

      {/* ── A real dietitian ────────────────────────────────────── */}
      <Section className="py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Reveal><SectionLabel>A dietitian’s story</SectionLabel></Reveal>
            <Reveal delay={60}>
              <h2 className="mt-3 text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[36px]">
                Hear it from someone running a practice.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-4 max-w-[42ch] text-[15.5px] leading-relaxed text-[#5a5a56]">
                Dt. Aysha Nasreen on what changed when her practice moved onto NUSI —
                in her own words, unscripted.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: G }}>AN</span>
                <div>
                  <p className="text-[15px] font-medium">Dt. Aysha Nasreen</p>
                  <p className="text-[13.5px] text-[#9b9b9b]">Dietitian</p>
                </div>
              </div>
            </Reveal>
          </div>
          <Reveal delay={100}>
            <div className="overflow-hidden rounded-2xl border border-[#ededea] bg-black shadow-[0_24px_70px_-32px_rgba(20,33,15,.4)]">
              <video src="/testimonial.mp4" poster="/testimonial-poster-v2.jpg"
                controls preload="none" className="block w-full" />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── How it works ────────────────────────────────────────── */}
      <div className="border-y border-[#ededea]" style={{ background: G_PALE }}>
        <Section className="py-16 sm:py-20">
          <Reveal><SectionLabel>Getting started</SectionLabel></Reveal>
          <Reveal delay={60}>
            <h2 className="mt-3 max-w-[22ch] text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[38px]">
              Set up in an afternoon, not a quarter.
            </h2>
          </Reveal>
          <div className="mt-11 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <Reveal key={title} delay={80 + i * 70}>
                <div className="border-t-2 pt-5" style={{ borderColor: G }}>
                  <span className="text-[13px] font-semibold tabular-nums" style={{ color: G }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 text-[17px] font-medium tracking-[-0.01em]">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[#5a5a56]">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={360}>
            <div className="mt-12 grid items-center gap-6 rounded-2xl border bg-white p-3 lg:grid-cols-[1fr_1.3fr]"
              style={{ borderColor: G_EDGE }}>
              <div className="px-4 py-4 lg:px-6 lg:py-6">
                <h3 className="text-[20px] font-normal tracking-[-0.02em]">Watch the four-minute walkthrough</h3>
                <p className="mt-2 max-w-[38ch] text-[14.5px] leading-relaxed text-[#5a5a56]">
                  Choose a plan, brand it, verify your details, go live. No developer, no IT team.
                </p>
                <Link to="/features" className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-medium" style={{ color: G }}>
                  See everything it does <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="overflow-hidden rounded-xl bg-black">
                <video src="/tutorial-onboarding-v2.mp4" poster="/tutorial-onboarding-poster.jpg"
                  controls preload="none" className="block w-full" />
              </div>
            </div>
          </Reveal>
        </Section>
      </div>

      {/* ── What's included ─────────────────────────────────────── */}
      <Section className="py-16 sm:py-20">
        <Reveal><SectionLabel>What you get</SectionLabel></Reveal>
        <Reveal delay={60}>
          <h2 className="mt-3 max-w-[24ch] text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[38px]">
            One subscription. No add-ons to make it work.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#ededea] bg-[#ededea] sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={40 + i * 50}>
              <div className="h-full bg-white p-6 transition-colors hover:bg-[#fcfdfa]">
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: G_PALE, color: G }}>
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-[16.5px] font-medium tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#5a5a56]">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── Pricing ─────────────────────────────────────────────── */}
      <div className="border-y border-[#ededea] bg-[#fafaf9]">
        <Section className="py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <Reveal><SectionLabel>Pricing</SectionLabel></Reveal>
              <Reveal delay={60}>
                <h2 className="mt-3 text-[30px] font-normal leading-tight tracking-[-0.03em] sm:text-[38px]">
                  From ₹3,999 a month.
                </h2>
              </Reveal>
            </div>
            <Link to="/pricing" className="inline-flex items-center gap-1.5 text-[15px] font-medium" style={{ color: G }}>
              Full pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PLANS.map(([name, price, tagline, lines, featured]) => (
              <Reveal key={name} delay={featured ? 60 : 120}>
                <div className={cn('h-full rounded-2xl border bg-white p-6', featured && 'shadow-[0_24px_60px_-34px_rgba(20,33,15,.45)]')}
                  style={{ borderColor: featured ? G : '#ededea' }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[16px] font-medium">{name}</h3>
                    {featured && (
                      <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ background: G_PALE, color: G }}>
                        Most chosen
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13.5px] text-[#9b9b9b]">{tagline}</p>
                  <p className="mt-5 text-[34px] font-normal tracking-[-0.035em]" style={{ color: G }}>
                    {price}<span className="text-[14px] text-[#9b9b9b]">/month</span>
                  </p>
                  <ul className="mt-5 grid gap-2 text-[14.5px] text-[#5a5a56]">
                    {lines.map((l) => (
                      <li key={l} className="flex items-start gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: G }} />
                        {l}
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth?mode=signup"
                    className={cn('mt-6 block rounded-xl px-4 py-2.5 text-center text-[14.5px] font-medium transition-colors',
                      featured ? 'text-white' : 'border border-[#d9d9d6] hover:border-[#9b9b9b]')}
                    style={featured ? { background: G } : undefined}>
                    Start free trial
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-[13.5px] text-[#9b9b9b]">
            Prices include GST. A one-time setup fee applies when you join — account setup, branding,
            client import and training.
          </p>
        </Section>
      </div>

      {/* ── Close ───────────────────────────────────────────────── */}
      <Section className="py-20">
        <Reveal>
          <div className="overflow-hidden rounded-3xl px-8 py-14 text-center sm:px-14"
            style={{ background: `linear-gradient(160deg, ${G} 0%, ${G_DARK} 100%)` }}>
            <h2 className="mx-auto max-w-[20ch] text-[30px] font-normal leading-tight tracking-[-0.03em] text-white sm:text-[40px]">
              Try it with your own clients for 14 days.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[16px] leading-relaxed text-white/75">
              No card to begin. Nothing to cancel if you decide it is not for you.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/auth?mode=signup"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-[15px] font-medium transition-opacity hover:opacity-90"
                style={{ color: G }}>
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/booking-page"
                className="rounded-xl border border-white/30 px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/10">
                Book a walkthrough
              </Link>
            </div>
          </div>
        </Reveal>
      </Section>
    </SiteLayout>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[12.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: G }}>
      {children}
    </span>
  );
}

function Cta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to}
      className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-[15px] font-medium text-white shadow-[0_10px_28px_-12px_rgba(67,111,23,.7)] transition-colors"
      style={{ background: G }}
      onMouseEnter={(e) => { e.currentTarget.style.background = G_DARK; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = G; }}>
      {children}
    </Link>
  );
}

/**
 * Fade and lift as a section scrolls in. Renders visible immediately when the
 * visitor prefers reduced motion, or if IntersectionObserver is missing — this
 * must never be able to leave the page blank.
 */
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const el = ref.current;
    if (!el) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '-60px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}
      className={cn('transition-all duration-700 ease-out', shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
