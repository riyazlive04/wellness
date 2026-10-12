export default {
  no: 4,
  slug: 'client-profile',
  title: 'A client\'s profile',
  tagline: 'Everything about one client in one place: health profile, meals, measurements, labs, assessments, files, private notes and their complete record as a PDF.',
  where: '`Clients` → select a client → `Open`',
  intro: [
    'Open a client\'s profile from the Clients page (`Open` on their summary, or tap them on a phone), or from the Needs attention list on your dashboard.',
  ],
  sections: [
    {
      title: 'The top of the profile',
      bullets: [
        'Quick facts: **Program**, **Target** (calories), **Last weight**, **Last active**.',
        '`Wellness` opens a detailed view of their meals, habits, body, cycle and nutrition audit.',
        '`Message` opens Messaging. `Download record` creates their complete record as a PDF.',
        '**Assigned coach** (owners and nutritionists only): choose which coach looks after this client, or "Unassigned (whole team)".',
      ],
      tip: 'Tabs show a green number when there is something new, for example an assessment waiting for your review.',
    },
    {
      title: 'Overview tab',
      bullets: [
        '**Profile & health:** age, gender, height, main goal, activity level, allergies, medical conditions and food preferences, as the client entered them.',
        '**Nutrition (last 14 days):** average calories and protein per day, and meals logged.',
        '**Daily habits:** latest water, sleep and exercise.',
        '**Weight trend:** a chart of the last 90 days (needs at least two weigh-ins).',
        '**Client\'s goals:** goals the client set for themselves.',
      ],
      note: 'This tab is read-only. The client keeps their profile up to date from their app.',
    },
    {
      title: 'Meal plan tab',
      text: 'Build and publish this client\'s weekly meal plan. See the separate guide **"Meal plans"** for every step.',
    },
    {
      title: 'Meals tab',
      text: 'Shows the meals the client logged in the last 30 days. Click any meal to open **Meal details**:',
      bullets: [
        'The full photo, meal time, date and time, calories and quantity.',
        'Protein, carbs, fat and fibre, with their share of calories.',
        '**On the plate:** each food detected in the photo, with its nutrients.',
        '**Plate insight:** a short AI summary and suggestions. **Client\'s note** if they added one.',
        '**More nutrients:** vitamins and minerals, plus how the meal was logged and the AI\'s confidence.',
      ],
    },
    {
      title: 'Measurements tab',
      text: 'Body measurements in inches (chest, waist, hip, arm, thigh), with the change since the previous entry. The client adds these from their app.',
    },
    {
      title: 'Labs tab',
      steps: [
        'Click `Add result` and enter the **Marker** (e.g. HbA1c), **Result**, **Test date**, and optionally the normal range and the lab.',
        'Or click `Import from report` to copy values from a "Lab Results" form the client filled in, then `Import N value(s)`.',
        'Turn on **Show only markers outside range** to focus on what needs attention.',
      ],
      tip: 'Each result can be edited or deleted. Values that could not be read during import are kept as text so you can correct them.',
    },
    {
      title: 'Assessments tab',
      steps: [
        'Under **Assign an assessment**, click `Health`, `Stress` or `Sleep`, or one of **Your custom forms**.',
        'The client fills it in from their app. Its status shows **Awaiting**, then **Completed**.',
        'Click `Review` to read every answer and the score (out of 100, with a band such as "Good").',
        'Write a **Review note** (the client sees it) and click `Mark as reviewed`.',
      ],
      tip: 'To build your own forms or use ready-made templates, click `Build & manage`. See the **Assessments** guide.',
    },
    {
      title: 'Files tab',
      bullets: [
        '`Share a file` (up to 25 MB): the file appears in the client\'s app, marked "Shared".',
        'Files the client uploads are tagged **From client** and marked **New** for 3 days.',
        'Every file can be downloaded or deleted.',
      ],
    },
    {
      title: 'Notes tab',
      text: '**Private notes** for your team only. They are never shown to the client. Click `Add note`; hover over a note to edit or delete it.',
    },
    {
      title: 'AI chats tab',
      text: 'Read the client\'s conversations with their AI assistant (read-only). If the assistant is turned off, a link takes you to **Settings → AI**.',
    },
    {
      title: 'Download the complete record (PDF)',
      steps: [
        'Click `Download record` at the top of the profile (or the download icon on the Clients page).',
        'Wait a few seconds while it says "Preparing PDF…". The file downloads automatically.',
      ],
      bullets: [
        'Includes profile, goals, weight and habits (12 months), measurements, every assessment answer, meal plans, meal log (12 months), cycle entries, appointments, private notes, messages and the list of files.',
        'Photos and file contents are not inside the PDF; download files from the Files tab.',
        'To download every client at once as a ZIP, use **Settings → Data & privacy**.',
      ],
      note: 'The record contains private health information. Store and share it carefully.',
    },
  ],
};
