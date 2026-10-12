export default {
  no: 8,
  slug: 'appointments',
  section: 'Appointments',
  color: '#0891b2',
  title: 'Appointments & video calls',
  tagline: 'Set your booking hours, schedule sessions, approve client requests and hold video calls right inside NUSI.',
  where: '`Appointments` in the left menu (Growth and Scale Pro, and during the free trial)',
  intro: [
    'Appointments shows your week by the hour. Clients can request sessions from their app, and video sessions get a private video room automatically, so there is nothing else to set up.',
  ],
  sections: [
    {
      title: 'The Appointments page',
      bullets: [
        '**Mini calendar (left):** coloured dots show booked days. Today is circled. Click a day to jump to that week.',
        '**Appointment requests:** sessions clients have asked for, waiting for you.',
        '**Video calls:** the video hours used this month.',
        '**Week agenda (right):** your sessions day by day. Use `Previous week`, `This week` and `Next week`. On an empty day, click `+ Book`.',
      ],
    },
    {
      title: 'Set your booking hours',
      text: 'Click `Booking hours` (only the owner can change them):',
      bullets: [
        '**Let clients pick from open times:** clients choose from your free slots. When off, they can ask for any time and you approve each request.',
        '**Working days** and **Day starts / Day ends**, with an optional **Lunch break**.',
        '**Start times every** 15 min, 30 min or 1 hour.',
        '**Gap between sessions:** none, 10, 15 or 30 min.',
        '**Minimum notice:** from 1 hour to 1 day.',
        '**Clients can book up to** 1 week, 2 weeks or 30 days ahead.',
      ],
      tip: 'All times are Indian Standard Time. Click `Save hours` when done.',
    },
    {
      title: 'Schedule an appointment',
      steps: [
        'Click `New appointment` (or `+ Book` on a day).',
        'Choose the **Client** and **Type**.',
        'Choose the **Mode**: Video, Phone or In person. For Video, a private video room is created automatically.',
        'Pick **When** (it must be in the future) and the **Duration** (15–240 minutes).',
        'Add **Notes** if you like and click `Schedule appointment`.',
      ],
      table: [
        ['Type', 'Default length'],
        ['Consultation', '45 min'],
        ['Follow-up', '30 min'],
        ['Check-in', '15 min'],
        ['Assessment', '60 min'],
        ['Group session', '60 min'],
      ],
    },
    {
      title: 'Approve client requests',
      steps: [
        'Clients tap `Book a session` in their app and send a request.',
        'It appears under **Appointment requests** and in your agenda as **Request**.',
        'Click `Approve` to confirm it; the client is notified.',
        'Or click `Decline` and add a reason if you like; the client is told.',
      ],
    },
    {
      title: 'Manage an appointment',
      text: 'Click any appointment to open it.',
      bullets: [
        '**Status:** Pending approval, Scheduled, Completed, Cancelled, No-show or Declined.',
        '`Reschedule`, `Mark complete`, `No-show`, or cancel with an optional reason.',
        '**Private notes:** only your team sees these. Click `Save notes`.',
        '`View profile` or `Open chat` with the client.',
      ],
    },
    {
      title: 'Join a video call',
      steps: [
        'Open the appointment. `Join video` becomes active **10 minutes before** the start.',
        'It shows `Join - live` until 15 minutes after the planned end.',
        'Click `Copy link` if you need to share the room link.',
        'Your client joins from their app with `Join video`.',
      ],
      note: 'Phone and in-person appointments don\'t have a video room.',
    },
    {
      title: 'Video hours on your plan',
      table: [
        ['Plan', 'Video calls per month'],
        ['Free trial', '5 hours'],
        ['Starter', 'Not included'],
        ['Growth', '30 hours'],
        ['Scale Pro', '100 hours'],
      ],
      bullets: [
        'A call uses its full booked length the first time anyone opens it, and only once per appointment.',
        'The **Video calls** card shows hours used; the bar turns amber at 80%.',
        'When the hours are used up, new calls can\'t start until the 1st of next month (or you upgrade). Your client sees "Video calls aren\'t available for this appointment right now."',
      ],
      tip: 'Need more hours, or on Starter? Connect your own Daily.co account in **Settings → Video calls**. Those calls are billed by Daily.co and don\'t use your plan\'s hours.',
    },
  ],
};
