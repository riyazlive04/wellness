import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
  type Part,
  type Schema,
} from '@google/generative-ai';
import { UsageService } from '../usage/usage.service';
import { LimitsService } from '../tenancy/limits.service';
import {
  EMPTY_TOTALS,
  type AnalyzeHints,
  type AnalyzedItem,
  type PlateAnalysis,
} from './plate-analysis.types';

/**
 * Plate Vision — dish-level recognition.
 *
 * The model identifies the DISH, breaks it into component foods, and estimates
 * nutrition for each. Read `plate-analysis.types.ts` for what that means for
 * the trustworthiness of these numbers — in short, they are model estimates,
 * not database lookups, and every surface that shows them has to say so.
 *
 * This service deliberately does NOT call FoodMasterService or
 * CalculatorService. The deterministic engine still backs voice, barcode,
 * meal-plans and manual entry; it is simply not on the plate path any more.
 */

const SYSTEM_INSTRUCTION = [
  'You are a nutrition estimation assistant. Given a photo of a meal, identify every distinct food item and estimate its portion and nutrition.',
  "Use the user's text hint and portion reference when provided.",
  'Estimate portions from visual cues: plate diameter (assume ~26 cm dinner plate unless a reference object suggests otherwise), bowl depth, utensil size, and food density.',
  'Useful anchors: hand ~18 cm wide, teaspoon ~5 g, tablespoon ~15 g, fist ~200 g cooked rice or vegetables, deck of cards ~85 g meat.',
  'Account for invisible ingredients typical of the cuisine - cooking oil, ghee, butter, sugar in sauces - and list every such guess in the assumptions array.',
  'Prefer regional dish knowledge (Indian, Middle Eastern, East Asian, Western) over generic labels. Say "Chicken biryani" rather than "rice dish", "Chapathi" rather than "flatbread".',
  'In the alternatives array, list 2-3 other dishes you seriously considered but ruled out, each with a one-line note on what would distinguish it. Leave it empty only when the dish is unmistakable.',
  'If the user tells you your previous identification was wrong, treat their correction as ground truth and rebuild the entire breakdown around it - do not argue or revert to your own guess.',
  'Set confidence to "low" when the portion is genuinely ambiguous or the food is obscured, and widen calories_range accordingly. A wide honest range beats a narrow invented one.',
  'If the image contains no food, set not_food: true and leave every array empty.',
  'Never invent precision you do not have; round to whole numbers. Do not give medical or diagnostic advice.',
].join(' ');

const NUM = { type: SchemaType.NUMBER } as const;
const STR = { type: SchemaType.STRING } as const;

/**
 * A strict response schema rather than a prose description of the JSON. The
 * previous identification-only prompt asked for JSON in words and relied on the
 * model complying; one malformed reply meant an empty plate with no
 * explanation. Pinning the schema makes the shape the API's problem.
 */
const RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    dish_name: STR,
    cuisine: STR,
    confidence: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'], format: 'enum' },
    alternatives: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: { dish_name: STR, note: STR },
        required: ['dish_name', 'note'],
      },
    },
    assumptions: { type: SchemaType.ARRAY, items: STR },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: STR,
          estimated_portion: STR,
          grams: NUM,
          calories_kcal: NUM,
          protein_g: NUM,
          carbs_g: NUM,
          fat_g: NUM,
          fiber_g: NUM,
          sugar_g: NUM,
          sodium_mg: NUM,
        },
        required: [
          'name', 'estimated_portion', 'grams', 'calories_kcal',
          'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg',
        ],
      },
    },
    totals: {
      type: SchemaType.OBJECT,
      properties: {
        calories_kcal: NUM,
        calories_range: {
          type: SchemaType.OBJECT,
          properties: { min: NUM, max: NUM },
          required: ['min', 'max'],
        },
        protein_g: NUM,
        carbs_g: NUM,
        fat_g: NUM,
        fiber_g: NUM,
        sugar_g: NUM,
        sodium_mg: NUM,
      },
      required: [
        'calories_kcal', 'calories_range', 'protein_g', 'carbs_g',
        'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg',
      ],
    },
    health_notes: { type: SchemaType.ARRAY, items: STR },
    not_food: { type: SchemaType.BOOLEAN },
  },
  required: [
    'dish_name', 'cuisine', 'confidence', 'alternatives', 'assumptions',
    'items', 'totals', 'health_notes', 'not_food',
  ],
};

/**
 * Portion wording matters more than expected. Measured on a fixed photo, the
 * passive phrasing ("the user says this is a small portion") moved the estimate
 * 0% for small and ~20% for large - the model read it as colour, not
 * instruction. Phrased as an override with a target multiplier it lands at
 * -31% / +40%, and on a thali photo measured -59% grams / -53% kcal.
 */
