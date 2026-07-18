import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AssistantContextService } from './assistant-context.service';
import { AssistantGeminiService } from './assistant-gemini.service';
import { ASSISTANT_PROFILES, type AssistantType } from './assistant.types';

export interface MorningBrief {
  assistantType: AssistantType;
  headline: string;
  body: string;
  context: Record<string, unknown>;
  source: 'ai' | 'fallback';
}

/**
 * AssistantBriefService — the role-specific "morning brief" (Module 6). Pulls
 * the assistant's context, asks the model to turn it into a short, actionable
 * briefing, and falls back to a deterministic summary when AI is unavailable.
 */
@Injectable()
export class AssistantBriefService {
  constructor(
    private readonly context: AssistantContextService,
    private readonly gemini: AssistantGeminiService,
  ) {}

  async brief(user: AuthUser, type: AssistantType): Promise<MorningBrief> {
    const ctx = await this.context.build(user, type);
    const profile = ASSISTANT_PROFILES[type];

    const fallback = this.fallback(type, ctx.data);
    const body = await this.gemini.summarize({
      assistantType: type,
      systemPrompt: `${BRIEF_SYSTEM[type]} You are ${profile.name}. Write a brief, scannable morning briefing in 3-5 short lines. Start with a one-line greeting, then the key numbers, then 1-2 recommended actions. Plain text, no markdown headers.`,
      prompt: `Here is the current context. Write the briefing.\n${ctx.promptText}`,
      workspaceId: user.workspaceId,
      fallback,
    });

    return {
      assistantType: type,
      headline: HEADLINE[type],
      body,
      context: ctx.data,
      source: this.gemini.isConfigured ? 'ai' : 'fallback',
    };
  }

  private fallback(type: AssistantType, data: Record<string, unknown>): string {
    const g = (path: string): unknown => {
      const [a, b] = path.split('.');
      const top = data[a] as Record<string, unknown> | undefined;
      return b ? top?.[b] : top;
    };
    if (type === 'executive') {
      return [
        'Good day. Here is your platform snapshot.',
        `Workspaces: ${g('workspaces.active') ?? 0} active (${g('workspaces.new_last_7d') ?? 0} new this week). Trials expiring in 7d: ${g('workspaces.trials_expiring_7d') ?? 0}.`,
        `MRR ₹${g('subscriptions.mrr_inr') ?? 0} · revenue 30d ₹${g('revenue.last_30d_inr') ?? 0} · payment failures ${g('revenue.failed_payments_30d') ?? 0}.`,
        `AI usage 24h: ${g('ai_usage_24h.calls') ?? 0} calls (${g('ai_usage_24h.errors') ?? 0} errors).`,
        'Recommended: review trial expiries and any payment failures.',
      ].join('\n');
    }
    if (type === 'clinical') {
      return [
        'Good morning! Here is your day at a glance.',
        `Appointments today: ${g('appointments_today_count') ?? 0}. Active clients: ${g('clients.active') ?? 0}.`,
        `Clients with no logs in 3 days: ${g('clients_no_logs_3d') ?? 0}. Pending plate reviews: ${g('pending_reviews') ?? 0}.`,
        'Recommended: clear pending reviews and check in with quiet clients.',
      ].join('\n');
    }
    return [
      'Hey! Here is your wellness check-in 🌿',
      `Meals logged today: ${g('today.meals_logged') ?? 0}. Last week compliance: ${g('latest_week_compliance') ?? '-'}.`,
      'Recommended: log your next meal and keep your streak going!',
    ].join('\n');
  }
}

const HEADLINE: Record<AssistantType, string> = {
  executive: 'Platform morning brief',
  clinical: 'Your clinical brief',
  wellness: 'Your wellness check-in',
};

const BRIEF_SYSTEM: Record<AssistantType, string> = {
  executive: 'You are an executive operations assistant for a wellness SaaS platform.',
  clinical: 'You are a clinical assistant for a nutritionist running their practice.',
  wellness: 'You are a warm, encouraging personal wellness coach.',
};
