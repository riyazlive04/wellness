import { Link } from 'react-router-dom';

import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

export default function SiteAbout() {
  return (
    <SiteLayout
      title="About NUSI — by Sirah Digital"
      description="NUSI is built by Sirah Digital in Chennai, with practising dietitians, for nutrition practices in India."
    >
      <Section className="pb-12 pt-20 sm:pt-24">
        <h1 className="max-w-[24ch] text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[40px]">
          Built with nutritionists, not for an imagined one.
        </h1>
      </Section>

      <Rule />

      <Section className="py-14">
        <div className="grid gap-10 sm:grid-cols-[180px_1fr]">
          <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">Why it exists</h2>
          <div className="grid max-w-[64ch] gap-5 text-[15.5px] leading-relaxed text-[#6b6b6b]">
            <p>
              Most nutritionists run a practice on things never meant for it: diet charts in Word,
              client conversations in a personal WhatsApp, payments tracked in memory. It works at ten
              clients. At fifty it starts costing evenings.
            </p>
            <p>
              NUSI exists to put those pieces in one place — the plan, the client, the daily logs and the
              money — so the admin stops expanding to fill the practice.
            </p>
            <p>
              We built it with practising dietitians and kept changing it as they used it. Several of the
              things in it today exist because someone asked for them during a real consultation week.
            </p>
          </div>
        </div>
      </Section>

      <Rule />

      <Section className="py-14">
        <div className="grid gap-10 sm:grid-cols-[180px_1fr]">
          <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">How we build</h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {[
              ['Made for India', 'Indian foods and portions, rupee pricing with GST handled, WhatsApp where clients already are.'],
              ['Your name on it', 'Your clients see your practice, not ours. The app carries your branding.'],
              ['Your judgement leads', 'The AI drafts and estimates. You approve. It never prescribes anything to a client on its own.'],
              ['No surprise pricing', 'What is on the plan is what you get. Add-ons are optional, never required to make it work.'],
            ].map(([t, b]) => (
              <div key={t}>
                <h3 className="text-[16px] font-medium tracking-[-0.01em]">{t}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#6b6b6b]">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Rule />

      <Section className="py-14">
        <div className="grid gap-10 sm:grid-cols-[180px_1fr]">
          <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">Who we are</h2>
          <div className="max-w-[64ch] text-[15.5px] leading-relaxed text-[#6b6b6b]">
            <p>
              NUSI is made by <b className="font-medium text-[#0c0c0c]">Sirah Digital</b>, a software company
              in Chennai, Tamil Nadu. We build and run it ourselves — the same people answer support.
            </p>
            <address className="mt-5 not-italic text-[14.5px]">
              SY No. 203/10B, Innov8, Featherlite The Address<br />
              200 Feet Radial Road, Iswarya Nagar<br />
              Pallavaram, Tamil Nadu 600044<br />
              <a href="mailto:support@sirahdigital.in" className="underline-offset-4 hover:underline">support@sirahdigital.in</a>
              {' · '}
              <a href="tel:+919789961631" className="underline-offset-4 hover:underline">+91 97899 61631</a>
            </address>
          </div>
        </div>
      </Section>

      <Rule />

      <Section className="py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-[36ch] text-[22px] font-normal leading-snug tracking-[-0.02em]">
            Have a question before you try it?
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/contact"
              className="rounded-lg bg-[#436F17] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#375818]">
              Contact us
            </Link>
            <Link to="/booking-page" className="text-sm text-[#6b6b6b] underline-offset-4 hover:underline">
              Book a walkthrough
            </Link>
          </div>
        </div>
      </Section>
    </SiteLayout>
  );
}