const PORTION_COPY: Record<'small' | 'medium' | 'large', string> = {
  small:
    'PORTION OVERRIDE: the user states this is a SMALL serving of this dish. This outranks your default assumption of a typical serving - reduce the gram estimate to roughly 70% of what you would otherwise judge, and record the override in assumptions.',
  medium:
    'PORTION OVERRIDE: the user confirms this is a MEDIUM, typical serving of this dish. Estimate a standard portion.',
  large:
    'PORTION OVERRIDE: the user states this is a LARGE serving of this dish. This outranks your default assumption of a typical serving - increase the gram estimate to roughly 140% of what you would otherwise judge, and record the override in assumptions.',
};

function buildHintText(hints: AnalyzeHints): string {
  const lines = ['Analyse this meal photo and return the nutrition breakdown.'];
  if (hints.correction?.trim()) {
    lines.push(
      `CORRECTION - your previous identification was wrong. The user says this dish is: ${hints.correction.trim()}. Rebuild the entire breakdown around that, and set dish_name accordingly.`,
    );
  }
  if (hints.hint?.trim()) lines.push(`User hint: ${hints.hint.trim()}`);
  if (hints.portion && PORTION_COPY[hints.portion]) lines.push(PORTION_COPY[hints.portion]);
  if (hints.scale_ref) {
    lines.push(
      'SCALE CALIBRATION: there is a reference object in frame (spoon, hand, or card). Work in this order: identify the object, state its real-world size, use it to measure the plate or bowl, and only then estimate food volume. Do not fall back to the 26 cm assumption. Record the object you used and the plate size you derived from it as the first entry in assumptions.',
    );
  }
  return lines.join('\n');
}

// ─── Model + retry policy ──────────────────────────────────────────────
//
// All three are env-overridable. A hardcoded model name means that when a
// model degrades, the only lever is a code change and a redeploy — which is
// the wrong lever to be reaching for mid-incident.

const DEFAULT_MODEL = 'gemini-2.5-flash';
/**
 * A different model, not just a second try at the same one. Measured during a
 * real 2.5-flash outage: flash returned 503 four times running (36-55s each)
 * while flash-lite answered the identical request, same schema, in 32s.
 */
const DEFAULT_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
/**
 * The SDK has no request deadline of its own. Without this a degraded model
 * can hold the request open long past the point the user has given up, and
 * every retry compounds it.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Transient conditions worth absorbing rather than showing the user. */
const RETRYABLE_STATUSES = [429, 503];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Surfaces as a 503 so the attempt planner treats a stalled request exactly
 * like an overloaded one — both mean "this model is not answering right now".
 */
class RequestTimeoutError extends Error {
  readonly status = 503;
  constructor(ms: number) {
    super(`Gemini did not respond within ${ms}ms.`);
    this.name = 'RequestTimeoutError';
  }
}

@Injectable()
export class AiVisionService implements OnModuleInit {
  private readonly logger = new Logger(AiVisionService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly models = new Map<string, GenerativeModel>();

  private primaryModel = DEFAULT_MODEL;
  private fallbackModel: string | null = DEFAULT_FALLBACK_MODEL;
  private timeoutMs = DEFAULT_TIMEOUT_MS;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
    private readonly limits: LimitsService,
  ) {}

  onModuleInit(): void {
    this.primaryModel = this.config.get<string>('GEMINI_VISION_MODEL') || DEFAULT_MODEL;

    // An explicit empty value is a deliberate "no fallback", not a missing
    // setting, so only an undefined value falls back to the default.
    const configuredFallback = this.config.get<string>('GEMINI_VISION_FALLBACK_MODEL');
    const fallback = configuredFallback === undefined ? DEFAULT_FALLBACK_MODEL : configuredFallback.trim();
    this.fallbackModel = fallback && fallback !== this.primaryModel ? fallback : null;

    const timeout = Number(this.config.get<string>('GEMINI_VISION_TIMEOUT_MS'));
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;

    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set - vision endpoint will fail at request time.');
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger.log(
      `Plate Vision ready - model ${this.primaryModel}` +
        `${this.fallbackModel ? `, fallback ${this.fallbackModel}` : ', no fallback'}` +
        `, ${this.timeoutMs}ms timeout.`,
    );
  }

