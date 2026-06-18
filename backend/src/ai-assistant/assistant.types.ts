import type { AuthUser } from '../auth/types/auth-user.type';

/**
 * Module 6 — the three role-scoped assistants. Which one a caller gets is
 * derived from their identity, never chosen by the client:
 *   executive → super admin           (platform / business intelligence)
 *   clinical  → workspace owner/staff  (practice operations)
 *   wellness  → client                 (personal wellness companion)
 */
export type AssistantType = 'executive' | 'clinical' | 'wellness';

/** Memory partitions — must never cross a permission boundary. */
export type MemoryScope = 'business' | 'workspace' | 'personal';

/** Sentinel scope_id for executive (platform-wide) business memory. */
export const PLATFORM_SCOPE_ID = 'platform';

/** A single turn in a conversation, as fed to the model. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * An action the assistant proposes the user can take. The user confirms it in
 * the UI, which calls the action endpoint — the model never executes directly.
 */
export interface SuggestedAction {
  type: string;
  label: string;
  params?: Record<string, unknown>;
}

export interface AssistantReply {
  reply: string;
  actions: SuggestedAction[];
  tokens: number | null;
  latencyMs: number;
  source: 'ai' | 'fallback';
}

export interface AssistantProfile {
  type: AssistantType;
  /** Display name shown in the UI. */
  name: string;
  /** One-line identity. */
  role: string;
  /** Opening line when a fresh conversation starts. */
  greeting: string;
  /** What this assistant can help with — shown as suggestion chips. */
  capabilities: string[];
  /** Memory partition this assistant reads/writes. */
  memoryScope: MemoryScope;
}

export const ASSISTANT_PROFILES: Record<AssistantType, AssistantProfile> = {
  executive: {
    type: 'executive',
    name: 'Super Admin Assistant',
    role: 'Your COO, business analyst, and operations secretary',
    greeting:
      "Good day. I'm your Super Admin Assistant. I can brief you on platform health, revenue, growth, trials, and AI usage — and act on it. Where shall we start?",
    capabilities: [
      'Platform & revenue summary',
      'Workspace & subscription analytics',
      'Trial expiries & payment failures',
      'AI usage monitoring',
      'Recommend actions',
    ],
    memoryScope: 'business',
  },
  clinical: {
    type: 'clinical',
    name: 'Nutritionist Assistant',
    role: 'Your dietitian assistant and clinical secretary',
    greeting:
      "Hi! I'm your Nutritionist Assistant. I can run through today's appointments, clients who need attention, pending plate reviews, and follow-ups — and help you act on them. What do you need?",
    capabilities: [
      "Today's appointments",
      'Clients needing attention',
      'Pending plate reviews',
      'Adherence & progress',
      'Draft reports & programs',
    ],
    memoryScope: 'workspace',
  },
  wellness: {
    type: 'wellness',
    name: 'Client Assistant',
    role: 'Your personal coach, nutrition companion, and habit builder',
    greeting:
      "Hey! I'm your Client Assistant 🌿 I'm here to help you stay on track — meals, habits, goals, and a little motivation. How are you feeling today?",
    capabilities: [
      'Daily wellness summary',
      'Track meals & habits',
      'Progress & streaks',
      'Nutrition questions',
      'Motivation & reminders',
    ],
    memoryScope: 'personal',
  },
};

/**
 * Resolve which assistant a user gets from their identity. Order matters:
 * super admin → executive; any workspace staff role → clinical; otherwise the
 * user is treated as a client → wellness.
 */
export function resolveAssistantType(user: AuthUser): AssistantType {
  if (user.isSuperAdmin) return 'executive';
  if (user.workspaceRole) return 'clinical';
  return 'wellness';
}

/** The (scope, scope_id) memory partition for a user's assistant. */
export function resolveMemoryScope(
  user: AuthUser,
  type: AssistantType,
): { scope: MemoryScope; scopeId: string } {
  switch (type) {
    case 'executive':
      return { scope: 'business', scopeId: PLATFORM_SCOPE_ID };
    case 'clinical':
      return { scope: 'workspace', scopeId: user.workspaceId ?? user.id };
    case 'wellness':
      return { scope: 'personal', scopeId: user.id };
  }
}
