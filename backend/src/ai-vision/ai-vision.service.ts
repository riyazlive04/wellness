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
import { CalculatorService } from '../nutrition-engine/calculator.service';
import { FoodMasterService } from '../nutrition-engine/food-master.service';
import {
  ENGINE_VERSION,
  type CookingMethodCode,
  type FoodSummary,
  type NutrientPanel,
  type UnresolvedFood,
} from '../nutrition-engine/nutrition.types';
import { UsageService } from '../usage/usage.service';
import { LimitsService } from '../tenancy/limits.service';

// ─── Result shapes ────────────────────────────────────────────────────

/**
 * A detected plate item. AI handles identification + portion only; nutrition
 * always comes from the deterministic engine, never from Gemini.
 *
 * Two terminal states:
 *   - `resolved: true`  → nutrients populated from food_nutrients, audit_id present
 *   - `resolved: false` → `unresolved` populated, `recommended_action` = 'manual_review_required'
 */
export interface DetectedItem {
  id: string;
  /** Raw name Gemini gave us; the engine resolved it to `food` if confident. */
  detected_name: string;
  /** Other names Gemini volunteered as plausible alternates. */
  alternates: string[];
  /** Portion in grams as Gemini estimated visually. */
  portion_g: number;
  /** Cooking style Gemini inferred (raw, deep_fried, curried, …). */
  cooking_method: CookingMethodCode;
  /** AI's confidence 0..1 for the identification. */
  ai_confidence: number;
  /** Bounding box in % of image. */
  box?: { x: number; y: number; w: number; h: number };

  /** True when the engine confidently resolved the item to an IFCT/USDA food. */
  resolved: boolean;
  /** The canonical food the engine matched. Null when resolved=false. */
  food: FoodSummary | null;
  /** Deterministic per-item nutrition (engine output). Null when resolved=false. */
  nutrients: NutrientPanel | null;
  /** Audit row id for this engine call. Null when resolved=false. */
  audit_id: string | null;

  /** Set when resolved=false — explains why and what to do. */
  unresolved?: UnresolvedFood;
}

export interface AnalyzeResult {
  items: DetectedItem[];
  /** Totals across RESOLVED items only. Unresolved contribute nothing. */
  totals: { energy_kcal: number; protein_g: number; carbohydrate_g: number; fat_g: number; fiber_g: number | null };
  /** Number of items the user needs to clarify / accept. */
  unresolved_count: number;
  /** Latency of the AI step (engine calls are negligible by comparison). */
  ai_latency_ms: number;
  /** True if Gemini's bounding-box estimates were usable. */
  has_boxes: boolean;
  /** Reproducibility: engine + database version stamps. */
  provenance: {
    engine_version: string;
    ai_model: string;
  };
}

// ─── AI-side intermediate shape (before engine routing) ────────────────

interface AiCandidate {
  name: string;
  alternates: string[];
  portion_g: number;
  cooking_method: CookingMethodCode;
  ai_confidence: number;
  box?: { x: number; y: number; w: number; h: number };
}

// ─── Gemini prompt — identification ONLY, no nutrition ─────────────────

const VALID_COOKING_METHODS: CookingMethodCode[] = [
  'raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked', 'sauteed',
  'pan_fried', 'deep_fried', 'stir_fried', 'curried', 'tandoor',
  'pressure_cooked', 'microwaved', 'fermented',
];

const SYSTEM_PROMPT = `You are NUSI Plate Vision - a visual nutrition assistant.

Your ONLY job is to IDENTIFY foods and ESTIMATE portion + cooking method from the image.
You MUST NOT invent calorie or macro values. The deterministic Nutrition Engine
calculates those from authoritative databases (IFCT 2017 / USDA FDC) using your output.

For the image:
1. List every distinct food item visible. Use specific, searchable common names
   (prefer "Basmati rice, cooked" over "rice"; "Chicken biryani" over "biryani").
2. For each item provide 1-3 alternate names (variants/spellings) to help the
   engine match: e.g. ["chapathi", "phulka", "wheat roti"].
3. Estimate portion in grams as consumed, using visual cues:
     plate ~ 25 cm, hand ~ 18 cm wide, teaspoon ~ 5 g, tablespoon ~ 15 g,
     fist ~ 200 g cooked rice/veg, deck of cards ~ 85 g meat.
4. Pick the cooking method from this EXACT list (lowercase, underscored):
     ${VALID_COOKING_METHODS.join(', ')}
   If unsure, pick the closest match. Use "raw" for fruits/salads.
5. Confidence 0..1 - how sure you are this identification is correct.
6. Optional bounding box in % of image (x, y from top-left, w, h).

Respond ONLY with JSON, no markdown:
{
  "items": [
    {
      "name": "string - primary searchable name",
      "alternates": ["string", "string"],
      "portion_g": number,
      "cooking_method": "one_of_the_methods_above",
      "ai_confidence": number,
      "box": { "x": number, "y": number, "w": number, "h": number } | null
    }
  ]
}

Be conservative - omit anything you can't reliably identify.
If the image is not food, return { "items": [] }.`;

