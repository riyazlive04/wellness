export default {
  no: 5,
  slug: 'programs',
  title: 'Programs',
  tagline: 'Build a program once (for example "90-day Diabetes Reversal"), give it to many clients, and track how well each one follows it.',
  where: '`Programs` in the left menu',
  intro: [
    'A program is a reusable template made of tasks (walk 30 minutes, log breakfast, weekly check-in). When you assign it, each client gets their own copy and ticks off tasks in their app. NUSI calculates their progress automatically.',
  ],
  sections: [
    {
      title: 'The Programs page',
      bullets: [
        'Tiles at the top: **Templates**, **Active programs**, **Clients enrolled** and **Avg progress**.',
        'Filters: `All`, `Published`, `Draft`, `Archived`, and a search box.',
      ],
    },
    {
      title: 'Create a program',
      steps: [
        'Click `New program`.',
        'Enter the **Program name** and a **Description**.',
        'Add **Goals** (press Enter or a comma after each one).',
        'Choose an **Accent colour** and a **Category** (or add your own).',
        'Set the **Duration** in weeks or days (up to 104 weeks).',
        'Click `Create`. The program opens so you can add details and tasks.',
      ],
    },
    {
      title: 'Add tasks',
      steps: [
        'Open the `Tasks` tab.',
        'Type the task, for example "30-min walk".',
        'Choose the **type** (task, activity, nutrition, habit, check-in) and how often it repeats: **daily**, **weekly** or **once**.',
        'Optionally give it a **Phase** (for example "Detox" or "Booster") to group tasks.',
        'Click `+`. Repeat for every task.',
      ],
      note: 'Tasks cannot be edited after adding; delete it and add it again with the change.',
    },
    {
      title: 'Fill in the program details',
      text: 'The `Details` tab has sections for Basics (tagline, cover image, difficulty), Overview, Audience, Eligibility, Outcomes, Roadmap (phases), Deliverables & Support, Internal notes and Publish. Click `Save changes` in the bar at the bottom when you are done.',
      bullets: [
        '**Visible to clients:** show the program in your clients\' app.',
        '**Allow enrollment:** let clients join it themselves.',
        '**Maximum enrollments:** an optional limit on how many can join.',
        '**Featured program:** highlight it for clients.',
      ],
    },
    {
      title: 'Publish the program',
      text: 'Click `Publish` once the program has at least one task. Published programs can be assigned and, if allowed, joined by clients. `Archive` takes a program out of use without deleting its history.',
    },
    {
      title: 'Assign it to one or many clients',
      steps: [
        'On the program, click `Assign`.',
        'Search and tick one or several clients.',
        'Click `Assign`.',
      ],
      bullets: [
        'Clients already on this program are greyed out and marked **Assigned**, so nobody is added twice.',
        'Each client starts today and finishes after the program\'s duration.',
        'See everyone on the program in the `Clients` tab, with their progress. The remove icon takes a client off (they can be assigned again later).',
      ],
    },
    {
      title: 'Editing a program clients are already on',
      bullets: [
        '**Adding or removing tasks** on the template updates every client currently on it automatically. Tasks they already completed keep their history.',
        '`Re-sync now` forces the update immediately.',
        '**Changing details** (name, duration, description) does not change clients who are already enrolled.',
      ],
      note: 'If you delete a task and add a changed version, clients lose the history of the deleted one.',
    },
    {
      title: 'How progress is calculated',
      text: 'Progress = tasks completed ÷ tasks that were due since the client started.',
      bullets: [
        'A **daily** task is due once each day.',
        'A **weekly** task is due once each week.',
        'A **once** task is due on its date.',
        'A finished program shows 100%.',
      ],
    },
    {
      title: 'Program chat',
      text: 'The `Chat` tab is a group chat with everyone on the program. Use it for motivation, reminders and group announcements.',
      note: 'Clients on the program can see each other\'s messages in this chat. For private conversations use Messaging.',
    },
  ],
};
