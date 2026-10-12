export type SectionKey = 'general' | 'branding' | 'public' | 'verification' | 'integrations' | 'ai' | 'video' | 'security' | 'data';

export interface SectionDef {
  key: SectionKey;
  label: string;
  description: string;
}
