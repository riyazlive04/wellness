import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { CacheService } from '../common/cache/cache.service';

export interface IngredientGuess {
  /** Short ingredient names, most important first. */
  ingredients: string[];
  /** Plain-language caveat about how this list was produced. */
  note: string;
}

/**
 * IngredientsService — the *typical* ingredients used to make a dish.
 *
 * The food master (IFCT) stores a dish as a single nutrition row — it has no
 * recipe/ingredient breakdown. So this service produces a typical ingredient
 * list for a named dish: written by Gemini when configured (cached 30 days),
 * with a deterministic dictionary fallback for common Indian foods.
 *
 * This is informational ("a common recipe uses…"), never an exact recipe —
 * the note makes that explicit.
 */
@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);
  private model: GenerativeModel | null = null;

  private static readonly AI_MODEL = 'gemini-2.5-flash';
  private static readonly TTL = 30 * 24 * 3600; // 30 days
  private static readonly KEY_VERSION = 'v1';
  private static readonly NOTE =
    'Typical ingredients for a common recipe - actual ingredients vary by how it was prepared.';

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      try {
        this.model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
          model: IngredientsService.AI_MODEL,
        });
      } catch (e) {
        this.logger.warn(`Gemini init failed; ingredient lists will use the local dictionary: ${(e as Error).message}`);
      }
    }
  }

  /** Typical ingredients for a named dish (cached). */
  async forFood(name: string, _category?: string): Promise<IngredientGuess> {
    const clean = (name ?? '').trim();
    if (!clean) return { ingredients: [], note: '' };

    const key = `food:ingredients:${IngredientsService.KEY_VERSION}:${clean.toLowerCase()}`;
    const cached = await this.cache.get<IngredientGuess>(key);
    if (cached) return cached;

    let ingredients = this.fallback(clean);

    if (this.model) {
      try {
        const res = await this.model.generateContent(this.buildPrompt(clean));
        const parsed = this.parseList(res.response.text());
        if (parsed.length) ingredients = parsed;
      } catch (e) {
        this.logger.warn(`Gemini ingredients failed for "${clean}": ${(e as Error).message}`);
      }
    }

    const result: IngredientGuess = {
      ingredients,
      note: ingredients.length ? IngredientsService.NOTE : 'Ingredients vary by recipe.',
    };
    await this.cache.set(key, result, IngredientsService.TTL);
    return result;
  }

  private buildPrompt(name: string): string {
    return [
      `List the typical ingredients used to make the food/dish "${name}".`,
      'Return ONLY a JSON array of short ingredient names (strings), most important first, max 10 items.',
      'No quantities, no cooking steps, no preamble, no markdown.',
      'Example: ["Whole wheat flour","Water","Salt","Oil"]',
    ].join('\n');
  }

  /** Extract a clean string[] from the model output (tolerates code fences / prose). */
  private parseList(raw: string): string[] {
    const text = (raw ?? '').trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];
    try {
      const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x.length > 0 && x.length <= 60)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  /** Deterministic list for common dishes when AI is unavailable. */
  private fallback(name: string): string[] {
    const dict: Array<[RegExp, string[]]> = [
      [/chapat|chapathi|roti|phulka/i, ['Whole wheat flour (atta)', 'Water', 'Salt', 'Oil']],
      [/naan/i, ['Refined flour (maida)', 'Yogurt', 'Yeast', 'Milk', 'Salt', 'Oil']],
      [/poori|puri/i, ['Whole wheat flour', 'Water', 'Salt', 'Oil (for frying)']],
      [/paratha/i, ['Whole wheat flour', 'Water', 'Salt', 'Ghee or oil']],
      [/idli/i, ['Rice', 'Urad dal', 'Salt', 'Water']],
      [/dosa|uttapam/i, ['Rice', 'Urad dal', 'Fenugreek seeds', 'Salt']],
      [/chana|chole|chickpea/i, ['Chickpeas', 'Onion', 'Tomato', 'Ginger-garlic', 'Spices', 'Oil']],
      [/rajma|kidney bean/i, ['Kidney beans', 'Onion', 'Tomato', 'Ginger-garlic', 'Spices', 'Oil']],
      [/sambar/i, ['Toor dal', 'Tamarind', 'Mixed vegetables', 'Sambar powder', 'Mustard seeds', 'Oil']],
      [/dal|dhal|lentil/i, ['Lentils', 'Onion', 'Tomato', 'Turmeric', 'Spices', 'Oil']],
      [/biryani|pulao|pilaf/i, ['Basmati rice', 'Onion', 'Spices', 'Yogurt', 'Ghee or oil', 'Herbs']],
      [/fried rice/i, ['Rice', 'Vegetables', 'Soy sauce', 'Oil', 'Spring onion']],
      [/rice/i, ['Rice', 'Water', 'Salt']],
      [/paneer/i, ['Paneer', 'Onion', 'Tomato', 'Cream', 'Spices', 'Oil']],
      [/butter chicken|murgh makhani/i, ['Chicken', 'Tomato', 'Butter', 'Cream', 'Spices']],
      [/chicken curry|chicken masala/i, ['Chicken', 'Onion', 'Tomato', 'Ginger-garlic', 'Spices', 'Oil']],
      [/curd|yogurt|raita/i, ['Yogurt', 'Salt', 'Spices']],
      [/upma/i, ['Semolina (rava)', 'Onion', 'Mustard seeds', 'Curry leaves', 'Oil']],
      [/poha/i, ['Flattened rice (poha)', 'Onion', 'Mustard seeds', 'Turmeric', 'Peanuts', 'Oil']],
      [/omelette|omelet|egg/i, ['Eggs', 'Onion', 'Salt', 'Oil']],
      [/salad/i, ['Mixed vegetables', 'Lemon', 'Salt']],
    ];
    for (const [re, list] of dict) if (re.test(name)) return list;
    return [];
  }
}
