import { Link } from 'react-router-dom';

import { IndexRow, Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

/**
 * The homepage as a contents page: a plain statement of what NUSI is, then
 * every part of the site as a line you can click.
 *
 * No claims that cannot be backed — no customer counts, no testimonials, no
 * statistics. Only what the product demonstrably does and what it costs.
 */
export default function SiteHome() {
  return (
    <SiteLayout
      title="NUSI — practice software for nutritionists"
      description="Meal plans, a client app, daily tracking and billing for nutrition practices in India. From ₹3,999 a month, with 14 days free."
    >
      <Section className="pb-14 pt-20 sm:pt-28">
        <h1 className="max-w-[34ch] text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[42px]">
          NUSI is practice software for nutritionists — meal plans, a client app,
          daily tracking and billing.
        </h1>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link to="/auth?mode=signup"
            className="rounded-lg bg-[#0c0c0c] px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-85">
            Start free trial
          </Link>
          <span className="text-sm text-[#9b9b9b]">14 days free · no card needed</span>
        </div>
      </Section>

      <Section className="pb-20">
        <IndexRow to="/features" label="What it does" note="Plans, client app, logs, payments" />
        <IndexRow to="/pricing" label="Pricing" note="From ₹3,999 a month" />
        <IndexRow to="/about" label="Who built it" note="Sirah Digital, Chennai" />
        <IndexRow to="/booking-page" label="Talk to us" note="Book a 45-minute walkthrough" />
        <div className="border-t border-[#ededea]" />
      </Section>

      <Rule />

      {/* One quiet strip of substance, so the page is not only an index. */}
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

      <Rule />

      <Section className="py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[40ch] text-[22px] font-normal leading-snug tracking-[-0.02em]">
            Built with practising dietitians, for practices in India.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/auth?mode=signup"
              className="rounded-lg bg-[#0c0c0c] px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-85">
              Start free trial
            </Link>
            <Link to="/pricing" className="text-sm text-[#6b6b6b] underline-offset-4 hover:underline">
              See pricing
            </Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