  /** Models are stateless and reusable; build each at most once. */
  private getModel(name: string): GenerativeModel {
    const cached = this.models.get(name);
    if (cached) return cached;
    const model = this.genAI!.getGenerativeModel({
      model: name,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Portion estimation does not reward creative variation.
        temperature: 0.3,
      },
    });
    this.models.set(name, model);
    return model;
  }

  /**
   * Analyse a plate photo into a dish-level breakdown.
   *
   * `ctx.workspace_id` gates the call against the workspace's monthly AI budget
   * and tags the usage record.
   */
  async analyze(
    image: Buffer,
    mimeType: string,
    ctx: { actor_user_id?: string; workspace_id?: string } = {},
    hints: AnalyzeHints = {},
  ): Promise<PlateAnalysis> {
    if (!this.genAI) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY missing - set it in backend/.env.local and restart.',
      );
    }

    await this.limits.assertAiQuota(ctx.workspace_id);

    const parts: Part[] = [
      { inlineData: { data: image.toString('base64'), mimeType } },
      { text: buildHintText(hints) },
    ];

    const { response, model, latencyMs } = await this.generate(parts);

    const text = response.text();
    if (!text) {
      throw new ServiceUnavailableException('Gemini returned an empty response. Try another photo.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`Gemini returned non-JSON despite the schema. Raw: ${text.slice(0, 200)}…`);
      throw new ServiceUnavailableException(
        'Could not read the nutrition data Gemini sent back. Try again.',
      );
    }

    return this.normalise(parsed, latencyMs, model);
  }

  /**
   * Run the request against the attempt plan.
   *
   * The fallback model is tried SECOND, not last. An overloaded model stays
   * overloaded for minutes, so spending the whole retry budget hammering it
   * before trying an alternative just makes the user wait longer for the same
   * failure. A different model is the move most likely to succeed, so it goes
   * early; the primary gets one more try afterwards in case the blip really was
   * momentary.
   */
  private async generate(parts: Part[]) {
    const plan: Array<{ model: string; waitMs: number }> = [
      { model: this.primaryModel, waitMs: 0 },
      ...(this.fallbackModel ? [{ model: this.fallbackModel, waitMs: 0 }] : []),
      { model: this.primaryModel, waitMs: 2400 },
    ];

    let lastError: unknown;
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      if (step.waitMs) await wait(step.waitMs);

      const t0 = Date.now();
      try {
        const result = await this.withTimeout(this.getModel(step.model).generateContent({ contents: [{ role: 'user', parts }] }));
        const latencyMs = Date.now() - t0;
        const usageMeta = result.response.usageMetadata;
        void this.usage.record({
          service: 'vision',
          provider: 'gemini',
          model: step.model,
          inputTokens: usageMeta?.promptTokenCount ?? null,
          outputTokens: usageMeta?.candidatesTokenCount ?? null,
          totalTokens: usageMeta?.totalTokenCount ?? null,
          latencyMs,
          status: 'success',
        });
        if (i > 0) this.logger.log(`Recovered on ${step.model} after ${i} failed attempt(s).`);
        return { response: result.response, model: step.model, latencyMs };
      } catch (err: unknown) {
        lastError = err;
        void this.usage.record({
          service: 'vision',
          provider: 'gemini',
          model: step.model,
          latencyMs: Date.now() - t0,
          status: 'error',
          errorCode: (err as Error).message?.slice(0, 100),
        });

        const status = statusOf(err);
        // A spent daily quota will not recover by waiting, and it applies to
        // the key rather than the model - so neither retrying nor switching
        // model helps. Fail immediately with advice that fits.
        if (status === 429 && isDailyQuota(err)) break;
        if (!RETRYABLE_STATUSES.includes(status)) break;

        const next = plan[i + 1];
        if (next) {
          this.logger.warn(
            `${step.model} failed with ${status}; ${next.model === step.model ? 'retrying' : `falling back to ${next.model}`}.`,
          );
        }
      }
    }

    throw this.mapGeminiError(lastError);
  }

  /**
   * The SDK exposes no request deadline, so impose one. The abandoned request
   * keeps running server-side; we simply stop waiting for it.
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RequestTimeoutError(this.timeoutMs)), this.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * A response schema makes the shape reliable, not guaranteed. One missing
   * number would render as NaN across every macro pill in the UI, so coerce
   * everything at the boundary and never let an undefined past this point.
   */
  private normalise(raw: unknown, latencyMs: number, model: string): PlateAnalysis {
    const data = (raw ?? {}) as Record<string, any>;
    const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
    const totals = (data.totals ?? {}) as Record<string, any>;
    const range = (totals.calories_range ?? {}) as Record<string, any>;

    const items: AnalyzedItem[] = rawItems.map((raw) => {
      const item = (raw ?? {}) as Record<string, any>;
      return {
        name: str(item.name) || 'Unnamed item',
        estimated_portion: str(item.estimated_portion),
        grams: num(item.grams),
        calories_kcal: num(item.calories_kcal),
        protein_g: num(item.protein_g),
        carbs_g: num(item.carbs_g),
        fat_g: num(item.fat_g),
        fiber_g: num(item.fiber_g),
        sugar_g: num(item.sugar_g),
        sodium_mg: num(item.sodium_mg),
      };
    });

    // Trust the model's own total when it gave one, but fall back to the item
    // sum rather than showing a confident 0 kcal under a full plate.
    const calories = num(totals.calories_kcal) || sumOf(items, 'calories_kcal');

    return {
      dish_name: str(data.dish_name) || 'Unidentified meal',
      cuisine: str(data.cuisine),
      confidence:
        data.confidence === 'high' || data.confidence === 'medium' || data.confidence === 'low'
          ? data.confidence
          : 'low',
      alternatives: Array.isArray(data.alternatives)
        ? data.alternatives
            .map((alt: Record<string, any>) => ({
              dish_name: str(alt?.dish_name),
              note: str(alt?.note),
            }))
            .filter((alt: { dish_name: string }) => alt.dish_name)
        : [],
      assumptions: strArray(data.assumptions),
      items,
      totals: {
        ...EMPTY_TOTALS,
        calories_kcal: calories,
        calories_range: {
          // ±15% is the fallback band when the model omits its own. Silently
          // implying certainty we do not have would be worse than a guess.
          min: num(range.min, Math.round(calories * 0.85)),
          max: num(range.max, Math.round(calories * 1.15)),
        },
        protein_g: num(totals.protein_g) || sumOf(items, 'protein_g'),
        carbs_g: num(totals.carbs_g) || sumOf(items, 'carbs_g'),
        fat_g: num(totals.fat_g) || sumOf(items, 'fat_g'),
        fiber_g: num(totals.fiber_g) || sumOf(items, 'fiber_g'),
        sugar_g: num(totals.sugar_g) || sumOf(items, 'sugar_g'),
        sodium_mg: num(totals.sodium_mg) || sumOf(items, 'sodium_mg'),
      },
      health_notes: strArray(data.health_notes),
      not_food: data.not_food === true,
      provenance: {
        // The model that actually answered, which after a fallback is not the
        // configured primary. Recording the wrong one would make a quality
        // regression impossible to trace back.
        ai_model: model,
        nutrition_source: 'ai_estimate',
      },
      ai_latency_ms: latencyMs,
    };
  }

  // ─── Error mapping ──────────────────────────────────────────────────

  /**
   * Turn a failure into something worth showing a person.
   *
   * Classification leads with `statusOf(err)` — the same signal the retry
   * planner uses — and only falls back to matching the message text. Deriving
   * the category from the message alone would disagree with the planner
   * whenever the status is carried on the error object but absent from its
   * wording: the request would be correctly retried as a 503, then reported to
   * the user as a generic 500.
   */
  private mapGeminiError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    const status = statusOf(err);
    this.logger.error(`Gemini call failed${status ? ` (${status})` : ''}: ${msg}`);

    if (isDailyQuota(err)) {
      return new ServiceUnavailableException(
        "Today's Gemini quota is spent. It resets tomorrow, or raise the limit by enabling billing in Google AI Studio.",
      );
    }
    if (status === 429 || /quota|rate limit|exceeded your current quota/i.test(msg)) {
      return new ServiceUnavailableException(
        'Gemini rate limit hit. Wait a minute and try again, or upgrade billing.',
      );
    }
    if (status === 401 || status === 403 || /reported as leaked|API key not valid|permission_denied/i.test(msg)) {
      return new UnauthorizedException(
        'Gemini API key invalid or revoked. Rotate it in Google AI Studio and update backend/.env.local.',
      );
    }
    if (status === 404 || /is not supported for generateContent/i.test(msg)) {
      return new InternalServerErrorException(
        `Gemini model "${this.primaryModel}" is not available on this key. Set GEMINI_VISION_MODEL to one that is.`,
      );
    }
    if (status === 503 || err instanceof RequestTimeoutError || /high demand|UNAVAILABLE|overloaded/i.test(msg)) {
      return new ServiceUnavailableException(
        'Gemini is busy right now and did not respond in time. That usually clears in a minute - try again.',
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

/**
 * The SDK surfaces the HTTP status inconsistently: a typed `status` on fetch
 * errors, otherwise only embedded in the JSON message body. Check both before
 * concluding a failure is not retryable.
 */
function statusOf(err: unknown): number {
  const typed = (err as { status?: unknown })?.status;
  if (typeof typed === 'number') return typed;
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"code"\s*:\s*(\d{3})/) ?? message.match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : 0;
}

/**
 * A 429 means two very different things: "you are going too fast, pause a
 * second" or "you have spent the whole day's allowance". Only the first is
 * worth retrying, and they need different advice.
 */
function isDailyQuota(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /PerDay|free_tier|RESOURCE_EXHAUSTED/i.test(message);
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function sumOf(items: AnalyzedItem[], key: keyof AnalyzedItem): number {
  const total = items.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
  return Math.round(total * 10) / 10;
}
