export default {
  no: 3,
  slug: 'clients',
  title: 'Clients: adding and managing your roster',
  tagline: 'Add clients four different ways, approve people who join through your link, and check on anyone at a glance without leaving the list.',
  where: '`Clients` in the left menu',
  intro: [
    'The Clients page ("Your roster") is the list of everyone you coach. On a computer, the list is on the left and the selected client\'s summary is on the right. On a phone, tapping a client opens their full profile.',
  ],
  sections: [
    {
      title: 'Four ways to add clients',
      table: [
        ['Way', 'Best for', 'What happens'],
        ['`Add client`', 'Adding one person yourself', 'You create their login; they are active straight away'],
        ['`Share join link`', 'Letting people sign up themselves', 'They sign up and wait for your approval'],
        ['`Import`', 'Bringing an existing list (CSV)', 'Their emails are pre-approved for when they sign up'],
        ['Approvals', 'People who used your join link', 'You approve or decline each request'],
      ],
    },
    {
      title: 'Add a client yourself',
      steps: [
        'Click `Add client` at the top right.',
        'Enter the client\'s **Name** and **Email**. A **Temporary password** is created for you (click the refresh icon for a new one; at least 8 characters). **Phone** is optional.',
        'Click `Add client`.',
        'The **Client added** screen shows their email and password. Click `Copy all login details` and send them to the client (for example on WhatsApp), then click `Done`.',
      ],
      note: [
        'The password is shown only once, so copy it before closing.',
        'No email is sent automatically; you share the login details yourself. The client can change their password later in their app.',
        'Adding a client uses one client seat of your plan.',
      ],
    },
    {
      title: 'Share your join link',
      steps: [
        'Click `Share join link`.',
        'The first time, click `Generate join link`.',
        'Click `Copy` to copy it, or `Share on WhatsApp` to send it directly.',
        'Anyone who signs up through the link appears in your approval queue.',
      ],
      bullets: [
        'One link works for your whole practice. It expires after 30 days; the expiry date is shown under the link.',
        '`Rotate` creates a new link and stops the old one immediately (useful if the link was shared too widely).',
        '`Turn off` stops new sign-ups until you generate a link again.',
      ],
    },
    {
      title: 'Approve people who want to join',
      text: 'When someone signs up through your link, a panel **"N people want to join"** appears at the top of the Clients page. Each person has `Approve` and `Decline` buttons.',
      note: 'Approving uses a client seat. Declined people move to a **Declined** filter, which appears once you have declined someone.',
    },
    {
      title: 'Import a list of clients (CSV)',
      steps: [
        'Prepare a CSV file with the columns **name**, **email** and **phone**. Email is required.',
        'Click `Import`, then `Choose CSV file`.',
        'Check the preview, then click `Import N`.',
        'The result shows how many were imported and why any rows were skipped.',
      ],
      note: 'Importing does **not** create accounts. It pre-approves those emails: when the person signs up with your join link, they skip the approval step. Until then they show as **Pending** with the note "Imported from your list. They haven\'t signed up yet".',
    },
    {
      title: 'Find a client',
      bullets: [
        '**Search** by name, email or program.',
        '**Filters** with counts: `All`, `Active`, `At risk`, `Paused`, `Pending` (and `Declined` once used).',
        '**At risk** means active but no meal logged in 10 days.',
        '`Export` downloads the current list as a CSV file (name, email, phone, status, program, joined, last active).',
      ],
    },
    {
      title: 'The client summary panel',
      text: 'Click a client in the list (on a computer) to see their summary on the right without leaving the page:',
      bullets: [
        '**Header:** photo (a green dot means online now), status, email and phone, client since, last seen.',
        '**Buttons:** WhatsApp (if they have a phone number), `Message in NUSI`, download their complete record as a PDF, `Meal plan`, `Open` (full profile) and delete.',
        '**Meals logged:** the share of planned meals they logged in the last 7 days, and the change from the week before.',
        '**Program:** name and "Week X of Y". **Weight:** change since their first weigh-in. **Next session:** date and type, or `Book one`.',
        '**Last 14 days:** one bar per day, meals logged against the plan (green good, amber some, red few).',
        '**Today\'s meals:** each meal with its photo, time and calories. Click one to open it.',
      ],
      tip: 'The list stays in place while only the summary scrolls, so you can move quickly from one client to the next.',
    },
    {
      title: 'Delete a client',
      steps: [
        'Click the bin icon on the client\'s summary.',
        'Type the client\'s name to confirm, then click `Delete permanently`.',
      ],
      note: [
        'This permanently erases their meal logs, messages, assessments, photos, measurements, appointments and program history. It cannot be undone. Download their record first if you may need it.',
        'Only the practice owner can delete clients. An imported email that never signed up is removed instantly.',
      ],
    },
    {
      title: 'Who can do what',
      bullets: [
        '**Owner and nutritionists** can add, approve, import and manage clients.',
        '**Coaches** only see the clients assigned to them (set the "Assigned coach" on the client\'s profile).',
        'Your plan sets how many active clients you can have: 50 on the trial, 100 on Starter, 500 on Growth, unlimited on Scale Pro.',
      ],
    },
  ],
};
