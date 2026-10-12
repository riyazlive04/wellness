export default {
  no: 7,
  slug: 'assessments',
  section: 'Assessments',
  color: '#14b8a6',
  title: 'Assessments',
  tagline: 'Build questionnaires or use ready-made templates, send them to clients, and review their answers in one inbox.',
  where: '`Assessments` in the left menu (under Clients)',
  intro: [
    'Assessments are forms your clients fill in from their app: intake forms, diet recalls, food diaries, follow-ups, lab results and more. Answers come back to you for review, and your client sees your review note.',
    'The number next to `Assessments` in the menu shows how many answered forms are waiting for your review.',
  ],
  sections: [
    {
      title: 'The Assessment forms page',
      bullets: [
        '**Client answers:** your inbox of forms clients have sent back.',
        '**Ready-made templates:** forms you can copy and use straight away.',
        '**Your forms:** the forms you have built or copied, as drafts or published.',
        '`New form` (top right) starts a blank form.',
      ],
    },
    {
      title: 'Use a ready-made template',
      table: [
        ['Template', 'Type', 'Time to fill'],
        ['General Nutritional Assessment', 'Intake', 'about 20 min'],
        ['Quick Intake', 'Intake', 'about 3 min'],
        ['24-Hour Diet Recall', 'Diet tracking', 'about 10 min'],
        ['3-Day Food Diary', 'Diet tracking', 'over 3 days'],
        ['Follow-up Review', 'Follow-up', 'about 2 min'],
        ['Lab Results', 'Clinical', 'about 6 min'],
        ['Food Preferences & Restrictions', 'Intake', 'about 6 min'],
      ],
      steps: [
        'Filter by type with the chips (`All`, `Intake`, `Diet tracking`, `Follow-up`, `Clinical`).',
        'Click `Preview` to see every question, or `Use template` to copy it.',
        'The copy appears in **Your forms** as a **Draft**. Check it, change anything you like, then click `Publish`.',
      ],
      tip: 'Once added, the card shows **Added**. `Add again` makes a second copy (it asks first).',
    },
    {
      title: 'Build your own form',
      steps: [
        'Click `New form` (or the **Blank form** tile).',
        'Give it a **name** and, if you like, a short intro for the client.',
        'Add questions. Choose a type for each: Short text, Number, Rating scale (1 to 2–10), Yes / No, Multiple choice, Checkboxes, or Table / grid (up to 40 rows × 6 columns). Use **Section header** to split the form into parts.',
        'For each question you can tick **Required**, choose its width (¼ to Full), move it up or down, or remove it.',
        'Check the live preview on the right.',
        'Click `Save as draft`, or `Publish` when it is ready to send.',
      ],
      note: 'Only published forms can be sent. Drafts show a `Publish` button instead of `Send`.',
    },
    {
      title: 'Send a form to clients',
      steps: [
        'In **Your forms**, click `Send` next to a published form.',
        'Search for clients by name or email, or click `Select all`.',
        'Click `Send to N`. The form appears in each client\'s app.',
      ],
      text: 'You can also send from a client\'s profile: open the **Assessments** tab and use **Assign an assessment**. It also has three built-in checks: **Health** (12 questions), **Stress** (PSS-10, 10 questions) and **Sleep** (11 questions).',
      note: 'A client who already has the form won\'t get a second copy.',
    },
    {
      title: 'The Client answers inbox',
      bullets: [
        '**To review:** forms clients have answered and sent back. Click `Review`.',
        '**Not answered yet:** forms sent but not filled in. Click `Remind` to open a chat with that client.',
        '**Reviewed:** forms you have already reviewed. Click `View` to look again.',
      ],
      text: 'Each list shows up to 8 forms at a time, with "and N more" below.',
    },
    {
      title: 'Review a client\'s answers',
      steps: [
        'Click `Review`. The client\'s page opens with their answers.',
        'Read the answers and the score.',
        'Write a **Review note** (up to 2,000 characters). Your client will see it.',
        'Click `Mark as reviewed`. The client sees **"Reviewed by your nutritionist"** with your note.',
      ],
      tip: 'You can change a note later with `Update review`.',
    },
    {
      title: 'How the score works',
      table: [
        ['Score', 'Band'],
        ['80 and above', 'Excellent'],
        ['60 – 79', 'On track'],
        ['40 – 59', 'Needs attention'],
        ['Under 40', 'At risk'],
      ],
      bullets: [
        'Only **Rating scale** and **Yes / No** answers are scored. Each rating is turned into 0–100, Yes counts as 100 and No as 0, and the average is the score.',
        'Text, number and choice answers are not scored; read them yourself.',
      ],
      note: 'The score treats a higher answer as better on every question. On questions where a higher answer is worse (such as stress level or daytime sleepiness), read the answer itself rather than relying on the score.',
    },
  ],
};
