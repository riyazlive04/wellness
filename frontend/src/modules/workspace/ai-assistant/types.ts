export type MessageRole = 'user' | 'assistant';

export type ToneKey = 'sage' | 'amber' | 'rose' | 'indigo' | 'neutral';

export interface Stat {
  label: string;
  value: string;
  delta?: string;
  tone?: ToneKey;
}

export interface ListItem {
  title: string;
  subtitle: string;
  tone?: ToneKey;
  /** Optional small chip */
  badge?: string;
  /** Optional link target (path) */
  href?: string;
}

export interface WeekTheme {
  week: number;
  theme: string;
  highlights: string[];
}

export interface CTA {
  label: string;
  intent: 'open_client' | 'open_program' | 'create_program' | 'open_messaging' | 'save_template' | 'view_full';
  target?: string;          // path / id
}

export type AIBlock =
  | { kind: 'snapshot'; title: string; subtitle?: string; stats: Stat[]; cta?: CTA }
  | { kind: 'list'; title: string; items: ListItem[]; cta?: CTA }
  | { kind: 'program'; name: string; duration: string; specialization: string; goals: string[]; weeks: WeekTheme[]; cta?: CTA }
  | { kind: 'recommendation'; headline: string; body: string; cta?: CTA };

export interface Message {
  id: string;
  role: MessageRole;
  /** Free text — for user always, for assistant the lead-in paragraph */
  text?: string;
  /** Structured AI cards that appear after the lead-in text */
  blocks?: AIBlock[];
  /** Follow-up suggestions surfaced after this assistant message */
  suggestions?: string[];
  createdAt: string;
}

export interface PromptIntent {
  id: string;
  /** Phrases that match this intent (case-insensitive substring) */
  match: string[];
  /** Pre-canned suggestion text shown in the empty state */
  prompt: string;
  /** Short label for the suggested action tile */
  label: string;
  description: string;
  icon: 'user' | 'alert' | 'sparkles' | 'chart' | 'mic' | 'mail';
  /** The assistant's response when this intent is selected */
  response: Omit<Message, 'id' | 'role' | 'createdAt'>;
}