// ─── Service ──────────────────────────────────────────────────────────

@Injectable()
export class AiVisionService implements OnModuleInit {
  private readonly logger = new Logger(AiVisionService.name);
  private model!: GenerativeModel;
  private static readonly AI_MODEL = 'gemini-2.5-flash';

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
    private readonly foodMaster: FoodMasterService,
    private readonly calculator: CalculatorService,
    private readonly limits: LimitsService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set - vision endpoint will fail at request time.');
      return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: AiVisionService.AI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    this.logger.log('Gemini 2.5 Flash vision client ready (identification-only mode).');
  }

  /**
   * Analyse a plate photo:
   *   1. Send to Gemini → get AI candidates (names + portion + cooking method).
   *   2. For each candidate, resolve via FoodMasterService.
   *   3. For resolved candidates, run CalculatorService → deterministic nutrition + audit row.
   *   4. For unresolved candidates, mark for manual review (NEVER invent numbers).
   *
   * `ctx` propagates the caller's user/workspace into the audit log.
   */
  async analyze(
    image: Buffer,
    mimeType: string,
    ctx: { actor_user_id?: string; workspace_id?: string } = {},
  ): Promise<AnalyzeResult> {
    if (!this.model) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY missing - set it in backend/.env.local and restart.',
      );
    }

    // Plan quota: blocks once the workspace spends its monthly AI-call budget.
    await this.limits.assertAiQuota(ctx.workspace_id);

    const candidates = await this.runGemini(image, mimeType);

    // Route each candidate through the engine.
    const items: DetectedItem[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      items.push(await this.routeCandidate(c, i, ctx));
    }

    const totals = items.reduce(
      (acc, it) => {
        if (!it.resolved || !it.nutrients) return acc;
        return {
          energy_kcal:    round1(acc.energy_kcal    + (it.nutrients.energy_kcal ?? 0)),
          protein_g:      round1(acc.protein_g      + (it.nutrients.protein_g ?? 0)),
          carbohydrate_g: round1(acc.carbohydrate_g + (it.nutrients.carbohydrate_g ?? 0)),
          fat_g:          round1(acc.fat_g          + (it.nutrients.fat_g ?? 0)),
          fiber_g:        acc.fiber_g == null && it.nutrients.fiber_g == null
                            ? null
                            : round1((acc.fiber_g ?? 0) + (it.nutrients.fiber_g ?? 0)),
        };
      },
      { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0, fiber_g: null as number | null },
    );

    return {
      items,
      totals,
      unresolved_count: items.filter((it) => !it.resolved).length,
      ai_latency_ms: this.lastAiLatency,
      has_boxes: items.some((it) => it.box !== undefined),
      provenance: {
        engine_version: ENGINE_VERSION,
        ai_model: AiVisionService.AI_MODEL,
      },
    };
  }

  // ─── Gemini step ────────────────────────────────────────────────────

  private lastAiLatency = 0;

  private async runGemini(image: Buffer, mimeType: string): Promise<AiCandidate[]> {
    const t0 = Date.now();
    let result;
    try {
      result = await this.model.generateContent([
        { inlineData: { data: image.toString('base64'), mimeType } },
      ]);
    } catch (err: unknown) {
      void this.usage.record({
        service: 'vision',
        provider: 'gemini',
        model: AiVisionService.AI_MODEL,
        latencyMs: Date.now() - t0,
        status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
      });
      throw this.mapGeminiError(err);
    }
    this.lastAiLatency = Date.now() - t0;
    const usageMeta = result.response.usageMetadata;
    void this.usage.record({
      service: 'vision',
      provider: 'gemini',
      model: AiVisionService.AI_MODEL,
      inputTokens: usageMeta?.promptTokenCount ?? null,
      outputTokens: usageMeta?.candidatesTokenCount ?? null,
      totalTokens: usageMeta?.totalTokenCount ?? null,
      latencyMs: this.lastAiLatency,
      status: 'success',
    });

    const text = result.response.text();
    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`Gemini returned non-JSON. Raw: ${text.slice(0, 200)}…`);
      return [];
    }
    return this.normalizeCandidates(parsed.items);
  }

  /** Validate + clean Gemini's raw items into our strict AiCandidate shape. */
  private normalizeCandidates(raw: unknown): AiCandidate[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r): AiCandidate | null => {
        if (!r || typeof r !== 'object') return null;
        const obj = r as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name.trim() : '';
        if (!name) return null;
        const alternates = Array.isArray(obj.alternates)
          ? (obj.alternates as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean)
          : [];
        const portion_g = clamp(numOr(obj.portion_g, 0), 0, 2000);
        if (portion_g === 0) return null;
        const cm = typeof obj.cooking_method === 'string' ? obj.cooking_method.trim().toLowerCase() : 'raw';
        const cooking_method = (VALID_COOKING_METHODS as string[]).includes(cm)
          ? (cm as CookingMethodCode)
          : 'raw';
        const ai_confidence = clamp(numOr(obj.ai_confidence, 0.5), 0, 1);
        const b = obj.box as Record<string, unknown> | null | undefined;
        const box =
          b && typeof b === 'object'
            ? {
                x: clamp(numOr(b.x, 0), 0, 100),
                y: clamp(numOr(b.y, 0), 0, 100),
                w: clamp(numOr(b.w, 0), 0, 100),
                h: clamp(numOr(b.h, 0), 0, 100),
              }
            : undefined;
        return { name, alternates, portion_g, cooking_method, ai_confidence, box };
      })
      .filter((x): x is AiCandidate => x !== null);
  }

  // ─── Engine step ────────────────────────────────────────────────────

  /**
   * Resolve one candidate to an IFCT/USDA food and calculate nutrients.
   * Tries the primary name first; if unresolved/ambiguous, retries with each
   * alternate before giving up and flagging for manual review.
   */
  private async routeCandidate(
    c: AiCandidate,
    idx: number,
    ctx: { actor_user_id?: string; workspace_id?: string },
  ): Promise<DetectedItem> {
    const queries = [c.name, ...c.alternates];
    for (const q of queries) {
      const resolved = await this.foodMaster.resolve(q);
      if ('reason' in resolved) continue; // try next alternate

      const calc = await this.calculator.calculate(
        {
          food_id: resolved.id,
          quantity_g: c.portion_g,
          cooking_method: c.cooking_method,
          ai_confidence: c.ai_confidence,
        },
        {
          actor_user_id: ctx.actor_user_id,
          workspace_id: ctx.workspace_id,
          target_type: 'plate_vision',
        },
      );

      return {
        id: `i_${Date.now()}_${idx}`,
        detected_name: c.name,
        alternates: c.alternates,
        portion_g: c.portion_g,
        cooking_method: c.cooking_method,
        ai_confidence: c.ai_confidence,
        box: c.box,
        resolved: true,
        food: calc.food,
        nutrients: calc.nutrients,
        audit_id: calc.audit_id,
      };
    }

    // All queries failed — flag for manual review. No invented numbers.
    const lookback = await this.foodMaster.resolve(c.name);
    const unresolved: UnresolvedFood = 'reason' in lookback
      ? lookback
      : {
          query: c.name,
          reason: 'no_match',
          candidate_food_ids: [],
          recommended_action: 'manual_review_required',
        };
    return {
      id: `i_${Date.now()}_${idx}`,
      detected_name: c.name,
      alternates: c.alternates,
      portion_g: c.portion_g,
      cooking_method: c.cooking_method,
      ai_confidence: c.ai_confidence,
      box: c.box,
      resolved: false,
      food: null,
      nutrients: null,
      audit_id: null,
      unresolved,
    };
  }

  // ─── Error mapping (unchanged from previous version) ───────────────

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
        'Gemini model not available. The model name in ai-vision.service.ts may be outdated.',
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

// ─── Tiny helpers ──────────────────────────────────────────────────────

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
