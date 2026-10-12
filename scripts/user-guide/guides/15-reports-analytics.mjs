export default {
  no: 15,
  slug: 'reports-analytics',
  section: 'Reports & Analytics',
  color: '#0d9488',
  title: 'Reports & Analytics',
  tagline: 'Create polished PDF reports for a client, a program or your whole practice, and see how your practice is growing.',
  where: '`Reports` and `Analytics` in the left menu',
  sections: [
    {
      title: 'Reports: what you can create',
      table: [
        ['Report', 'For', 'What it contains'],
        ['**Client Health Report**', 'One client', 'Profile, program and goals, compliance and assessment scores, meal patterns and nutrients. Good for sharing with the client or their doctor.'],
        ['**Client Monthly Summary**', 'One client', 'A one-page monthly recap: wins, adherence and streaks.'],
        ['**Program Performance**', 'One program', 'Enrolment and drop-off, average adherence and completion, common sticking points.'],
        ['**Workspace Digest**', 'Your practice', 'The last 30 days across your whole practice.'],
      ],
    },
    {
      title: 'Create a report',
      steps: [
        'Open `Reports`.',
        'On a template card, click `Generate`.',
        'Choose the client or program if asked.',
        'The PDF downloads, branded with your logo, and is added to your report history.',
      ],
      bullets: [
        '**History** lists every report you made, with filters `All`, `Ready` and `In progress`.',
        'Downloading again rebuilds the PDF with the latest data. Reports you no longer need can be deleted.',
      ],
      note: 'The Billing & GST report, scheduled reports and custom reports are coming soon.',
    },
    {
      title: 'Analytics (Growth and Scale Pro)',
      text: 'Open `Analytics` to see **Practice intelligence**:',
      bullets: [
        '**Clients, Active (7 days), Programs** and your plan\'s monthly cost.',
        '**Client growth** and **Daily active clients** over 30 days.',
        '**Client engagement:** engaged versus dormant clients this week.',
        '**AI usage** over 14 days and **Program performance**.',
        '**Operations:** appointments upcoming, completed and cancelled; assessments sent, submitted and waiting for review.',
        '**At-risk clients:** no meal logged in 10 days or more.',
      ],
      tip: '`Export report` downloads the analytics as a PDF. Revenue analytics (trend and plan breakdown) is part of Scale Pro.',
    },
  ],
};
