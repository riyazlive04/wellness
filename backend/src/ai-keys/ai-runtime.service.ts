import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI, type Content, type FunctionDeclaration, type GenerationConfig, type Part, type Schema,
} from '@google/generative-ai';
import { AiKeyMissingException, AiKeysService, type AiKey, type AiProvider } from './ai-keys.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

/**
 * One way for every practice AI feature to reach a model, on the PRACTICE'S
 * own key (Gemini or OpenAI). Features describe what they need - text or JSON,
 * an image or audio, tools - and this picks the provider and speaks its format.
 *
 * Key rule: a workspace's calls use that workspace's key and fail with
 * AiKeyMissingException without one. A call that doesn't name a workspace
 * uses the one in the current request; only with no workspace anywhere
 * (NUSI's own super-admin tools, background jobs with none) does it fall back
 * to the server's Gemini key.
 */

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

const OPENAI_URL = 'https://api.openai.com/v1';

export interface AiGenerateInput {
  workspaceId: string | null | undefined;
  system?: string;
  /** Earlier text turns, oldest first. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** The latest user text (may be empty when sending only audio). */
  prompt: string;
  image?: { base64: string; mimeType: string };
  audio?: { base64: string; mimeType: string };
  /** Ask for a JSON object back. */
  json?: boolean;
  /** Gemini-style response schema; translated to JSON Schema for OpenAI. */
  jsonSchema?: Schema;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Gemini model to use (e.g. a vision fallback model). Ignored for OpenAI. */
  geminiModel?: string;
}

export interface AiGenerateResult {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AiToolChatResult {
  text: string;
  provider: AiProvider;
  model: string;
  totalTokens: number;
  toolsUsed: string[];
  /** True when the model kept calling tools until the round limit. */
  ranOutOfRounds: boolean;
}

/** An error carrying the provider's HTTP status, so callers can map it. */
export class AiProviderError extends Error {
  constructor(message: string, readonly status: number, readonly provider: AiProvider) {
    super(message);
  }
}

@Injectable()
export class AiRuntimeService {
  private readonly logger = new Logger(AiRuntimeService.name);
  private readonly openAiModel: string;
  private readonly openAiTranscribeModel: string;

  constructor(
    private readonly aiKeys: AiKeysService,
    private readonly config: ConfigService,
    private readonly tenant: TenantContextService,
  ) {
    this.openAiModel = this.config.get<string>('OPENAI_WORKSPACE_MODEL') || 'gpt-4o-mini';
    this.openAiTranscribeModel = this.config.get<string>('OPENAI_TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe';
  }

  /**
   * The key a call runs on: the workspace's own, or - only when there is no
   * workspace at all - the server's Gemini key.
   */
  /** The workspace a call belongs to: the one named, else the current request's. */
  private scope(workspaceId: string | null | undefined): string | null {
    return workspaceId || this.tenant.workspaceId() || null;
  }

  async keyFor(requested: string | null | undefined): Promise<AiKey> {
    const workspaceId = this.scope(requested);
    if (workspaceId) return this.aiKeys.require(workspaceId);
    const platform = this.config.get<string>('GEMINI_API_KEY');
    if (!platform) throw new AiKeyMissingException();
    return { provider: 'gemini', key: platform };
  }

  /** Whether this workspace can run AI right now (has a key). */
  async hasKey(requested: string | null | undefined): Promise<boolean> {
    const workspaceId = this.scope(requested);
    if (!workspaceId) return !!this.config.get<string>('GEMINI_API_KEY');
    return !!(await this.aiKeys.resolve(workspaceId));
  }

  async provider(requested: string | null | undefined): Promise<AiProvider | null> {
    const workspaceId = this.scope(requested);
    if (!workspaceId) return this.config.get<string>('GEMINI_API_KEY') ? 'gemini' : null;
    return (await this.aiKeys.resolve(workspaceId))?.provider ?? null;
  }

  // ── One-shot generation ─────────────────────────────────────────────

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const k = await this.keyFor(input.workspaceId);
    return k.provider === 'openai' ? this.openAiGenerate(k.key, input) : this.geminiGenerate(k.key, input);
  }

