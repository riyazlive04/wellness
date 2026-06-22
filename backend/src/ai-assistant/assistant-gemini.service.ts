import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI, type Content, type FunctionDeclaration, type GenerationConfig, type Part,
} from '@google/generative-ai';
import { UsageService } from '../usage/usage.service';
import type { AssistantReply, AssistantType, ChatTurn } from './assistant.types';

/**
 * Latency-tuned generation config. Gemini 2.5 Flash defaults to dynamic
 * "thinking", which adds several seconds per call — and the assistant makes one
 * call per tool round. `thinkingBudget: 0` disables it for snappy, tool-driven
 * replies. (Cast: thinkingConfig isn't in this SDK version's type but the API
 * accepts it.) maxOutputTokens keeps answers tight and fast to stream back.
 */
const FAST_CHAT_CONFIG = {
  temperature: 0.4,
  maxOutputTokens: 1024,
  thinkingConfig: { thinkingBudget: 0 },
} as unknown as GenerationConfig;

const FAST_BRIEF_CONFIG = {
  temperature: 0.5,
  maxOutputTokens: 700,
  thinkingConfig: { thinkingBudget: 0 },
} as unknown as GenerationConfig;

/**
 * AssistantGeminiService — the conversational brain shared by all three
 * assistants. Uses Gemini **function-calling**: the model is given a set of
 * read-only, role-scoped tools and decides which to call to answer the user's
 * actual question; we run the tool, feed the rows back, and loop until the model
 * produces a final grounded answer. Records the call in UsageService and
 * degrades gracefully when no API key is configured.
 */
@Injectable()
export class AssistantGeminiService implements OnModuleInit {
  private readonly logger = new Logger(AssistantGeminiService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private static readonly MODEL = 'gemini-2.5-flash';
  private static readonly MAX_TOOL_ROUNDS = 6;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — assistant will use a rule-based fallback reply.');
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  get isConfigured(): boolean {
    return this.genAI !== null;
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
    if (!this.genAI) {
      return {
        reply:
          "I'm running in offline mode right now (no AI key configured), so I can't reason over your data yet. Once GEMINI_API_KEY is set on the server I'll be fully available.",
        actions: [], tokens: null, latencyMs: 0, source: 'fallback',
      };
    }

    // Pre-call quota gate — degrade gracefully (don't 500) when over the limit.
    const quota = await this.usage.checkQuota(params.workspaceId ?? null);
    if (quota.exceeded) {
      return {
        reply:
          `This workspace has reached its monthly AI limit (${quota.limit} requests). ` +
          `It resets at the start of next month — or upgrade your plan for a higher limit.`,
        actions: [], tokens: null, latencyMs: 0, source: 'fallback',
      };
    }

    const model = this.genAI.getGenerativeModel({
      model: AssistantGeminiService.MODEL,
      systemInstruction: params.systemPrompt,
      tools: params.tools.length ? [{ functionDeclarations: params.tools }] : undefined,
      generationConfig: FAST_CHAT_CONFIG,
    });

    const contents: Content[] = [
      ...params.history.map<Content>((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      })),
      { role: 'user', parts: [{ text: params.userMessage }] },
    ];

    const t0 = Date.now();
    let totalTokens = 0;
    const toolsUsed: string[] = [];

    try {
      for (let round = 0; round < AssistantGeminiService.MAX_TOOL_ROUNDS; round++) {
        const result = await model.generateContent({ contents });
        const resp = result.response;
        totalTokens += resp.usageMetadata?.totalTokenCount ?? 0;

        const calls = resp.functionCalls?.() ?? [];
        if (!calls.length) {
          const text = (resp.text() || '').trim();
          this.recordSuccess(params, totalTokens, t0, toolsUsed);
          return {
            reply: text || 'Sorry — I had trouble forming a response. Could you rephrase that?',
            actions: [], tokens: totalTokens, latencyMs: Date.now() - t0, source: 'ai',
          };
        }

        // Append the model's tool-call turn, then run each tool and feed results back.
        contents.push({ role: 'model', parts: calls.map((c) => ({ functionCall: c })) });
        const responseParts: Part[] = [];
        for (const call of calls) {
          toolsUsed.push(call.name);
          const data = await params.executeTool(call.name, (call.args ?? {}) as Record<string, unknown>);
          // Tool results come from raw SQL — BigInt (count(*), *_paise) and
          // Date/Decimal must be normalized or the SDK's JSON serialization throws.
          responseParts.push({ functionResponse: { name: call.name, response: { result: jsonSafe(data) } } });
        }
        contents.push({ role: 'user', parts: responseParts });
      }

      // Ran out of rounds — ask the model for a final answer with no more tools.
      this.recordSuccess(params, totalTokens, t0, toolsUsed);
      return {
        reply: 'I gathered the data but ran out of steps to finish — could you narrow the question a little?',
        actions: [], tokens: totalTokens, latencyMs: Date.now() - t0, source: 'ai',
      };
    } catch (err) {
      void this.usage.record({
        service: 'chat', provider: 'gemini', model: AssistantGeminiService.MODEL,
        workspaceId: params.workspaceId ?? null, latencyMs: Date.now() - t0,
        status: 'error', errorCode: (err as Error).message?.slice(0, 100),
        metadata: { feature: 'assistant', assistant_type: params.assistantType, tools: toolsUsed },
      });
      throw err;
    }
  }

