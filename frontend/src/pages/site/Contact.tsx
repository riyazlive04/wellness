import { Link } from 'react-router-dom';

import { Rule, Section, SiteLayout } from '@/modules/site/SiteLayout';

export default function SiteContact() {
  return (
    <SiteLayout
      title="Contact NUSI"
      description="Email support@sirahdigital.in or call +91 97899 61631. NUSI is made by Sirah Digital, Pallavaram, Tamil Nadu."
    >
      <Section className="pb-12 pt-20 sm:pt-24">
        <h1 className="text-[32px] font-normal leading-[1.12] tracking-[-0.035em] sm:text-[40px]">Contact us</h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#6b6b6b]">
          We answer support ourselves — the people who build NUSI are the people who reply.
        </p>
      </Section>

      <Rule />

      <Section className="py-14">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">Get in touch</h2>
            <dl className="mt-5 grid gap-5 text-[15.5px]">
              <div>
                <dt className="text-[#9b9b9b]">Email</dt>
                <dd className="mt-0.5">
                  <a href="mailto:support@sirahdigital.in" className="underline-offset-4 hover:underline">
                    support@sirahdigital.in
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Phone and WhatsApp</dt>
                <dd className="mt-0.5">
                  <a href="tel:+919789961631" className="underline-offset-4 hover:underline">+91 97899 61631</a>
                </dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Hours</dt>
                <dd className="mt-0.5 text-[#6b6b6b]">Monday to Saturday, 10am–7pm IST</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-[0.1em] text-[#9b9b9b]">Registered office</h2>
            <address className="mt-5 not-italic text-[15.5px] leading-relaxed text-[#6b6b6b]">
              <b className="font-medium text-[#0c0c0c]">Sirah Digital</b><br />
              SY No. 203/10B, Innov8, Featherlite The Address<br />
              200 Feet Radial Road, Iswarya Nagar<br />
              Pallavaram, Tamil Nadu 600044<br />
              India
            </address>
          </div>
        </div>
      </Section>

      <Rule />

      <Section className="py-14">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            ['Thinking about NUSI', 'Book a 45-minute walkthrough and we will show you it running.', 'Book a demo', '/booking-page'],
            ['Already a customer', 'Message us from inside the app and we will have your account in front of us.', 'Sign in', '/auth'],
            ['Just want to try it', 'Start the 14-day trial. No card, nothing to cancel if you stop.', 'Start free trial', '/auth?mode=signup'],
          ].map(([t, b, cta, to]) => (
            <div key={t}>
              <h3 className="text-[16px] font-medium tracking-[-0.01em]">{t}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#6b6b6b]">{b}</p>
              <Link to={to} className="mt-3 inline-block text-[14.5px] underline-offset-4 hover:underline">{cta} →</Link>
            </div>
          ))}
        </div>
      </Section>
    </SiteLayout>
  );
}
