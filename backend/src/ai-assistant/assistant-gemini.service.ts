import { Injectable, Logger } from '@nestjs/common';
import { type FunctionDeclaration } from '@google/generative-ai';
import { UsageService } from '../usage/usage.service';
import { AiRuntimeService } from '../ai-keys/ai-runtime.service';
import { AiKeyMissingException } from '../ai-keys/ai-keys.service';
import type { AssistantReply, AssistantType, ChatTurn } from './assistant.types';

/**
 * AssistantGeminiService - the conversational brain shared by all three
 * assistants. Uses **function-calling**: the model is given a set of
 * read-only, role-scoped tools and decides which to call to answer the user's
 * actual question; we run the tool, feed the rows back, and loop until the model
 * produces a final grounded answer.
 *
 * Runs on the practice's own AI key (Gemini or OpenAI) via AiRuntimeService.
 * The name is historical - it is no longer Gemini-only.
 */
@Injectable()
export class AssistantGeminiService {
  private readonly logger = new Logger(AssistantGeminiService.name);
  private static readonly MAX_TOOL_ROUNDS = 6;

  constructor(
    private readonly usage: UsageService,
    private readonly ai: AiRuntimeService,
  ) {}

  /** Can this workspace use AI right now (it has its own key)? */
  isConfiguredFor(workspaceId: string | null | undefined): Promise<boolean> {
    return this.ai.hasKey(workspaceId);
  }

  /**
   * Run one assistant turn with tool-calling. `tools` are the function
   * declarations the model may call; `executeTool` runs the chosen tool (scoped
   * + read-only) and returns JSON-serializable data fed back to the model.
   */
  async chat(params: {
    assistantType: AssistantType;
    systemPrompt: string;
    history: ChatTurn[];
    userMessage: string;
    tools: FunctionDeclaration[];
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    workspaceId?: string | null;
  }): Promise<AssistantReply> {
    if (!(await this.ai.hasKey(params.workspaceId))) {
      return {
        reply:
          params.assistantType === 'wellness'
            ? "The AI assistant isn't set up for your practice yet. Your nutritionist can switch it on - meanwhile you can message them in Chat."
            : "AI isn't set up for this practice yet. The practice owner can add a Google Gemini or OpenAI key in Settings -> AI to switch it on.",
        actions: [], tokens: null, latencyMs: 0, source: 'fallback',
      };
    }

    // Pre-call quota gate - degrade gracefully (don't 500) when over the limit.
    const quota = await this.usage.checkQuota(params.workspaceId ?? null);
    if (quota.exceeded) {
      return {
        reply:
          `This workspace has reached its monthly AI limit (${quota.limit} requests). ` +
          `It resets at the start of next month - or upgrade your plan for a higher limit.`,
        actions: [], tokens: null, latencyMs: 0, source: 'fallback',
      };
    }

    const t0 = Date.now();
    let provider = 'gemini';
    let model = 'unknown';
    try {
      const r = await this.ai.chatWithTools({
        workspaceId: params.workspaceId,
        system: params.systemPrompt,
        history: params.history.map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.content })),
        userMessage: params.userMessage,
        tools: params.tools,
        executeTool: params.executeTool,
        maxRounds: AssistantGeminiService.MAX_TOOL_ROUNDS,
      });
      provider = r.provider;
      model = r.model;
      void this.usage.record({
        service: 'chat', provider: r.provider, model: r.model,
        workspaceId: params.workspaceId ?? null, totalTokens: r.totalTokens || null,
        latencyMs: Date.now() - t0, status: 'success',
        metadata: { feature: 'assistant', assistant_type: params.assistantType, tools: r.toolsUsed },
      });
      if (r.ranOutOfRounds) {
        return {
          reply: 'I gathered the data but ran out of steps to finish - could you narrow the question a little?',
          actions: [], tokens: r.totalTokens, latencyMs: Date.now() - t0, source: 'ai',
        };
      }
      return {
        reply: r.text || 'Sorry - I had trouble forming a response. Could you rephrase that?',
        actions: [], tokens: r.totalTokens, latencyMs: Date.now() - t0, source: 'ai',
      };
    } catch (err) {
      if (err instanceof AiKeyMissingException) throw err;
      void this.usage.record({
        service: 'chat', provider, model,
        workspaceId: params.workspaceId ?? null, latencyMs: Date.now() - t0,
        status: 'error', errorCode: (err as Error).message?.slice(0, 100),
        metadata: { feature: 'assistant', assistant_type: params.assistantType },
      });
      throw err;
    }
  }

  /** One-shot generation (no tools) for briefs, summaries and reflections. */
  async summarize(params: {
    assistantType: AssistantType;
    systemPrompt: string;
    prompt: string;
    workspaceId?: string | null;
    fallback: string;
  }): Promise<string> {
    // No key yet, or over quota -> the caller's deterministic fallback.
    if (!(await this.ai.hasKey(params.workspaceId))) return params.fallback;
    if ((await this.usage.checkQuota(params.workspaceId ?? null)).exceeded) return params.fallback;
    const t0 = Date.now();
    try {
      const r = await this.ai.generate({
        workspaceId: params.workspaceId,
        system: params.systemPrompt,
        prompt: params.prompt,
        maxTokens: 700,
        temperature: 0.5,
      });
      void this.usage.record({
        service: 'chat', provider: r.provider, model: r.model,
        workspaceId: params.workspaceId ?? null,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens, totalTokens: r.totalTokens,
        latencyMs: Date.now() - t0,
        status: 'success', metadata: { feature: 'assistant_brief', assistant_type: params.assistantType },
      });
      return r.text.trim() || params.fallback;
    } catch (err) {
      this.logger.warn(`Brief generation failed, using fallback: ${(err as Error).message}`);
      return params.fallback;
    }
  }
}
