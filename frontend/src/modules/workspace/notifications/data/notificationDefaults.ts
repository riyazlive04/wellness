import type { Channel, EventDef, QuietHours } from '../types';

export const CHANNELS: Channel[] = [
  {
    key: 'push',
    label: 'Browser push',
    description: 'Real-time pings while NUSI is open.',
    status: 'unconfigured',
    enabled: false,
  },
  {
    key: 'whatsapp',
    // Starts unconfigured and is replaced by the real connection on load.
    // It used to be hardcoded 'connected' with a made-up number, so every
    // practice was told WhatsApp was live - including the ones whose link
    // was never finished, whose ticks in the events table then sent nothing.
    label: 'WhatsApp',
    description: 'Urgent client signals via Evolution API.',
    status: 'unconfigured',
    enabled: false,
  },
  {
    key: 'inapp',
    label: 'In-app',
    description: 'The bell icon and toasts inside NUSI.',
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

