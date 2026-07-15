import type { Template, Workflow } from '../types';

const hr = 1000 * 60 * 60;
const day = hr * 24;
const now = Date.now();
const iso = (offset: number) => new Date(now - offset).toISOString();

export const WORKFLOWS: Workflow[] = [
  {
    id: 'wf_silent',
    name: 'Silent client check-in',
    description: "When a client goes quiet for 3 days, SIRAH LIFE drafts a check-in for you to review and approve.",
    status: 'active',
    nodes: [
      { kind: 'trigger',   icon: 'silent',   label: 'Client silent 3 days', detail: 'No logs, no messages, no app opens' },
      { kind: 'condition', icon: 'calendar', label: 'No call this week',     detail: 'Skips if Appointments shows a session' },
      { kind: 'action',    icon: 'sparkles', label: 'AI drafts message',     detail: 'Tone matches client history' },
      { kind: 'action',    icon: 'bell',     label: 'Notify you',            detail: 'In-app + push' },
    ],
    runsThisMonth: 18,
    successRate: 96,
    lastRunAt: iso(2 * hr),
    timeSavedHours: 4.5,
  },
  {
    id: 'wf_plate_review',
    name: 'Meal photo review queue',
    description: "Routes uploaded meal photos straight to your review tray when SIRAH LIFE's confidence is low or the client is new.",
    status: 'active',
    nodes: [
      { kind: 'trigger',   icon: 'photo',    label: 'Plate Vision result',     detail: 'After client uploads + AI analyzes' },
      { kind: 'condition', icon: 'split',    label: 'Low confidence OR new client', detail: '<75% OR ≤14 days enrolled' },
      { kind: 'action',    icon: 'flag',     label: 'Add to review queue' },
      { kind: 'action',    icon: 'bell',     label: 'Push to you' },
    ],
    runsThisMonth: 47,
    successRate: 100,
    lastRunAt: iso(20 * 60 * 1000),
    timeSavedHours: 6.0,
  },
  {
    id: 'wf_weekly_digest',
    name: 'Weekly digest email',
    description: 'Every Monday at 7 AM, generate the workspace digest report and email it to you.',
    status: 'active',
    nodes: [
      { kind: 'trigger', icon: 'timer', label: 'Every Monday 07:00',     detail: 'Cron in your timezone' },
      { kind: 'action',  icon: 'sparkles', label: 'Generate digest PDF', detail: 'Same template as Reports' },
      { kind: 'action',  icon: 'mail',     label: 'Email to you' },
    ],
    runsThisMonth: 4,
    successRate: 100,
    lastRunAt: iso(2 * day),
    timeSavedHours: 1.0,
  },
  {
    id: 'wf_trial_ending',
    name: 'Trial ending nudge',
    description: "When a trial reaches day 23, gently remind the workspace owner if no payment method is on file.",
    status: 'active',
    nodes: [
      { kind: 'trigger',   icon: 'timer', label: 'Trial day 23' },
      { kind: 'condition', icon: 'card',  label: 'No payment method', detail: 'Razorpay vault empty' },
      { kind: 'action',    icon: 'mail',  label: 'Email reminder' },
      { kind: 'action',    icon: 'bell',  label: 'In-app banner',     detail: 'On every page until resolved' },
    ],
    runsThisMonth: 1,
    successRate: 100,
    timeSavedHours: 0.4,
  },
  {
    id: 'wf_pr_celebrate',
    name: 'PR celebration',
    description: "When a Muscle Gain client logs a personal record, draft a community post for one-tap approval.",
    status: 'draft',
    nodes: [
      { kind: 'trigger',   icon: 'milestone', label: 'Client logs PR' },
      { kind: 'condition', icon: 'split',     label: 'Muscle Gain program' },
      { kind: 'action',    icon: 'sparkles',  label: 'AI drafts community post', detail: 'With celebratory tone' },
      { kind: 'action',    icon: 'flag',      label: 'Queue for your approval' },
    ],
    runsThisMonth: 0,
    successRate: 0,
    timeSavedHours: 0,
  },
];

export const TEMPLATES: Template[] = [
  {
    id: 'tpl_birthday',
    name: 'Birthday wishes',
    description: 'On a client\'s birthday, send a warm WhatsApp + email + auto-create a small card.',
    accent: 'sand',
    estimatedRuns: '~12 / year',
    nodes: [
      { kind: 'trigger', icon: 'timer',    label: "Client's birthday" },
      { kind: 'action',  icon: 'whatsapp', label: 'WhatsApp greeting' },
      { kind: 'action',  icon: 'mail',     label: 'Email card' },
    ],
  },
  {
    id: 'tpl_onboarding',
    name: 'New client onboarding sequence',
    description: '5-step welcome series across the first 14 days. Each message adapts to log activity.',
    accent: 'sage',
    estimatedRuns: 'Per new client',
    nodes: [
      { kind: 'trigger',   icon: 'flag',     label: 'Client accepts invite' },
      { kind: 'action',    icon: 'message',  label: 'Day 1: Welcome' },
      { kind: 'action',    icon: 'sparkles', label: 'Day 3-14: Adaptive nudges' },
    ],
  },
  {
    id: 'tpl_failed_payment',
    name: 'Failed payment recovery',
    description: 'When a Razorpay charge fails, escalate across Day 3 / Day 7 / Day 14 channels.',
    accent: 'coral',
    estimatedRuns: '1-2 / month',
    nodes: [
      { kind: 'trigger', icon: 'card',     label: 'Razorpay charge failed' },
      { kind: 'action',  icon: 'mail',     label: 'Day 3 email' },
      { kind: 'action',  icon: 'whatsapp', label: 'Day 7 WhatsApp' },
      { kind: 'action',  icon: 'flag',     label: 'Day 14 restrict access' },
    ],
  },
  {
    id: 'tpl_review_request',
    name: 'Ask for a review',
    description: 'After a major milestone (6-week mark or program completion), ask the client for a review.',
    accent: 'indigo',
    estimatedRuns: 'Monthly',
    nodes: [
      { kind: 'trigger',   icon: 'milestone', label: 'Client hits week 6' },
      { kind: 'condition', icon: 'split',     label: 'Adherence ≥ 70%' },
      { kind: 'action',    icon: 'message',   label: 'Ask for a review' },
    ],
  },
];
