import { useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

/**
 * Real product screenshots that already ship with the app. Shown at size,
 * because a minimal site still has to prove the product exists — the first
 * version of this page said a lot and showed nothing.
 */
const SHOTS = [
  { id: 'plans', label: 'Meal plans', src: '/landing/problem-diet-templates.webp',
    blurb: 'Build a week once. Reuse it, or copy it to another client and pick which weeks carry over.' },
  { id: 'chat', label: 'Client chat', src: '/landing/problem-client-chat.webp',
    blurb: 'Every conversation in one place, attached to the client — not lost in your personal WhatsApp.' },
  { id: 'risk', label: 'Who has gone quiet', src: '/landing/problem-at-risk.webp',
    blurb: 'A list of clients who stopped logging, while there is still time to call them.' },
  { id: 'vision', label: 'Plate scanner', src: '/landing/problem-plate-vision.webp',
    blurb: 'A client photographs a plate; NUSI estimates what is on it. They correct it if needed.' },
  { id: 'daily', label: 'Daily tasks', src: '/landing/problem-daily-tasks.webp',
    blurb: 'Meal and water reminders at the times you set, on the client’s phone.' },
  { id: 'appts', label: 'Appointments', src: '/landing/problem-appointments.webp',
    blurb: 'Clients book inside your working hours. Video calls included from Growth.' },
] as const;

export default function SiteHome() {
  const [shot, setShot] = useState<(typeof SHOTS)[number]['id']>('plans');
  const active = SHOTS.find((s) => s.id === shot)!;

  return (
    <SiteLayout
      title="NUSI — practice software for nutritionists"
      description="Meal plans, a client app, daily tracking and billing for nutrition practices in India. From ₹3,999 a month, with 14 days free."
    >
      {/* Hero */}
      <Section className="pb-12 pt-16 sm:pt-20">
        <h1 className="max-w-[20ch] text-[38px] font-normal leading-[1.05] tracking-[-0.04em] sm:text-[58px]">
          Run your practice, not your admin.
        </h1>
        <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-[#6b6b6b]">
          Meal plans, a client app, daily tracking and billing — one subscription,
          built for nutrition practices in India.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link to="/auth?mode=signup"
            className="rounded-lg bg-[#436F17] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#375818]">
            Start free trial
          </Link>
          <Link to="/booking-page" className="text-[15px] text-[#6b6b6b] underline-offset-4 hover:underline">
            Book a walkthrough
          </Link>
          <span className="rounded-full bg-[#F3FAE8] px-3 py-1 text-sm font-medium text-[#436F17]">14 days free · no card needed</span>
        </div>
      </Section>

      {/* The product, at size, with tabs — the substance the page was missing. */}
      <Section className="pb-16">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-[#ededea] pb-3">
          {SHOTS.map((s) => (
            <button key={s.id} type="button" onClick={() => setShot(s.id)}
              className={cn('text-[14.5px] transition-colors',
                shot === s.id ? 'font-medium text-[#436F17]' : 'text-[#9b9b9b] hover:text-[#6b6b6b]')}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-[#6b6b6b]">{active.blurb}</p>
        {/* The screenshots are wider than they are tall and were taken at a
            fixed width; `contain` keeps the whole frame visible rather than
            cropping the right-hand side off. */}
        <div className="mt-5 overflow-hidden rounded-xl border border-[#E4F4CC] bg-[#F3FAE8] p-2 sm:p-3">
          <img key={active.id} src={active.src} alt={active.label}
            width={1200} height={750} loading="eager"
            className="mx-auto block w-full rounded-lg object-contain" />
        </div>
      </Section>

      <Rule />

      {/* Three plain statements, on a pale wash so the page has rhythm. */}
      <div className="bg-[#F3FAE8]">
      <Section className="py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            ['Build a plan once', 'Write a meal plan, reuse it, copy it to any client who needs it. Weeks of retyping gone.'],
            ['They log, you see it', 'Clients record meals, water, sleep and exercise on their phone. It is on your screen before the session.'],
            ['Billing runs itself', 'Subscriptions, invoices and reminders handled, so you are not chasing payments by message.'],
          ].map(([title, body]) => (
            <div key={title}>
              <h2 className="text-[17px] font-medium tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[#6b6b6b]">{body}</p>
            </div>
          ))}
        </div>
      </Section>
      </div>

      <Rule />

      {/* The walkthrough that already exists in the app. */}
      <Section className="py-16">
        <div className="grid items-center gap-10 sm:grid-cols-[1fr_1.25fr]">
          <div>
            <span className="text-xs uppercase tracking-[0.12em] text-[#436F17]">Walkthrough</span>
            <h2 className="mt-3 text-[26px] font-normal leading-tight tracking-[-0.025em]">
              Set up a practice in about four minutes.
            </h2>
            <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-[#6b6b6b]">
              Choose a plan, brand it as your own, verify your details, go live. No developer, no IT team.
            </p>
            <Link to="/features" className="mt-4 inline-block text-[15px] underline-offset-4 hover:underline">
              See everything it does →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#ededea] bg-black">
            <video
              src="/tutorial-onboarding-v2.mp4"
              poster="/tutorial-onboarding-poster.jpg"
              controls
              preload="none"
              className="block w-full"
            />
          </div>
        </div>
      </Section>

      <Rule />

      {/* Pricing, stated plainly rather than hidden behind a click. */}
      <Section className="py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[26px] font-normal tracking-[-0.025em]">From ₹3,999 a month</h2>
          <Link to="/pricing" className="text-[15px] text-[#6b6b6b] underline-offset-4 hover:underline">
            Full pricing →
          </Link>
        </div>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {[
            ['Starter', '₹3,999', '100 clients · 1 user'],
            ['Growth', '₹8,999', '500 clients · 5 team members'],
            ['Scale Pro', '₹19,999', 'Unlimited clients · multi-branch'],
          ].map(([name, price, detail]) => (
            <div key={name} className="border-t border-[#ededea] pt-4">
              <h3 className="text-[15px] font-medium">{name}</h3>
              <p className="mt-1 text-[26px] font-normal tracking-[-0.03em] text-[#436F17]">
                {price}<span className="text-[14px] text-[#9b9b9b]">/month</span>
              </p>
              <p className="mt-1 text-[14px] text-[#6b6b6b]">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[13.5px] text-[#9b9b9b]">
          Prices include GST. A one-time setup fee applies when you join — account setup, branding,
          client import and training.
        </p>
      </Section>

      <Rule />

      <Section className="py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[34ch] text-[24px] font-normal leading-snug tracking-[-0.025em]">
            Try it with your own clients for 14 days.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/auth?mode=signup"
              className="rounded-lg bg-[#436F17] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#375818]">
              Start free trial
            </Link>
            <Link to="/booking-page" className="text-sm text-[#6b6b6b] underline-offset-4 hover:underline">
              Or book a walkthrough
            </Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
