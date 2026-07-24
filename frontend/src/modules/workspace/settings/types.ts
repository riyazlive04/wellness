export type IntegrationKey = 'whatsapp' | 'razorpay' | 'calendar' | 'openai' | 'anthropic';

export interface Integration {
  key: IntegrationKey;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  /** Optional sub-label e.g. account email or last-synced */
  meta?: string;
  /** Icon ramp color */
  accent: 'sage' | 'indigo' | 'sand' | 'coral';
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  lastActiveAt: string;
  current: boolean;
}

export type SectionKey = 'general' | 'branding' | 'public' | 'verification' | 'integrations' | 'security' | 'data';

export interface SectionDef {
  key: SectionKey;
  label: string;
  description: string;
}
