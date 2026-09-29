import type { SectionDef } from '../types';

/** The Settings page's sections, in side-nav order. */
export const SECTIONS: SectionDef[] = [
  { key: 'general',       label: 'General',       description: 'Practice identity + locale' },
  { key: 'branding',      label: 'Branding',      description: 'Colors + white-label' },
  { key: 'public',        label: 'Public page',   description: 'Link-in-bio for prospects' },
  { key: 'verification',  label: 'Verification',  description: 'Credentials + get verified' },
  { key: 'integrations',  label: 'Integrations',  description: 'WhatsApp, Razorpay, API keys' },
  { key: 'ai',            label: 'AI',            description: 'Your Gemini or OpenAI key' },
  { key: 'security',      label: 'Security',      description: 'Password, 2FA, sessions' },
  { key: 'data',          label: 'Data & privacy', description: 'Export, retention, deletion' },
];

/** Preset colour pairs offered in Settings -> Branding. */
export const BRAND_PALETTES: { id: string; name: string; primary: string; accent: string }[] = [
  { id: 'default',  name: 'NUSI default',  primary: '#7DBE9D', accent: '#8087FF' },
  { id: 'rose',     name: 'Warm rose',      primary: '#F87171', accent: '#FBBF24' },
  { id: 'amethyst', name: 'Amethyst',       primary: '#A78BFA', accent: '#E5C58C' },
  { id: 'ocean',    name: 'Deep ocean',     primary: '#5EEAD4', accent: '#60A5FA' },
];
