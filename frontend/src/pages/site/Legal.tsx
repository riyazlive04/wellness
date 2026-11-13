import { H, LegalDoc, UL } from './LegalChrome';

/** Last reviewed. Update when the wording changes, not on every deploy. */
const UPDATED = '13 November 2026';

const COMPANY = 'Sirah Digital';
const ADDRESS = 'SY No. 203/10B, Innov8, Featherlite The Address, 200 Feet Radial Road, Iswarya Nagar, Pallavaram, Tamil Nadu 600044, India';
const EMAIL = 'support@sirahdigital.in';
const PHONE = '+91 97899 61631';

/* ─────────────────────────── Terms ─────────────────────────── */

export function SiteTerms() {
  return (
    <LegalDoc updated={UPDATED} title="Terms of Service"
      description="The terms on which Sirah Digital provides the NUSI practice software to nutrition professionals.">
      <section>
        <p>
          These terms govern your use of NUSI, the practice software provided by {COMPANY}, {ADDRESS}
          (“we”, “us”). By creating an account or using NUSI you agree to them. If you are agreeing on
          behalf of a practice, you confirm you may bind it.
        </p>
      </section>

      <section>
        <H>What NUSI is</H>
        <p>
          NUSI is software for nutrition professionals to run a practice: meal plans, client records,
          messaging, daily tracking, appointments and billing. It is a tool for a qualified professional
          to use with their own clients.
        </p>
        <p className="mt-3">
          <b className="font-medium text-[#0c0c0c]">NUSI does not give medical advice and is not a medical
          device.</b> Nothing it generates is a diagnosis, a prescription or a treatment plan. Clinical
          judgement remains entirely yours, and you are responsible for the advice you give your clients.
        </p>
      </section>

      <section>
        <H>Your professional practice</H>
        <p>
          You practise in your own name and under your own qualifications. NUSI records and
          communicates what you decide; it does not decide anything for you, and we are not a
          party to the relationship between you and your client.
        </p>
        <p className="mt-3">
          <b className="font-medium text-[#0c0c0c]">You are solely responsible for your professional
          conduct.</b> That includes:
        </p>
        <UL items={[
          'Holding the qualifications, registration and licences your practice requires, and keeping them current.',
          'The accuracy and suitability of every plan, recommendation and piece of advice you give, including anything you build using features that suggest or estimate.',
          'Any product you recommend, supply or sell to a client — including nutritional supplements — and the licences, labelling, safety and claims that apply to it under Indian law.',
          'Obtaining your client’s informed consent, and referring them to a doctor where their condition calls for one.',
          'Any complaint, claim, investigation or disciplinary proceeding brought by a client, a regulator or anyone else in connection with your practice.',
        ]} />
        <p className="mt-3">
          Supplements are a point worth stating plainly: practitioners may use NUSI to record and
          invoice supplements they recommend or sell, but doing so is your decision and your
          responsibility. We do not supply, endorse, verify or take any part in those products, and
          we are not liable for them or for anything that follows from them. Selling medicines or
          prescription drugs through NUSI remains prohibited.
        </p>
      </section>

      <section>
        <H>Your account</H>
        <UL items={[
          'You must give accurate details and keep them current.',
          'You are responsible for everything done under your account and for your team members’ use of it.',
          'Keep your password private and tell us promptly if you believe someone else has access.',
          'You must hold the qualifications and registrations your jurisdiction requires to practise.',
        ]} />
      </section>

      <section>
        <H>Your clients’ data</H>
        <p>
          The health information you record about your clients belongs to you and to them — not to us. We
          process it on your behalf to provide the service, and we do not sell it or use it to advertise.
          You are responsible for having the consent you need to collect it, and for what you record.
        </p>
        <p className="mt-3">
          You can export your data at any time, and you can ask us to delete it. See our{' '}
          <a href="/privacy" className="underline underline-offset-4">privacy policy</a>.
        </p>
      </section>

      <section>
        <H>Payment</H>
        <UL items={[
          'Subscriptions are billed monthly or yearly in advance. Plan prices are quoted exclusive of GST; 18% GST is added at checkout and shown on your invoice. One-time setup fees are inclusive of GST.',
          'A one-time setup fee is charged with your first invoice. It is charged once; changing to a plan with a higher fee charges only the difference.',
          'Payments are processed by Razorpay. We do not store your card details.',
          'If a payment fails we will retry and tell you. Repeated failure may suspend your account until it is settled.',
          'We may change prices with at least 30 days’ notice. Your current billing period is never repriced.',
        ]} />
      </section>

      <section>
        <H>Cancelling</H>
        <p>
          You can cancel at any time from your billing page. You keep access until the end of the period
          you have paid for, and we do not charge again after that. For refunds, see our{' '}
          <a href="/refunds" className="underline underline-offset-4">refund policy</a>.
        </p>
      </section>

      <section>
        <H>Acceptable use</H>
        <p>You agree not to:</p>
        <UL items={[
          'Use NUSI for anything unlawful, or to harm or mislead a client.',
          'Upload malware, attempt to breach our systems, or access another practice’s data.',
          'Resell or white-label NUSI without our written agreement.',
          'Use it to sell medicines or prescription drugs. (Supplements are treated separately — see “Your professional practice”.)',
        ]} />
        <p className="mt-3">
          We may suspend an account that breaches this, and will tell you why.
        </p>
      </section>

      <section>
        <H>Availability</H>
        <p>
          We work to keep NUSI available, but we do not promise it will never be interrupted. We may take
          it down for maintenance, and will give notice where we reasonably can.
        </p>
      </section>

      <section>
        <H>Liability</H>
        <p>
          NUSI is provided as it is. To the extent the law allows, we are not liable for indirect or
          consequential loss, lost profits, or loss arising from your practice — including the clinical
          decisions you make, the advice you give, and any product or supplement you recommend, supply
          or sell. Our total liability in any twelve-month period is limited to what you paid us in
          that period.
        </p>
        <p className="mt-3">
          Nothing here limits liability that cannot be limited by law.
        </p>
      </section>

      <section>
        <H>Governing law</H>
        <p>
          These terms are governed by the laws of India, and the courts at Chennai, Tamil Nadu have
          exclusive jurisdiction.
        </p>
      </section>

      <section>
        <H>Contact</H>
        <p>{COMPANY} · {EMAIL} · {PHONE}<br />{ADDRESS}</p>
      </section>
    </LegalDoc>
  );
}