  private async geminiGenerate(key: string, input: AiGenerateInput): Promise<AiGenerateResult> {
    const modelName = input.geminiModel || GEMINI_DEFAULT_MODEL;
    const generationConfig = {
      temperature: input.temperature ?? 0.4,
      ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
      ...(input.json || input.jsonSchema ? { responseMimeType: 'application/json' } : {}),
      ...(input.jsonSchema ? { responseSchema: input.jsonSchema } : {}),
      // Thinking adds seconds per call and these are short, structured tasks.
      thinkingConfig: { thinkingBudget: 0 },
    } as unknown as GenerationConfig;
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: modelName,
      ...(input.system ? { systemInstruction: input.system } : {}),
      generationConfig,
    });
    const parts: Part[] = [];
    if (input.image) parts.push({ inlineData: { data: input.image.base64, mimeType: input.image.mimeType } });
    if (input.audio) parts.push({ inlineData: { data: input.audio.base64, mimeType: input.audio.mimeType } });
    if (input.prompt) parts.push({ text: input.prompt });
    const contents: Content[] = [
      ...(input.history ?? []).map<Content>((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      { role: 'user', parts },
    ];
    const result = await withTimeout(model.generateContent({ contents }), input.timeoutMs);
    const meta = result.response.usageMetadata;
    return {
      text: result.response.text() ?? '',
      provider: 'gemini',
      model: modelName,
      inputTokens: meta?.promptTokenCount ?? null,
      outputTokens: meta?.candidatesTokenCount ?? null,
      totalTokens: meta?.totalTokenCount ?? null,
    };
  }

  private async openAiGenerate(key: string, input: AiGenerateInput): Promise<AiGenerateResult> {
    // OpenAI's chat model takes text, not audio: transcribe first, then answer.
    let prompt = input.prompt;
    if (input.audio) {
      const transcript = await this.openAiTranscribe(key, input.audio, input.timeoutMs);
      prompt = [input.prompt, `Transcript of the user's voice note:\n${transcript}`].filter(Boolean).join('\n\n');
    }
    const userContent: unknown = input.image
      ? [
          { type: 'image_url', image_url: { url: `data:${input.image.mimeType};base64,${input.image.base64}` } },
          ...(prompt ? [{ type: 'text', text: prompt }] : []),
        ]
      : prompt;
    const messages = [
      ...(input.system ? [{ role: 'system', content: input.system }] : []),
      ...(input.history ?? []).map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: userContent },
    ];
    const body: Record<string, unknown> = {
      model: this.openAiModel,
      messages,
      temperature: input.temperature ?? 0.4,
      ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    };
    if (input.jsonSchema) {
      body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: false, schema: toJsonSchema(input.jsonSchema) } };
    } else if (input.json) {
      body.response_format = { type: 'json_object' };
    }
    const data = await openAiPost<{ choices: Array<{ message: { content: string | null } }>; usage?: OpenAiUsage }>(
      key, '/chat/completions', body, input.timeoutMs,
    );
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      provider: 'openai',
      model: this.openAiModel,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    };
  }

  private async openAiTranscribe(key: string, audio: { base64: string; mimeType: string }, timeoutMs?: number): Promise<string> {
    const ext = audio.mimeType.split('/')[1]?.split(';')[0] || 'webm';
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(audio.base64, 'base64')], { type: audio.mimeType }), `voice.${ext}`);
    form.append('model', this.openAiTranscribeModel);
    const res = await fetch(`${OPENAI_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs ?? 60_000),
    });
    const json = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!res.ok) throw new AiProviderError(json.error?.message || `OpenAI transcription failed (${res.status})`, res.status, 'openai');
    return json.text ?? '';
  }

  // ── Chat with tools (the assistants) ────────────────────────────────

  async chatWithTools(params: {
    workspaceId: string | null | undefined;
    system: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    userMessage: string;
    tools: FunctionDeclaration[];
    executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    maxRounds: number;
    maxTokens?: number;
    temperature?: number;
  }): Promise<AiToolChatResult> {
    const k = await this.keyFor(params.workspaceId);
    return k.provider === 'openai' ? this.openAiToolChat(k.key, params) : this.geminiToolChat(k.key, params);
  }

  private async geminiToolChat(key: string, p: Parameters<AiRuntimeService['chatWithTools']>[0]): Promise<AiToolChatResult> {
    const model = new GoogleGenerativeAI(key).getGenerativeModel({
      model: GEMINI_DEFAULT_MODEL,
      systemInstruction: p.system,
      tools: p.tools.length ? [{ functionDeclarations: p.tools }] : undefined,
      generationConfig: {
        temperature: p.temperature ?? 0.4,
        maxOutputTokens: p.maxTokens ?? 1024,
        thinkingConfig: { thinkingBudget: 0 },
      } as unknown as GenerationConfig,
    });
    const contents: Content[] = [
      ...p.history.map<Content>((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      { role: 'user', parts: [{ text: p.userMessage }] },
    ];
    let totalTokens = 0;
    const toolsUsed: string[] = [];
    for (let round = 0; round < p.maxRounds; round++) {
      const resp = (await model.generateContent({ contents })).response;
      totalTokens += resp.usageMetadata?.totalTokenCount ?? 0;
      const calls = resp.functionCalls?.() ?? [];
      if (!calls.length) {
        return { text: (resp.text() || '').trim(), provider: 'gemini', model: GEMINI_DEFAULT_MODEL, totalTokens, toolsUsed, ranOutOfRounds: false };
      }
      contents.push({ role: 'model', parts: calls.map((c) => ({ functionCall: c })) });
      const responses: Part[] = [];
      for (const call of calls) {
        toolsUsed.push(call.name);
        const data = await p.executeTool(call.name, (call.args ?? {}) as Record<string, unknown>);
        responses.push({ functionResponse: { name: call.name, response: { result: jsonSafe(data) } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return { text: '', provider: 'gemini', model: GEMINI_DEFAULT_MODEL, totalTokens, toolsUsed, ranOutOfRounds: true };
  }

  private async openAiToolChat(key: string, p: Parameters<AiRuntimeService['chatWithTools']>[0]): Promise<AiToolChatResult> {
    const tools = p.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.parameters ? toJsonSchema(t.parameters as unknown as Schema) : { type: 'object', properties: {} },
      },
    }));
    type Msg = Record<string, unknown>;
    const messages: Msg[] = [
      { role: 'system', content: p.system },
      ...p.history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: p.userMessage },
    ];
    let totalTokens = 0;
    const toolsUsed: string[] = [];
    for (let round = 0; round < p.maxRounds; round++) {
      const data = await openAiPost<{
        choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
        usage?: OpenAiUsage;
      }>(key, '/chat/completions', {
        model: this.openAiModel,
        messages,
        temperature: p.temperature ?? 0.4,
        max_tokens: p.maxTokens ?? 1024,
        ...(tools.length ? { tools } : {}),
      });
      totalTokens += data.usage?.total_tokens ?? 0;
      const msg = data.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) {
        return { text: (msg?.content ?? '').trim(), provider: 'openai', model: this.openAiModel, totalTokens, toolsUsed, ranOutOfRounds: false };
      }
      messages.push({ role: 'assistant', content: msg?.content ?? null, tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: c.function })) });
      for (const call of calls) {
        toolsUsed.push(call.function.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const result = await p.executeTool(call.function.name, args);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(jsonSafe(result)) });
      }
    }
    return { text: '', provider: 'openai', model: this.openAiModel, totalTokens, toolsUsed, ranOutOfRounds: true };
  }
}

interface OpenAiUsage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }

async function openAiPost<T>(key: string, path: string, body: unknown, timeoutMs?: number): Promise<T> {
  const res = await fetch(`${OPENAI_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs ?? 60_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new AiProviderError(json.error?.message || `OpenAI request failed (${res.status})`, res.status, 'openai');
  return json;
}

/**
 * Gemini's schema objects already use JSON Schema type names ("object",
 * "string"...); translate the two differences OpenAI cares about.
 */
export function toJsonSchema(s: Schema | Record<string, unknown>): Record<string, unknown> {
  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'format' && v === 'enum') continue; // Gemini-only marker
    if (k === 'nullable') continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, toJsonSchema(pv as Record<string, unknown>)]),
      );
    } else if (k === 'items' && v && typeof v === 'object') {
      out.items = toJsonSchema(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  if (src.nullable === true && typeof out.type === 'string') out.type = [out.type, 'null'];
  return out;
}

/** Normalize raw-SQL values (BigInt, Date, Decimal) so tool results serialize. */
export function jsonSafe(v: unknown): unknown {
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

async function withTimeout<T>(promise: Promise<T>, ms?: number): Promise<T> {
  if (!ms) return promise;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AiProviderError(`AI request timed out after ${ms}ms`, 504, 'gemini')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
