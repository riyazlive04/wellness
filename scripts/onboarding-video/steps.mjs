// The onboarding tour, as data — edit freely. Each step navigates to a route,
// shows a caption, and optionally gently scrolls. These are the real
// practitioner (nutritionist / owner) routes — see frontend/src/App.tsx.
//
// Want the CLIENT-portal tour instead? Swap these for /portal, /portal/meals,
// /portal/appointments, etc. (see git history / README).

export const intro = 'Welcome to SIRAH LIFE — run your whole practice in one place';
export const outro = "That's SIRAH LIFE — your entire practice, beautifully organised.";

export const steps = [
  { goto: '/dashboard',    caption: 'Your command center — today at a glance, and what needs you',    wait: 3800, scroll: true },
  { goto: '/clients',      caption: 'Every client in one roster — profiles, plans and progress',      wait: 3500, scroll: true },
  { goto: '/programs',     caption: 'Build nutrition programs from templates — assign in minutes',     wait: 3500, scroll: true },
  { goto: '/appointments', caption: 'Schedule consults and video sessions — clients can request too',  wait: 3500, scroll: true },
  { goto: '/messaging',    caption: 'Message clients, with AI-drafted replies and thread summaries',    wait: 3200 },
  { goto: '/analytics',    caption: 'Engagement, compliance and revenue — read at a glance',            wait: 3500, scroll: true },
  { goto: '/billing',      caption: 'Plans, GST invoices and payments — all handled',                   wait: 3200, scroll: true },
];