/* ────────────────────────── Privacy ────────────────────────── */

export function SitePrivacy() {
  return (
    <LegalDoc updated={UPDATED} title="Privacy Policy"
      description="How Sirah Digital collects, uses and protects data in NUSI, including the health information nutritionists record about their clients.">
      <section>
        <p>
          This policy explains what {COMPANY} does with information in NUSI. We are the data controller for
          nutritionists’ account data, and a data processor for the client health information a
          nutritionist records.
        </p>
      </section>

      <section>
        <H>What we collect</H>
        <p><b className="font-medium text-[#0c0c0c]">From nutritionists:</b></p>
        <UL items={[
          'Name, email, phone, practice name and address.',
          'Billing details. Card numbers are handled by Razorpay and never reach us.',
          'How you use NUSI — pages opened, features used — to find faults and improve it.',
        ]} />
        <p className="mt-4"><b className="font-medium text-[#0c0c0c]">About your clients, recorded by you or by them:</b></p>
        <UL items={[
          'Contact details and basic profile.',
          'Health information: weight, measurements, meals, readings such as blood glucose, symptoms, photos.',
          'Messages between you and them, appointments, and payment records.',
        ]} />
      </section>

      <section>
        <H>Why we hold it</H>
        <UL items={[
          'To provide the service you have paid for.',
          'To take payment and meet tax and accounting obligations.',
          'To support you when you ask, and to keep the service secure.',
          'To improve NUSI — using aggregate patterns, not individual client records.',
        ]} />
      </section>

      <section>
        <H>What we never do</H>
        <UL items={[
          'We do not sell personal data, ever.',
          'We do not use client health information for advertising.',
          'We do not share one practice’s data with another.',
          'We do not use your clients’ health data to train AI models.',
        ]} />
      </section>

      <section>
        <H>Who we share it with</H>
        <p>Only service providers who help run NUSI, and only what they need:</p>
        <UL items={[
          'Supabase — database and file storage.',
          'Razorpay — payment processing.',
          'Resend — transactional email.',
          'Google — Firebase push notifications, and Calendar if you book demo calls with us.',
          'AI providers — for features you choose to use, such as plate analysis. Content sent for processing is not used to train their models.',
        ]} />
        <p className="mt-3">We also disclose data where the law requires it.</p>
      </section>

      <section>
        <H>Where it is kept, and for how long</H>
        <p>
          Data is stored on servers in India. We keep it while your account is active. After you close
          your account we delete or anonymise it within 90 days, except records we must keep for tax
          purposes, which we hold for the period Indian law requires.
        </p>
      </section>

      <section>
        <H>Security</H>
        <UL items={[
          'Encrypted in transit (HTTPS) and at rest.',
          'Each practice’s data is separated at the database level.',
          'Photos and files are private, reachable only through short-lived signed links.',
          'Access is limited to staff who need it, and is logged.',
        ]} />
      </section>

      <section>
        <H>Your rights</H>
        <p>
          You can ask us to show you the data we hold about you, correct it, export it, or delete it.
          Write to {EMAIL} and we will respond within 30 days. A client who wants their record changed
          or removed should ask their nutritionist, who controls it; we will help the nutritionist do it.
        </p>
      </section>

      <section>
        <H>Health data and your professional responsibility</H>
        <p>
          Much of what NUSI holds is health information about a client: measurements, blood sugar and
          blood pressure readings, conditions, medicines and supplements they take, and what you have
          advised. You decide what is recorded and why, and you are responsible for having a lawful
          basis and your client’s consent to record it.
        </p>
        <p className="mt-3">
          We process this data for you, as your processor. We do not use it to advise anyone, and we
          take no part in the clinical or commercial decisions you make from it — including any
          supplement or product you recommend or sell. Those responsibilities are set out in our{' '}
          <a href="/terms" className="underline underline-offset-4">Terms of Service</a>.
        </p>
      </section>

      <section>
        <H>Children</H>
        <p>
          NUSI is for professional use by adults. A nutritionist may record information about a client
          under 18 where they have the consent of a parent or guardian, which is their responsibility to obtain.
        </p>
      </section>

      <section>
        <H>Changes and contact</H>
        <p>
          If we change this policy we will update the date above and, for anything significant, tell you
          by email. Questions: {EMAIL} · {PHONE}<br />{COMPANY}, {ADDRESS}
        </p>
      </section>
    </LegalDoc>
  );
}

