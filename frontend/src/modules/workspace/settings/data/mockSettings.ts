import type { Integration, SectionDef, Session } from '../types';

const min = 1000 * 60;
const hr = min * 60;
const day = hr * 24;
const now = Date.now();
const iso = (offset: number) => new Date(now - offset).toISOString();

export const SECTIONS: SectionDef[] = [
  { key: 'general',       label: 'General',       description: 'Practice identity + locale' },
  { key: 'branding',      label: 'Branding',      description: 'Colors + white-label' },
  { key: 'verification',  label: 'Verification',  description: 'Credentials + get verified' },
  { key: 'integrations',  label: 'Integrations',  description: 'WhatsApp, Razorpay, AI keys' },
  { key: 'security',      label: 'Security',      description: 'Password, 2FA, sessions' },
  { key: 'data',          label: 'Data & privacy', description: 'Export, retention, deletion' },
];

export const INTEGRATIONS: Integration[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Send client invites, automated messages, and bulk announcements via Evolution API.',
    status: 'connected',
    meta: '+91 98 21 ••• 90 · Verified Apr 2026',
    accent: 'sage',
  },
  {
    key: 'razorpay',
    name: 'Razorpay',
    description: 'Process subscriptions, recurring billing, refunds. GST-aware invoices.',
    status: 'connected',
    meta: 'Linked account: acct_NkH8a... · Last webhook 2h ago',
    accent: 'indigo',
  },
  {
    key: 'calendar',
    name: 'Google Calendar',
    description: 'Two-way sync for appointments. Clients see available slots in real time.',
    status: 'connected',
    meta: 'sharma.dr@gmail.com · Synced 4 min ago',
    accent: 'sand',
  },
  {
    key: 'openai',
    name: 'OpenAI (GPT-4o)',
    description: 'Powers Plate Vision, smart message replies, and program drafting.',
    status: 'connected',
    meta: 'Org-managed key · 12.4k tokens / day avg',
    accent: 'indigo',
  },
  {
    key: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Fallback for empathetic + long-context tasks (coaching summaries, reflections).',
    status: 'disconnected',
    accent: 'coral',
  },
];

export const SESSIONS: Session[] = [
  {
    id: 's_current',
    device: 'MacBook Pro 14"',
    browser: 'Chrome 130 on macOS',
    location: 'Bengaluru, IN',
    lastActiveAt: iso(0),
    current: true,
  },
  {
    id: 's_phone',
    device: 'iPhone 15',
    browser: 'Safari 17 on iOS',
    location: 'Bengaluru, IN',
    lastActiveAt: iso(3 * hr),
    current: false,
  },
  {
    id: 's_clinic',
    device: 'Clinic iPad',
    browser: 'Safari 17 on iPadOS',
    location: 'Bengaluru, IN · Clinic Wi-Fi',
    lastActiveAt: iso(2 * day),
    current: false,
  },
];

export const BRAND_PALETTES: { id: string; name: string; primary: string; accent: string }[] = [
  { id: 'default',  name: 'NUSI default',  primary: '#7DBE9D', accent: '#8087FF' },
  { id: 'rose',     name: 'Warm rose',      primary: '#F87171', accent: '#FBBF24' },
  { id: 'amethyst', name: 'Amethyst',       primary: '#A78BFA', accent: '#E5C58C' },
  { id: 'ocean',    name: 'Deep ocean',     primary: '#5EEAD4', accent: '#60A5FA' },
];
