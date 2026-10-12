export default {
  no: 2,
  slug: 'overview',
  title: 'Your dashboard (Overview)',
  tagline: 'The first screen you see each day: how your practice is doing, who needs you, what is coming up, and how much of your plan you have used.',
  where: '`Overview` in the left menu',
  intro: [
    'The dashboard brings the most important numbers of your practice onto one screen. Every tile can be clicked to go straight to the details behind it.',
  ],
  sections: [
    {
      title: 'The greeting line',
      text: [
        'At the top you see today\'s date and a greeting with your name, followed by a short summary such as **"Green Leaf Nutrition · 12 clients · 8 active this week"**.',
        '"Active this week" counts clients who logged at least one meal in the last 7 days.',
      ],
      tip: 'The `All clients` button on the right opens your full client list.',
    },
    {
      title: 'The six tiles',
      table: [
        ['Tile', 'What it shows', 'Click to'],
        ['**Active clients**', 'Clients who are currently active, out of all your clients', 'Open your client list'],
        ['**Active programs**', 'How many program enrolments are running, and their average progress', 'Open Programs'],
        ['**Needs a nudge**', 'Clients at risk (no meal logged in 10 days)', 'See only the at-risk clients'],
        ['**Your plan**', 'What you pay each month, or how many trial days are left', 'Open Billing (owners only)'],
        ['**AI credits**', 'AI credits used this month out of your allowance, e.g. 53/500', 'See where your credits went'],
        ['**Storage**', 'Space used by photos, files and documents, e.g. 417 KB/1 GB', 'See who uses the storage'],
      ],
      note: 'A client is "at risk" when they are active but have not logged a meal for 10 days, or have never logged one. It is a gentle signal to check in, not a judgement.',
    },
    {
      title: 'See where your AI credits went',
      steps: [
        'Click the `AI credits` tile.',
        'The panel shows your credits used this month and when they reset (the 1st of each month).',
        '**What it was used for** lists each AI feature (Plate Vision photo analysis, Estimate with AI, AI meal plan drafts…) with its count.',
        '**Who used it** lists each person: clients, team members, or "Automatic (NUSI)" for jobs NUSI runs on its own.',
        '**Recent activity** shows the latest 30 AI actions with the time.',
      ],
      note: [
        'Each AI action uses one credit. If an AI action fails, it is marked **"Failed · not charged"** and does not use a credit.',
        'The bar turns amber at 75% and red when the allowance is used up. You can buy extra credits from Billing → Top-ups.',
      ],
    },
    {
      title: 'See what is using your storage',
      steps: [
        'Click the `Storage` tile.',
        '**Who it belongs to** shows the space used for each client, team member and the practice itself.',
        '**What kind of files** shows the split between meal photos, progress photos, profile photos, shared files and documents.',
      ],
    },
    {
      title: 'Needs attention',
      text: 'The **Priority · Needs attention** panel lists up to 6 clients who need a nudge, with their program and when they were last active. Click a client to open their profile, or `Review all` to see every at-risk client. When nobody needs attention you will see **"Everyone\'s on track"**.',
    },
    {
      title: 'Upcoming sessions',
      text: 'The **Schedule · Upcoming sessions** panel shows your next 5 appointments. Click one to open it, or `Calendar` to go to Appointments.',
    },
    {
      title: 'Plan allowances at a glance',
      table: [
        ['Plan', 'Clients', 'AI credits / month', 'Storage', 'Video calls / month'],
        ['Free trial', '50', '500', '1 GB', '5 hours'],
        ['Starter', '100', '500', '5 GB', 'Not included'],
        ['Growth', '500', '5,000', '50 GB', '30 hours'],
        ['Scale Pro', 'Unlimited', '25,000', '200 GB', '100 hours'],
      ],
      tip: 'Extra AI credits can be bought any time from Billing → Top-ups, without changing your plan.',
    },
  ],
};
