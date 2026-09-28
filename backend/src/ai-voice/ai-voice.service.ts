import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CalculatorService } from '../nutrition-engine/calculator.service';
import { FoodMasterService } from '../nutrition-engine/food-master.service';
import type {
  CookingMethodCode,
  FoodSummary,
  NutrientPanel,
  UnresolvedFood,
} from '../nutrition-engine/nutrition.types';
import { UsageService } from '../usage/usage.service';
import { LimitsService } from '../tenancy/limits.service';
import { AiRuntimeService } from '../ai-keys/ai-runtime.service';
import { AiKeyMissingException } from '../ai-keys/ai-keys.service';

// ─── Public result shapes ─────────────────────────────────────────────

export type VoiceIntent =
  | { kind: 'meal_log';   foods: ResolvedFoodItem[]; notes?: string }
  | { kind: 'question';   topic: string }
  | { kind: 'reflection'; mood?: string; energy?: number }
  | { kind: 'unknown' };

/**
 * A food the user mentioned. AI handles identification + portion; nutrition
 * always comes from the deterministic engine. NEVER from Gemini.
 */
export interface ResolvedFoodItem {
  detected_name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;

  resolved: boolean;
  food: FoodSummary | null;
  nutrients: NutrientPanel | null;
  audit_id: string | null;
  unresolved?: UnresolvedFood;
}

export interface ConverseResult {
  userTranscript: string;
  aiResponse: string;
  intent?: VoiceIntent;
  latencyMs: number;
}

// ─── AI-side intermediate shape ───────────────────────────────────────

interface AiVoiceFood {
  name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;
}

const VALID_COOKING_METHODS: CookingMethodCode[] = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked', 'sauteed',
  'pan_fried', 'deep_fried', 'stir_fried', 'curried', 'tandoor',
  'pressure_cooked', 'microwaved', 'fermented',
];

// ─── Gemini prompt — identification ONLY, no nutrition ────────────────

const SYSTEM_PROMPT = `You are NUSI, a calm and warm wellness AI assistant for healthcare practitioners.

You will be given an audio clip of the user speaking. Do TWO things:
1. Transcribe what they said (verbatim, in their language; default English).
2. Reply briefly (max 2 sentences) in a warm, supportive tone.

If they're logging a meal, set intent.kind = "meal_log" and extract each food
with:
   - name: specific searchable common name ("Basmati rice, cooked", "Chicken biryani")
   - alternates: 1-3 alternate names ["chapathi", "phulka"]
   - portion_g: estimated grams. Use these defaults:
       1 chapati ~ 35g · 1 cup cooked rice ~ 150g · 1 bowl dal ~ 250g
       1 cup veg curry ~ 200g · 1 idli ~ 50g · 1 dosa ~ 80g
       1 medium fruit ~ 150g · 1 cup milk ~ 240g
   - cooking_method: one of these exact strings:
       ${VALID_COOKING_METHODS.join(', ')}
   - ai_confidence: 0..1

You MUST NOT estimate calorie / macro values. Those are computed by a
deterministic Nutrition Engine from your output. Stick to identification + portion.

If they're asking a question, set intent.kind = "question" and the topic.
If they're sharing how they feel, set intent.kind = "reflection" and mood/energy.
Otherwise intent.kind = "unknown".

Respond ONLY with a JSON object matching this exact shape, no markdown:
{
  "userTranscript": "what they said, exact words",
  "aiResponse": "your warm reply, max 2 sentences",
  "intent": {
    "kind": "meal_log" | "question" | "reflection" | "unknown",
    "foods": [
      { "name": "string", "alternates": ["string"], "portion_g": number,
        "cooking_method": "...", "ai_confidence": number }
    ],
    "topic": "string", "mood": "string", "energy": number, "notes": "string"
  }
}`;

@Injectable()
export class AiVoiceService implements OnModuleInit {
  private readonly logger = new Logger(AiVoiceService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
    private readonly foodMaster: FoodMasterService,
    private readonly calculator: CalculatorService,
    private readonly limits: LimitsService,
    private readonly ai: AiRuntimeService,
  ) {}

  onModuleInit(): void {
    this.logger.log("Voice AI ready - runs on each practice's own AI key (identification-only mode).");
  }

  /**
   * Converse with the user via audio. When they log a meal, each food is
   * routed through the Nutrition Engine for deterministic nutrition.
   * Gemini keys hear the audio directly; OpenAI keys transcribe it first.
   */
  async converse(
    audio: Buffer,
    mimeType: string,
    ctx: { actor_user_id?: string; workspace_id?: string } = {},
  ): Promise<ConverseResult> {
    const provider = await this.ai.provider(ctx.workspace_id);
    if (!provider) throw new AiKeyMissingException();
    await this.limits.assertAiQuota(ctx.workspace_id);
    const t0 = Date.now();
    let result;
    try {
      result = await this.ai.generate({
        workspaceId: ctx.workspace_id,
        system: SYSTEM_PROMPT,
        prompt: '',
        audio: { base64: audio.toString('base64'), mimeType },
        json: true,
        temperature: 0.6,
      });
    } catch (err: unknown) {
      if (err instanceof AiKeyMissingException) throw err;
      void this.usage.record({
        service: 'voice',
        provider,
        model: 'unknown',
        workspaceId: ctx.workspace_id ?? null,
        latencyMs: Date.now() - t0,
        status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
      });
      throw this.mapGeminiError(err);
    }
    const text = result.text;
    const latencyMs = Date.now() - t0;
    void this.usage.record({
      service: 'voice',
      provider: result.provider,
      model: result.model,
      workspaceId: ctx.workspace_id ?? null,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      latencyMs,
      status: 'success',
    });

    let parsed: {
      userTranscript?: string;
      aiResponse?: string;
      intent?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`AI returned non-JSON; falling back. Raw: ${text.slice(0, 120)}...`);
      return {
        userTranscript: '(could not transcribe)',
        aiResponse: text.trim(),
        intent: { kind: 'unknown' },
        latencyMs,
      };
    }

