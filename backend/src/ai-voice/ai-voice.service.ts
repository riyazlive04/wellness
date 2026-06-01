import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

export interface ConverseResult {
  userTranscript: string;
  aiResponse: string;
  /** Optional structured intent the model detected (meal log, question, reflection). */
  intent?: VoiceIntent;
  /** Latency breakdown in ms — for the frontend's debugging panel. */
  latencyMs: number;
}

export type VoiceIntent =
  | { kind: 'meal_log';   foods: string[]; notes?: string }
  | { kind: 'question';   topic: string }
  | { kind: 'reflection'; mood?: string; energy?: number }
  | { kind: 'unknown' };

/**
 * SIRAH's system prompt — concise, warm, action-oriented.
 * The model must respond as JSON so we can parse intent + reply together.
 */
const SYSTEM_PROMPT = `You are SIRAH, a calm and warm wellness AI assistant for healthcare practitioners.

You will be given an audio clip of the user speaking. Do TWO things:
1. Transcribe what they said (verbatim, in their language; default English).
2. Reply briefly (max 2 sentences) in a warm, supportive tone.

If they're logging a meal, set intent.kind = "meal_log" and list the foods.
If they're asking a question, set intent.kind = "question" and the topic.
If they're sharing how they feel, set intent.kind = "reflection" and the mood.
Otherwise intent.kind = "unknown".

Respond ONLY with a JSON object matching this exact shape, no markdown, no commentary:
{
  "userTranscript": "what they said, exact words",
  "aiResponse": "your warm reply, max 2 sentences",
  "intent": { "kind": "meal_log" | "question" | "reflection" | "unknown", ...intent-specific fields }
}`;

@Injectable()
export class AiVoiceService implements OnModuleInit {
  private readonly logger = new Logger(AiVoiceService.name);
  private model!: GenerativeModel;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — voice endpoint will fail at request time.');
      return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    // gemini-2.5-flash: probed and works on the current API; the 1.5 family
    // was retired by May 2026, and 2.0-flash's free quota is hammered.
    // Supports audio multimodal + JSON-mode response.
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
    });
    this.logger.log('Gemini 2.5 Flash multimodal client ready.');
  }

  async converse(audio: Buffer, mimeType: string): Promise<ConverseResult> {
    if (!this.model) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY missing — set it in backend/.env.local and restart.',
      );
    }
    const t0 = Date.now();
    let result;
    try {
      result = await this.model.generateContent([
        {
          inlineData: {
            data: audio.toString('base64'),
            mimeType,
          },
        },
      ]);
    } catch (err: unknown) {
      throw this.mapGeminiError(err);
    }
    const text = result.response.text();
    const latencyMs = Date.now() - t0;

    let parsed: { userTranscript?: string; aiResponse?: string; intent?: VoiceIntent };
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`Gemini returned non-JSON; falling back. Raw: ${text.slice(0, 120)}…`);
      return {
        userTranscript: '(could not transcribe)',
        aiResponse: text.trim(),
        intent: { kind: 'unknown' },
        latencyMs,
      };
    }

    return {
      userTranscript: parsed.userTranscript?.trim() || '(silence)',
      aiResponse:    parsed.aiResponse?.trim()    || 'I didn\'t catch that — could you try again?',
      intent:        parsed.intent ?? { kind: 'unknown' },
      latencyMs,
    };
  }

  /**
   * Convert opaque GoogleGenerativeAI errors into actionable HTTP responses
   * the frontend can surface to the user. Hides nothing important — Gemini's
   * own message text travels through to the toast.
   */
  private mapGeminiError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.error(`Gemini call failed: ${msg}`);

    if (/429|quota|rate limit|exceeded your current quota/i.test(msg)) {
      return new ServiceUnavailableException(
        'Gemini rate limit hit. Wait a minute and try again, or upgrade billing.',
      );
    }
    if (/403|reported as leaked|API key not valid|permission_denied/i.test(msg)) {
      return new UnauthorizedException(
        'Gemini API key invalid or revoked. Rotate it in Google AI Studio and update backend/.env.local.',
      );
    }
    if (/404|not found|is not supported for generateContent/i.test(msg)) {
      return new InternalServerErrorException(
        'Gemini model not available. The model name in ai-voice.service.ts may be outdated.',
      );
    }
    if (/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg)) {
      return new ServiceUnavailableException(
        'Could not reach Gemini. Check your internet connection.',
      );
    }
    return new InternalServerErrorException(`Gemini error: ${msg}`);
  }
}
