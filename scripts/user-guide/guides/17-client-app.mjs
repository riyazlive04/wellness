export default {
  no: 17,
  slug: 'client-app',
  title: 'What your clients see (the NUSI app)',
  tagline: 'How clients join your practice, log their meals with a photo, follow their plan, answer forms, book sessions and chat with you.',
  where: 'The NUSI app on the client\'s phone (or the client portal on nusi.in)',
  intro: [
    'Knowing the client side helps you guide new clients. Everything they do arrives in your NUSI account straight away.',
  ],
  sections: [
    {
      title: 'Joining your practice',
      steps: [
        'You send them your join link (Clients → `Share join link`), or create their login yourself (Clients → `Add client`).',
        'With the link: they open it, enter **Your name**, **Email** and a **Password**, and tap `Create account & request`. If they already have an account they tap `Request to join`.',
        'They wait on a "pending" screen until you approve them (unless you imported their email, in which case they join straight away).',
        'In the app they can also paste the invite link.',
      ],
    },
    {
      title: 'First-time setup',
      text: 'The client answers a few questions: age and gender, height and weight, their goals ("What\'s driving you?"), activity level, and health notes (allergies, medical conditions, food preferences). Then `Finish & enter portal`. These answers fill the **Profile & health** card on their profile in your account.',
    },
    {
      title: 'The app\'s main tabs',
      bullets: [
        '**Today:** their day at a glance.',
        '**Meals:** log meals with `Snap` (photo with AI), `Scan` (packaged food barcode) or `Plan` (today\'s meals from your plan).',
        '**Assistant:** the AI nutrition assistant (Growth and Scale Pro, if you turned it on).',
        '**Progress:** weight, measurements and trends.',
        '**Chat:** messages with you.',
        '**More:** habits, journal, meal plan, goals, programs, assessments, recipes, measurements, progress photos, files, appointments, community, settings and more.',
      ],
    },
    {
      title: 'Logging a meal with a photo (Plate Vision)',
      steps: [
        'Tap `Snap`, then `Use camera` or `Upload photo`.',
        'Optionally add hints: portion size, something for scale, or a note.',
        'Tap `Analyze with NUSI`. The foods and nutrients appear.',
        'If something is wrong, tap `Not quite right?`, correct it and tap `Redo with this`.',
        'Choose the meal time and tap `Log this meal`.',
      ],
      note: 'The meal and photo arrive in your account marked as a photo estimate. Each analysis uses one of your practice\'s AI credits.',
    },
    {
      title: 'Meal plan, programs and habits',
      bullets: [
        '**Meal plan:** shows the week you published. Until you publish one, it says "No meal plan yet".',
        '**Programs:** the tasks of their program to tick off each day; this drives the progress you see.',
        '**Habits:** they create habits (e.g. "Drink 2L water") and tick them off daily.',
      ],
    },
    {
      title: 'Assessments',
      text: 'When you send a form, it appears in their app. They tap `Start`, answer and submit. After you review it, they see **"Reviewed by your nutritionist"** with your note.',
    },
    {
      title: 'Appointments (Growth and Scale Pro)',
      steps: [
        'They tap `Book a session`, choose the **Type** (Consultation, Follow-up, Quick check-in, Assessment, Group session), the **Mode** (Video, Phone, In person), the time and a note.',
        'They tap `Send request`. It shows "Awaiting confirmation" until you approve it.',
        'At the time of a video session, `Join video` appears. `Withdraw` cancels a request.',
      ],
    },
    {
      title: 'Their settings',
      text: 'Clients can update their profile, goals and health details, and change their password (with their current password, or with a reset link by email).',
    },
  ],
};