  /** One-shot generation (no tools) for morning briefs. */
  async summarize(params: {
    assistantType: AssistantType;
    systemPrompt: string;
    prompt: string;
    workspaceId?: string | null;
    fallback: string;
  }): Promise<string> {
    if (!this.genAI) return params.fallback;
    // Over quota → use the caller's deterministic fallback instead of the model.
    if ((await this.usage.checkQuota(params.workspaceId ?? null)).exceeded) {
      return params.fallback;
    }
    const model = this.genAI.getGenerativeModel({
      model: AssistantGeminiService.MODEL,
      systemInstruction: params.systemPrompt,
      generationConfig: FAST_BRIEF_CONFIG,
    });
    const t0 = Date.now();
    try {
      const result = await model.generateContent(params.prompt);
      const meta = result.response.usageMetadata;
      void this.usage.record({
        service: 'chat', provider: 'gemini', model: AssistantGeminiService.MODEL,
        workspaceId: params.workspaceId ?? null,
        inputTokens: meta?.promptTokenCount ?? null, outputTokens: meta?.candidatesTokenCount ?? null,
        totalTokens: meta?.totalTokenCount ?? null, latencyMs: Date.now() - t0,
        status: 'success', metadata: { feature: 'assistant_brief', assistant_type: params.assistantType },
      });
      return result.response.text().trim() || params.fallback;
    } catch (err) {
      this.logger.warn(`Brief generation failed, using fallback: ${(err as Error).message}`);
      return params.fallback;
    }
  }

  // (helper declared at module scope below)

  private recordSuccess(
    params: { assistantType: AssistantType; workspaceId?: string | null },
    totalTokens: number, t0: number, toolsUsed: string[],
  ): void {
    void this.usage.record({
      service: 'chat', provider: 'gemini', model: AssistantGeminiService.MODEL,
      workspaceId: params.workspaceId ?? null, totalTokens: totalTokens || null,
      latencyMs: Date.now() - t0, status: 'success',
      metadata: { feature: 'assistant', assistant_type: params.assistantType, tools: toolsUsed },
    });
  }
}

/**
 * Recursively normalize a raw-SQL value tree into something JSON.stringify (and
 * therefore the Gemini SDK) can serialize: BigInt → Number, and Date/Decimal via
 * their toJSON. Plain row objects/arrays are walked through.
 */
function jsonSafe(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown> & { toJSON?: () => unknown };
    if (typeof o.toJSON === 'function') return o.toJSON();
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = jsonSafe(o[k]);
    return out;
  }
  return v;
}
