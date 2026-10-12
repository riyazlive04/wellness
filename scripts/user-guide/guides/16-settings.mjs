export default {
  no: 16,
  slug: 'settings',
  title: 'Settings',
  tagline: 'Your practice details, public page, verification, WhatsApp, AI, video calls, notifications, security and data, all in one place.',
  where: '`Settings` in the left menu',
  intro: [
    'Settings has a tab for each area along the top: General, Public page, Verification, Integrations, AI, Video calls, Notifications, Security and Data & privacy.',
  ],
  sections: [
    {
      title: 'General',
      bullets: [
        '**Logo:** `Upload photo` or `Change or remove`. It appears in the client app, on invoices and on every PDF.',
        '**Your name, Practice name, Contact email, Phone.**',
        '**Timezone:** used for your dashboard clock and dates.',
        '**Dashboard quote:** a personal line on your dashboard (leave empty for a rotating quote).',
        '**Language:** `English` or `தமிழ்` (Tamil). It changes straight away, just for you.',
      ],
      text: 'Click `Save changes` after editing. The panel on the right shows **What clients see**.',
    },
    {
      title: 'Public page',
      text: 'A simple public page for new clients (like a link in your Instagram bio), at **nusi.in/your-name**.',
      bullets: [
        '**Public URL slug:** the end of your link. **Publish page** turns it on or off.',
        '**Show "Join my practice":** adds a button that uses your join link.',
        '**Headline, Bio** and **Links** (your website, Instagram, YouTube…).',
      ],
    },
    {
      title: 'Verification',
      steps: [
        'Fill in **Professional details**: legal or business name, professional title, qualifications, registration or licence number and years of experience.',
        'Add **PAN** (and **GSTIN** if you have one).',
        'Upload **Supporting documents** (certificates, under 15 MB each).',
        'Click `Submit for verification`. The status shows **Under review**, then **Verified practitioner**, or **Needs attention** with what to fix.',
      ],
      tip: 'Verified practices get a badge on their public page, which helps new clients trust you.',
    },
    {
      title: 'Integrations: WhatsApp',
      steps: [
        'Click `Connect` next to WhatsApp. A QR code appears.',
        'On your practice phone, open **WhatsApp → ⋮ (or Settings) → Linked devices → Link a device**, and scan the QR code.',
        'Once connected, click `Send test` to check it works.',
        'Turn on **Send client reminders on WhatsApp** to send appointment and meal plan reminders from your own number.',
      ],
      note: 'Developer **API keys** (for connecting your own tools) are part of Scale Pro.',
    },
    {
      title: 'AI',
      bullets: [
        'AI comes with every plan: Plate Vision, voice notes, AI meal plan drafts, Estimate with AI and the client AI assistant. Each AI action uses one credit.',
        'When the month\'s credits run out, AI pauses until the 1st of next month, or until you buy more in Billing → Top-ups.',
        '**Your own key (optional):** `Connect your own AI key`, choose Google Gemini or OpenAI, paste the key, `Save & test key`. Credits still count.',
        '**Client AI assistant:** turn it on or off for your clients and set how many questions each client can ask per day.',
      ],
    },
    {
      title: 'Video calls',
      bullets: [
        'Shows the video hours used this month against your plan (trial 5 h, Growth 30 h, Scale Pro 100 h; Starter has none).',
        '**Use my own Daily.co:** paste your Daily.co API key and click `Save & test key`. Your calls then run on your own Daily.co account, which bills you directly, and do not use your plan\'s hours.',
      ],
    },
    {
      title: 'Notifications',
      text: '**Browser notifications on this device:** click `Turn on` to get notified about new clients, join requests, bookings, messages and answered assessments, even when NUSI is closed. Do this on each computer or phone you use.',
      note: 'If notifications are blocked, click the lock icon next to the address bar, allow Notifications, then reload the page.',
    },
    {
      title: 'Choosing what reaches you',
      text: 'Click the bell in the top bar to see recent notifications (`Mark all read` clears them). The **Notifications** page lets you decide, for each event, whether it comes as a browser push, on WhatsApp or in-app:',
      bullets: [
        'New client message, client gone silent (3+ days), meal photo needs review, assessment submitted, community mention or reply.',
        'Failed payment, subscription renewed, trial ending in 7 days, team activity, weekly workspace digest.',
        '**Quiet hours** (default 10 PM – 7 AM) hold push and WhatsApp notifications until morning. In-app notifications still appear, and urgent ones (client gone silent, failed payment) always come through.',
        '`Send test push` checks that notifications reach this device.',
      ],
    },
    {
      title: 'Security',
      bullets: [
        '**Change password:** enter your current password and the new one twice, then `Update password`. Or use `Reset via email`.',
        '**Active sessions:** see where you are signed in and `Sign out` any device you don\'t recognise.',
      ],
      note: 'Two-step sign-in (2FA) is not available yet. To close your practice and delete its data, contact NUSI support.',
    },
    {
      title: 'Data & privacy',
      bullets: [
        '**Storage:** how much space your practice uses.',
        '**Download client records (PDF):** `Download all` saves every client\'s complete record as a PDF, together in one ZIP file. Keep it as your own backup.',
        '**Export workspace data:** `Generate export` downloads all your practice data as a JSON file.',
        '**Retention policy:** how long client records, messages and backups are kept.',
        '**Client data requests:** record a client\'s request for a copy or deletion of their data (to be completed within 7 days).',
      ],
    },
  ],
};
