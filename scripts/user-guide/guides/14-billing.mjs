export default {
  no: 14,
  slug: 'billing',
  section: 'Billing',
  color: '#9333ea',
  title: 'Billing & plans',
  tagline: 'Choose or change your plan, pay securely, buy extra AI credits, download GST invoices and cancel when you need to.',
  where: '`Billing` in the left menu (owner only)',
  intro: [
    'Billing is for the practice owner (or a team member the owner has given billing access). All prices include 18% GST, and you get a GST invoice with every payment.',
  ],
  sections: [
    {
      title: 'The plans',
      table: [
        ['', 'Starter', 'Growth (recommended)', 'Scale Pro'],
        ['Monthly', '₹3,999', '₹8,999', '₹19,999'],
        ['Yearly (2 months free)', '₹39,999', '₹89,999', '₹1,99,999'],
        ['One-time setup fee', '₹4,999', '₹9,999', '₹24,999'],
        ['Clients', '100', '500', 'Unlimited'],
        ['Team members', '1', '5', 'Unlimited'],
        ['AI credits / month', '500', '5,000', '25,000'],
        ['Storage', '5 GB', '50 GB', '200 GB'],
        ['Video calls / month', '-', '30 hours', '100 hours'],
      ],
      bullets: [
        '**Starter:** client app, programs, weekly meal plans, food diary, AI Plate Scanner, barcode scanner, habits and goals, chat, progress reports and PDFs, reminders.',
        '**Growth adds:** online booking, video consultations, the AI Nutrition Assistant for clients, comprehensive assessments, community groups and analytics.',
        '**Scale Pro adds:** recipe library, multi-branch organisation, revenue analytics, audit logs, API access and white-label branding.',
      ],
    },
    {
      title: 'The Plans & usage tab',
      bullets: [
        'The top strip shows your **Current plan**, the renewal or trial end date and days left.',
        '**Plan usage** shows Clients, AI credits this month, Team seats and Storage, each against your limit.',
        'Switch between `Monthly` and `Annual` prices with the toggle.',
      ],
    },
    {
      title: 'Choose a plan and pay',
      steps: [
        'Choose `Monthly` or `Annual`.',
        'Click `Pay for Starter` (or Growth or Scale Pro).',
        'A summary opens: what the plan includes, its AI credits and video hours, the price, the one-time setup fee, the GST included and the **Due today** total.',
        'Click `Continue to payment`.',
        'Pay in the secure Razorpay window with UPI, card or net banking.',
        'You see "Welcome to … Your subscription is active." Your new limits apply straight away.',
      ],
      note: [
        'UPI and card payments renew automatically each month or year.',
        'The setup fee is charged only once, with your first payment. If you paid part of it on an earlier plan, you pay only the difference.',
      ],
    },
    {
      title: 'Upgrade or downgrade',
      bullets: [
        '**Upgrade:** click `Upgrade` on the higher plan. You pay only the balance for the days left in your current period (no second setup fee). Click `Confirm upgrade`.',
        '**Downgrade:** click `Downgrade` on the lower plan. Nothing is charged now; the change takes effect at your next renewal. Click `Confirm downgrade`.',
      ],
    },
    {
      title: 'Buy extra AI credits (Top-ups)',
      table: [
        ['Pack', 'Price'],
        ['1,000 AI credits', '₹999'],
        ['5,000 AI credits', '₹3,999'],
        ['20,000 AI credits', '₹9,999'],
      ],
      text: 'Click `Buy` on a pack and pay. The credits are added immediately and last 30 days.',
    },
    {
      title: 'Invoices',
      bullets: [
        'Open the `Invoices` tab to see **Lifetime paid**, **Settled** and **Outstanding**, and every invoice.',
        'Click `PDF` to download a GST invoice for your accounts (CGST + SGST within Tamil Nadu, IGST for other states).',
        '**Billing activity** lists payments, renewals and reminders; `Mark all read` clears them.',
      ],
      tip: 'If your practice is GST-registered, your accountant can use these invoices to claim the GST back.',
    },
    {
      title: 'Cancel your subscription',
      text: 'Click `Cancel at cycle end` at the top of the Billing page. You keep your plan until the end of the period you paid for; nothing more is charged.',
    },
    {
      title: 'If a payment fails',
      text: 'A banner **"Payment failed - update your card"** appears with `Fix payment`. You have 14 days to fix it; after that the practice moves to trial limits until a payment goes through.',
    },
  ],
};