/* ────────────────────────── Refunds ────────────────────────── */

export function SiteRefunds() {
  return (
    <LegalDoc updated={UPDATED} title="Refund and Cancellation Policy"
      description="NUSI's refund policy: a 7-day refund window on your first subscription payment, and how to cancel.">
      <section>
        <p>
          This policy covers subscription payments made to {COMPANY} for NUSI. We would rather you were
          sure before you pay, which is why every plan begins with a free trial.
        </p>
      </section>

      <section>
        <H>Try it free first</H>
        <p>
          Every plan starts with <b className="font-medium text-[#0c0c0c]">14 days free</b>, with no card
          required. You can use NUSI with your own clients in that time. Nothing is charged unless you
          choose a plan at the end of it.
        </p>
      </section>

      <section>
        <H>Refund on your first payment</H>
        <p>
          If NUSI is not right for you, you can request a full refund of your{' '}
          <b className="font-medium text-[#0c0c0c]">first subscription payment within 7 days</b> of that
          payment. Email {EMAIL} from the address on your account and tell us you would like a refund.
          You do not have to give a reason.
        </p>
        <p className="mt-3">
          Once refunded, the subscription ends and access stops.
        </p>
      </section>

      <section>
        <H>What is not refundable</H>
        <UL items={[
          'Payments after the first one. Renewals are not refunded — cancel before the next renewal date instead.',
          'The one-time setup fee, once the setup work has been carried out. If you request a refund within 7 days and we have not yet begun it, we refund the setup fee too.',
          'AI credit packs, once the credits have been added to your account.',
          'Any period you have already used beyond the 7-day window.',
        ]} />
      </section>

      <section>
        <H>Cancelling</H>
        <p>
          Cancel any time from <b className="font-medium text-[#0c0c0c]">Billing</b> in your account, or by
          emailing {EMAIL}. Cancelling stops the next payment. You keep full access until the end of the
          period you have already paid for, and your data stays available throughout.
        </p>
      </section>

      <section>
        <H>How refunds are paid</H>
        <p>
          Approved refunds go back through Razorpay to the original payment method. We process them within
          5 working days of approving; your bank then typically takes 5–7 working days to show it.
        </p>
      </section>

      <section>
        <H>Failed payments</H>
        <p>
          If a renewal fails we retry it and tell you. We do not suspend an account immediately — you have
          a grace period to update your payment method before access is affected.
        </p>
      </section>

      <section>
        <H>Disputes</H>
        <p>
          If you think you have been charged in error, email {EMAIL} before raising it with your bank. We
          will look into it and correct anything that is genuinely wrong, usually faster than a chargeback.
        </p>
      </section>

      <section>
        <H>Contact</H>
        <p>{COMPANY} · {EMAIL} · {PHONE}<br />{ADDRESS}</p>
      </section>
    </LegalDoc>
  );
}
