import { Link } from 'react-router-dom';

import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

/** Grouped by the job it does, not by screen name. */
const GROUPS = [
  {
    title: 'Planning',
    items: [
      ['Meal plans', 'Build a week once and reuse it. Copy a plan to another client, pick which weeks to carry over.'],
      ['Programs', 'Multi-week structures with tasks, so a client knows what to do on day nine without asking.'],
      ['Recipes and foods', 'Your own library, plus an Indian food database with portions people actually use.'],
    ],
  },
  {
    title: 'The client app',
    items: [
      ['Their own app', 'Clients get a real app, in your practice name, on Android and iPhone.'],
      ['Food diary', 'Meals logged by photo or search, with the nutrition worked out.'],
      ['Plate scanner', 'A photo of a plate becomes an estimated log, which the client can correct.'],
      ['Daily log', 'You choose the questions — blood sugar, sleep, water, anything — and they answer daily.'],
      ['Exercise', 'A photo and a few words after a walk or a gym session.'],
      ['Reminders', 'Meal and water nudges at the times you set, on their phone.'],
    ],
  },
  {
    title: 'Keeping track',
    items: [
      ['Charts over time', 'Every number a client records, plotted. Fasting glucose over 30 days, not a guess.'],
      ['Who has gone quiet', 'A list of clients who stopped logging, before they stop paying.'],
      ['Progress photos', 'Front, side and back over time, with weight alongside.'],
      ['Reports', 'A PDF a client can keep, or show their doctor.'],
    ],
  },
  {
    title: 'Running the practice',
    items: [
      ['Client chat', 'Conversations in one place instead of your personal WhatsApp.'],
      ['Appointments', 'Clients book in your working hours. Video calls included from Growth.'],
      ['Payments', 'Subscriptions, invoices and GST handled through Razorpay.'],
      ['Your team', 'Add nutritionists and assistants, each with their own access.'],
    ],
  },
] as const;

/** One screenshot per group, in the same order. */
const SHOTS = [
  { src: '/landing/problem-diet-templates.webp', alt: 'Building a meal plan in NUSI' },
  { src: '/landing/problem-plate-vision.webp', alt: 'A client logging a meal by photo' },
  { src: '/landing/problem-at-risk.webp', alt: 'Clients who have stopped logging' },
  { src: '/landing/problem-appointments.webp', alt: 'Appointments in NUSI' },
] as const;

export default function SiteFeatures() {
  return (
    <SiteLayout
      title="What NUSI does — features"
      description="Meal plans, a branded client app, daily health tracking, charts, chat, appointments and billing — everything a nutrition practice runs on."
    >
      <Section className="pb-12 pt-20 sm:pt-24">
        <h1 className="max-w-[26ch] text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[40px]">
          Everything your practice runs on.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#6b6b6b]">
          One subscription. No add-ons to buy before it does what you need.
        </p>
      </Section>

      <Rule />

      {/* One real screenshot per group, so the page shows as well as tells. */}
      {GROUPS.map((g, i) => (
        <div key={g.title}>
          <Section className="py-14">
            <div className="grid gap-10 sm:grid-cols-[180px_1fr]">
              <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">{g.title}</h2>
              <div className="grid gap-8 sm:grid-cols-2">
                {g.items.map(([title, body]) => (
                  <div key={title}>
                    <h3 className="text-[16px] font-medium tracking-[-0.01em]">{title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#6b6b6b]">{body}</p>
                  </div>
                ))}
              </div>
            </div>
            {SHOTS[i] && (
              <div className="mt-10 overflow-hidden rounded-xl border border-[#ededea] bg-[#fafaf9]">
                <img src={SHOTS[i].src} alt={SHOTS[i].alt} width={1200} height={750}
                  loading="lazy" className="w-full" />
              </div>
            )}
          </Section>
          <Rule />
        </div>
      ))}

      <Section className="py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[36ch] text-[22px] font-normal leading-snug tracking-[-0.02em]">
            Try it with your own clients for 14 days.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/auth?mode=signup"
              className="rounded-lg bg-[#436F17] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#375818]">
              Start free trial
            </Link>
            <Link to="/pricing" className="text-sm text-[#6b6b6b] underline-offset-4 hover:underline">See pricing</Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
