// The onboarding tour, as data — edit freely. Each step navigates to a client
// route, shows a caption, and optionally gently scrolls the page. Routes are the
// real client-portal paths (see frontend/src/App.tsx).

export const intro = 'Welcome to SIRAH LIFE — your practice, in your pocket';
export const outro = "That's it — everything your coach set up, in one calm app.";

export const steps = [
  { goto: '/portal',              caption: 'Your Home — today at a glance',                          wait: 3500, scroll: true },
  { goto: '/portal/meals',        caption: 'Log meals in seconds — scan a barcode or snap a photo',   wait: 3500, scroll: true },
  { goto: '/portal/plate-vision', caption: 'Plate Vision reads your plate and estimates the macros',  wait: 3200 },
  { goto: '/portal/programs',     caption: 'Follow the program your nutritionist built for you',      wait: 3200, scroll: true },
  { goto: '/portal/appointments', caption: 'Request a session — your nutritionist confirms it',        wait: 3200, scroll: true },
  { goto: '/portal/chat',         caption: 'Message your coach any time — text, voice notes or photos', wait: 3200 },
  { goto: '/portal/journal',      caption: 'Reflect in your journal, with gentle AI insights',        wait: 3200 },
  { goto: '/portal/progress',     caption: 'Watch your progress add up, week over week',              wait: 3500, scroll: true },
];