    const intent = await this.normalizeIntent(parsed.intent, ctx);

    return {
      userTranscript: parsed.userTranscript?.trim() || '(silence)',
      aiResponse:    parsed.aiResponse?.trim()    || 'I didn\'t catch that - could you try again?',
      intent,
      latencyMs,
    };
  }

  // ─── Intent normalisation + engine routing ─────────────────────────

  private async normalizeIntent(
    raw: Record<string, unknown> | undefined,
    ctx: { actor_user_id?: string; workspace_id?: string },
  ): Promise<VoiceIntent> {
    const kind = typeof raw?.kind === 'string' ? raw.kind : 'unknown';

    if (kind === 'meal_log') {
      const aiFoods = this.normalizeFoods(raw?.foods);
      const resolved: ResolvedFoodItem[] = [];
      for (const f of aiFoods) {
        resolved.push(await this.routeFood(f, ctx));
      }
      const notes = typeof raw?.notes === 'string' ? raw.notes : undefined;
      return { kind: 'meal_log', foods: resolved, notes };
    }
    if (kind === 'question') {
      return { kind: 'question', topic: typeof raw?.topic === 'string' ? raw.topic : '' };
    }
    if (kind === 'reflection') {
      return {
        kind: 'reflection',
        mood: typeof raw?.mood === 'string' ? raw.mood : undefined,
        energy: typeof raw?.energy === 'number' ? raw.energy : undefined,
      };
    }
    return { kind: 'unknown' };
  }

  private normalizeFoods(raw: unknown): AiVoiceFood[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r): AiVoiceFood | null => {
        if (!r || typeof r !== 'object') return null;
        const obj = r as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name.trim() : '';
        if (!name) return null;
        const alternates = Array.isArray(obj.alternates)
          ? (obj.alternates as unknown[]).filter((x) => typeof x === 'string')
              .map((x) => (x as string).trim()).filter(Boolean)
          : [];
        const portion_g = clamp(numOr(obj.portion_g, 0), 0, 2000);
        if (portion_g === 0) return null;
        const cm = typeof obj.cooking_method === 'string' ? obj.cooking_method.trim().toLowerCase() : 'raw';
        const cooking_method = (VALID_COOKING_METHODS as string[]).includes(cm)
          ? (cm as CookingMethodCode)
          : 'raw';
        const ai_confidence = clamp(numOr(obj.ai_confidence, 0.5), 0, 1);
        return { name, alternates, portion_g, cooking_method, ai_confidence };
      })
      .filter((x): x is AiVoiceFood => x !== null);
  }

  private async routeFood(
    f: AiVoiceFood,
    ctx: { actor_user_id?: string; workspace_id?: string },
  ): Promise<ResolvedFoodItem> {
    for (const q of [f.name, ...f.alternates]) {
      const resolved = await this.foodMaster.resolve(q);
      if ('reason' in resolved) continue;

      const calc = await this.calculator.calculate(
        {
          food_id: resolved.id,
          quantity_g: f.portion_g,
          cooking_method: f.cooking_method,
          ai_confidence: f.ai_confidence,
        },
        {
          actor_user_id: ctx.actor_user_id,
          workspace_id: ctx.workspace_id,
          target_type: 'voice_log',
        },
      );
      return {
        detected_name: f.name,
        alternates: f.alternates,
        portion_g: f.portion_g,
        cooking_method: f.cooking_method,
        ai_confidence: f.ai_confidence,
        resolved: true,
        food: calc.food,
        nutrients: calc.nutrients,
        audit_id: calc.audit_id,
      };
    }

    const lookback = await this.foodMaster.resolve(f.name);
    const unresolved: UnresolvedFood = 'reason' in lookback
      ? lookback
      : {
          query: f.name,
          reason: 'no_match',
          candidate_food_ids: [],
          recommended_action: 'manual_review_required',
        };
    return {
      detected_name: f.name,
      alternates: f.alternates,
      portion_g: f.portion_g,
      cooking_method: f.cooking_method,
      ai_confidence: f.ai_confidence,
      resolved: false,
      food: null,
      nutrients: null,
      audit_id: null,
      unresolved,
    };
  }

  // ─── Error mapping ─────────────────────────────────────────────────

  private mapGeminiError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.error(`AI call failed: ${msg}`);
    if (/429|quota|rate limit|exceeded your current quota/i.test(msg)) {
      return new ServiceUnavailableException(
        'Your AI provider is limiting requests right now. Wait a minute and try again.',
      );
    }
    if (/401|403|reported as leaked|API key not valid|Incorrect API key|permission_denied/i.test(msg)) {
      return new UnauthorizedException(
        'Your practice\'s AI key was rejected by the provider. The practice owner can update it in Settings -> AI.',
      );
    }
    if (/404|not found|is not supported for generateContent/i.test(msg)) {
      return new InternalServerErrorException(
        'The AI model is not available on your practice\'s key.',
      );
    }
    if (/ECONN|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg)) {
      return new ServiceUnavailableException(
        'Could not reach the AI provider. Try again in a moment.',
      );
    }
    return new InternalServerErrorException(`AI error: ${msg}`);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
