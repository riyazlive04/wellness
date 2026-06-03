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
import { UsageService } from '../usage/usage.service';

export interface NutritionMacros {
  calories: number; // kcal
  protein: number;  // g
  carbs: number;    // g
  fat: number;      // g
  fiber?: number;   // g
}

export interface DetectedItem {
  id: string;
  name: string;
  portionG: number;
  confidence: number;
  source: 'IFCT' | 'USDA' | 'custom';
  macros: NutritionMacros;
  box?: { x: number; y: number; w: number; h: number };
}

export interface AnalyzeResult {
  items: DetectedItem[];
  totalMacros: NutritionMacros;
  latencyMs: number;
  /** True if Gemini's bounding-box estimates were usable. */
  hasBoxes: boolean;
}

const SYSTEM_PROMPT = `You are SIRAH Plate Vision — a nutrition AI that looks at a food photo and produces structured macro estimates.

For the image, do all of:
1. List every distinct food item visible.
2. For each item, estimate portion in grams based on visual cues (plate diameter ~ 25cm, hands ~ 18cm wide, standard utensils).
3. Estimate nutrition macros per item (calories kcal, protein g, carbs g, fat g, optional fiber g) using common nutrition data for that food.
4. Score your confidence 0..1 per item.
5. Optionally: estimate a bounding box per item in % of image (x, y from top-left, w, h). Use null if uncertain.

Respond ONLY with a JSON object of this exact shape — no markdown, no commentary:
{
  "items": [
    {
      "name": "string, short common name (e.g. 'Chapati', 'Dal Tadka', 'Basmati Rice')",
      "portionG": number,
      "confidence": number,
      "source": "custom",
      "macros": { "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number | null },
      "box": { "x": number, "y": number, "w": number, "h": number } | null
    }
  ]
}

Be conservative — if you're unsure something IS food, omit it. If the image isn't food at all, return { "items": [] }.`;

@Injectable()
export class AiVisionService implements OnModuleInit {
  private readonly logger = new Logger(AiVisionService.name);
  private model!: GenerativeModel;

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — vision endpoint will fail at request time.');
      return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    this.logger.log('Gemini 2.5 Flash vision client ready.');
  }

  async analyze(image: Buffer, mimeType: string): Promise<AnalyzeResult> {
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
            data: image.toString('base64'),
            mimeType,
          },
        },
      ]);
    } catch (err: unknown) {
      void this.usage.record({
        service: 'vision',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        latencyMs: Date.now() - t0,
        status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
      });
      throw this.mapGeminiError(err);
    }
    const text = result.response.text();
    const latencyMs = Date.now() - t0;
    const usageMeta = result.response.usageMetadata;
    void this.usage.record({
      service: 'vision',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: usageMeta?.promptTokenCount ?? null,
      outputTokens: usageMeta?.candidatesTokenCount ?? null,
      totalTokens: usageMeta?.totalTokenCount ?? null,
      latencyMs,
      status: 'success',
    });

    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(`Gemini returned non-JSON. Raw: ${text.slice(0, 200)}…`);
      return { items: [], totalMacros: zeroMacros(), latencyMs, hasBoxes: false };
    }

    const items = this.normalizeItems(parsed.items);
    const hasBoxes = items.some((it) => it.box !== undefined);
    const totalMacros = items.reduce<NutritionMacros>(
      (acc, it) => ({
        calories: round1(acc.calories + it.macros.calories),
        protein:  round1(acc.protein  + it.macros.protein),
        carbs:    round1(acc.carbs    + it.macros.carbs),
        fat:      round1(acc.fat      + it.macros.fat),
        fiber:    round1((acc.fiber ?? 0) + (it.macros.fiber ?? 0)),
      }),
      zeroMacros(),
    );
    return { items, totalMacros, latencyMs, hasBoxes };
  }

  // Coerce Gemini's response into our strict shape; drop malformed items.
  private normalizeItems(raw: unknown): DetectedItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r, i): DetectedItem | null => {
        if (!r || typeof r !== 'object') return null;
        const obj = r as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name.trim() : '';
        if (!name) return null;
        const m = (obj.macros ?? {}) as Record<string, unknown>;
        const macros: NutritionMacros = {
          calories: numOr(m.calories, 0),
          protein:  numOr(m.protein,  0),
          carbs:    numOr(m.carbs,    0),
          fat:      numOr(m.fat,      0),
          fiber:    m.fiber == null ? undefined : numOr(m.fiber, 0),
        };
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
        return {
          id: `i_${Date.now()}_${i}`,
          name,
          portionG: clamp(numOr(obj.portionG, 0), 0, 2000),
          confidence: clamp(numOr(obj.confidence, 0.5), 0, 1),
          source: 'custom',
          macros,
          box,
        };
      })
      .filter((x): x is DetectedItem => x !== null);
  }

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

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function zeroMacros(): NutritionMacros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}
