import type { ActivityItem, Channel, EventDef, QuietHours } from '../types';

const min = 1000 * 60;
const hr = min * 60;
const day = hr * 24;
const now = Date.now();
const iso = (offset: number) => new Date(now - offset).toISOString();

export const CHANNELS: Channel[] = [
  {
    key: 'push',
    label: 'Browser push',
    description: 'Real-time pings while SIRAH LIFE is open.',
    status: 'unconfigured',
    enabled: false,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Urgent client signals via Evolution API.',
    status: 'connected',
    meta: '+91 98 21 ••• 90',
    enabled: true,
  },
  {
    key: 'inapp',
    label: 'In-app',
    description: 'The bell icon and toasts inside SIRAH LIFE.',
    status: 'connected',
    meta: 'Always on',
    enabled: true,
  },
];

export const EVENT_DEFS: EventDef[] = [
  // ─── Client events ─────────────────────────────────────────────────
  {
    key: 'new_client_message',
    label: 'New client message',
    description: 'A client sends a 1:1 message in the messaging surface.',
    category: 'client',
    channels: { email: false, push: true,  whatsapp: false, inapp: true },
  },
  {
    key: 'urgent_client_silent',
    label: 'Client gone silent (3+ days)',
    description: "Client hasn't logged or messaged for 3 days - at-risk signal.",
    category: 'client',
    channels: { email: true,  push: true,  whatsapp: true,  inapp: true },
  },
  {
    key: 'meal_photo_review',
    label: 'Meal photo needs review',
    description: 'A client uploaded a Plate Vision result expecting your input.',
    category: 'client',
    channels: { email: false, push: true,  whatsapp: false, inapp: true },
  },
  {
    key: 'assessment_submitted',
    label: 'Assessment submitted',
    description: 'A client completed a weekly or comprehensive assessment.',
    category: 'client',
    channels: { email: true,  push: false, whatsapp: false, inapp: true },
  },
  {
    key: 'community_mention',
    label: 'Community mention or reply',
    description: 'Someone @mentions you or replies on your community post.',
    category: 'client',
    channels: { email: false, push: true,  whatsapp: false, inapp: true },
  },

  // ─── Billing events ────────────────────────────────────────────────
  {
    key: 'failed_payment',
    label: 'Failed payment',
    description: 'Razorpay reports a charge failed for your subscription or a client.',
    category: 'billing',
    channels: { email: true,  push: true,  whatsapp: true,  inapp: true },
  },
  {
    key: 'subscription_renewal',
    label: 'Subscription renewed',
    description: 'A successful renewal charge from Razorpay. Invoice attached.',
    category: 'billing',
    channels: { email: true,  push: false, whatsapp: false, inapp: true },
  },
  {
    key: 'trial_ending',
    label: 'Trial ending in 7 days',
    description: 'Free-trial countdown nudges to add a payment method.',
    category: 'billing',
    channels: { email: true,  push: false, whatsapp: false, inapp: true },
  },

  // ─── Team + System ─────────────────────────────────────────────────
  {
    key: 'team_activity',
    label: 'Team activity',
    description: 'A coach or manager creates a program, sends a bulk message, etc.',
    category: 'team',
    channels: { email: false, push: false, whatsapp: false, inapp: true },
  },
  {
    key: 'weekly_report',
    label: 'Weekly workspace digest',
    description: 'Every Monday morning - wins, risks, and a single AI recommendation.',
    category: 'system',
    channels: { email: true,  push: false, whatsapp: false, inapp: false },
  },
];

export const QUIET_HOURS_DEFAULT: QuietHours = {
  enabled: true,
  startHour: 22,        // 10 PM
  endHour: 7,           // 7 AM
  days: [0, 1, 2, 3, 4, 5, 6],
};

export const ACTIVITY: ActivityItem[] = [
  {
    id: 'n1',
    title: 'Priya sent a meal photo',
    detail: 'Plate Vision estimated 540 kcal - awaiting your review.',
    channels: ['push', 'inapp'],
    category: 'client',
    sentAt: iso(3 * min),
  },
  {
    id: 'n2',
    title: 'Karan hit a milestone',
    detail: '80 kg × 5 deadlift PR - community celebrated 22 ✕.',
    channels: ['inapp'],
    category: 'client',
    sentAt: iso(42 * min),
  },
  {
    id: 'n3',
    title: 'Tanvi has been silent for 5 days',
    detail: 'Adherence dropped to 38%. Suggested check-in draft ready.',
    channels: ['email', 'push', 'whatsapp', 'inapp'],
    category: 'client',
    sentAt: iso(4 * hr),
  },
  {
    id: 'n4',
    title: 'Subscription renewed',
    detail: 'Razorpay charged ₹1,999. Invoice SIRAH-2026-000004 emailed.',
    channels: ['email', 'inapp'],
    category: 'billing',
    sentAt: iso(1 * day),
  },
  {
    id: 'n5',
    title: 'Trial ending in 28 days',
    detail: 'Add a payment method any time before March 14 to avoid interruption.',
    channels: ['email', 'inapp'],
    category: 'billing',
    sentAt: iso(2 * day),
  },
  {
    id: 'n6',
    title: 'Aditya created a new program',
    detail: '"Endurance Builder 8-week" template - currently a draft.',
    channels: ['inapp'],
    category: 'team',
    sentAt: iso(3 * day),
  },
];
