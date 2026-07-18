import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { CacheService } from '../common/cache/cache.service';
import type { FoodCategory, HealthCondition, HealthSpec, NutrientPanel } from './nutrition.types';

/** The nutrient fields the rule engine reads (all per 100g, all optional). */
type N = Partial<NutrientPanel>;

/**
 * HealthSpecService — derives a food's health/suitability profile.
 *
 * The structured part ("good for which conditions", benefits, cautions) is a
 * transparent, evidence-based RULE engine over the food's own per-100g nutrient
 * panel — no fabricated, per-food medical claims, and it covers every food in
 * the library automatically. A short plain-language summary is written by Gemini
 * when configured (cached), falling back to a deterministic sentence otherwise.
 *
 * Safety: this is general nutrition information, never medical advice. Nothing
 * here claims to cure, treat, or prevent disease.
 */
@Injectable()
export class HealthSpecService {
  private readonly logger = new Logger(HealthSpecService.name);
  private model: GenerativeModel | null = null;

  private static readonly AI_MODEL = 'gemini-2.5-flash';
  private static readonly SUMMARY_TTL = 7 * 24 * 3600; // 7 days
  private static readonly SUMMARY_KEY_VERSION = 'v1';
  static readonly DISCLAIMER =
    'General nutrition information based on nutrient content - not medical advice. ' +
    'Anyone managing a health condition should consult a qualified professional.';
  /** Words that would turn information into a medical claim — reject if the AI uses them. */
  private static readonly UNSAFE = /\b(cure|cures|treat|treats|heal|heals|reverse|prevents?)\b/i;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      try {
        this.model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
          model: HealthSpecService.AI_MODEL,
        });
      } catch (e) {
        this.logger.warn(`Gemini init failed; summaries will be composed locally: ${(e as Error).message}`);
      }
    }
  }

  // ── Rule engine (pure) ─────────────────────────────────────────────────

  /** Structured profile derived purely from the nutrient panel. */
  derive(n: N, _category: FoodCategory): Pick<HealthSpec, 'good_for' | 'benefits' | 'cautions'> {
    const good_for: HealthCondition[] = [];
    const benefits: string[] = [];
    const cautions: string[] = [];

    const has = (v: number | null | undefined, t: number): boolean => v != null && v >= t;
    const lte = (v: number | null | undefined, t: number): boolean => v != null && v <= t;
    const unsat = (n.mufa_g ?? 0) + (n.pufa_g ?? 0);

    // ── good_for conditions ──
    if ((has(n.fiber_g, 5) && (n.glycemic_index == null || n.glycemic_index <= 55)) || lte(n.glycemic_index, 45)) {
      good_for.push({ label: 'Blood-sugar control', reason: 'high fibre and a low glycemic impact' });
    }
    if ((has(n.potassium_mg, 300) && (n.sodium_mg == null || n.sodium_mg <= 120))) {
      good_for.push({ label: 'Heart & blood pressure', reason: 'potassium-rich and low in sodium' });
    } else if (unsat > (n.saturated_fat_g ?? 0) * 1.2 && lte(n.saturated_fat_g, 3) && has(n.fat_g, 5)) {
      good_for.push({ label: 'Heart health', reason: 'mostly healthy unsaturated fats' });
    }
    if (has(n.iron_mg, 3)) {
      good_for.push({
        label: 'Iron / anaemia support',
        reason: has(n.vit_c_mg, 10) ? 'good iron with vitamin C to aid absorption' : 'a good source of iron',
      });
    }
    if (has(n.calcium_mg, 120)) {
      good_for.push({ label: 'Bone health', reason: 'rich in calcium' });
    } else if (has(n.magnesium_mg, 70)) {
      good_for.push({ label: 'Bone & muscle health', reason: 'a good source of magnesium' });
    }
    if (has(n.vit_c_mg, 15) || has(n.zinc_mg, 2.5) || has(n.vit_a_mcg_rae, 150)) {
      good_for.push({ label: 'Immune support', reason: 'supplies immune-supporting vitamins/minerals' });
    }
    if (has(n.fiber_g, 6)) {
      good_for.push({ label: 'Digestive health', reason: 'very high in dietary fibre' });
    }
    if (lte(n.energy_kcal, 60) && (n.fiber_g == null || n.fiber_g >= 2) && lte(n.fat_g, 3)) {
      good_for.push({ label: 'Weight management', reason: 'low in calories and filling' });
    }
    if (has(n.protein_g, 8)) {
      good_for.push({ label: 'Muscle building & recovery', reason: 'high in protein' });
    }
    if (has(n.vit_a_mcg_rae, 200)) {
      good_for.push({ label: 'Eye health', reason: 'rich in vitamin A' });
    }
    if (has(n.vit_b9_folate_mcg, 50)) {
      good_for.push({ label: 'Pregnancy / folate', reason: 'a good source of folate' });
    }
    if (has(n.iodine_mcg, 30)) {
      good_for.push({ label: 'Thyroid support', reason: 'a source of iodine' });
    }

    // ── benefits ──
    if (has(n.protein_g, 8)) benefits.push('High in protein');
    if (has(n.fiber_g, 5)) benefits.push('High in dietary fibre');
    if (has(n.iron_mg, 3)) benefits.push('Good source of iron');
    if (has(n.calcium_mg, 120)) benefits.push('Rich in calcium');
    if (has(n.potassium_mg, 300)) benefits.push('Potassium-rich');
    if (has(n.magnesium_mg, 60)) benefits.push('Magnesium source');
    if (has(n.vit_c_mg, 15)) benefits.push('Vitamin C source');
    if (has(n.vit_a_mcg_rae, 150)) benefits.push('Vitamin A source');
    if (has(n.vit_b9_folate_mcg, 50)) benefits.push('Folate source');
    if (unsat > (n.saturated_fat_g ?? 0) && has(n.fat_g, 5) && lte(n.saturated_fat_g, 3)) benefits.push('Healthy unsaturated fats');
    if (lte(n.energy_kcal, 50)) benefits.push('Low calorie');

    // ── cautions ──
    if (has(n.sodium_mg, 400)) cautions.push('High in sodium - limit if hypertensive');
    if (has(n.saturated_fat_g, 5)) cautions.push('High in saturated fat');
    if (has(n.sugar_g, 15)) cautions.push('High in sugar');
    if (has(n.glycemic_index, 70)) cautions.push('High glycemic index - pair with fibre/protein');
    if (has(n.energy_kcal, 350)) cautions.push('Calorie-dense - watch portion size');
    if (has(n.cholesterol_mg, 150)) cautions.push('High in dietary cholesterol');
    if (has(n.trans_fat_g, 0.5)) cautions.push('Contains trans fat');

    return { good_for, benefits, cautions };
  }

  /** Just the top condition labels — used for compact list/card chips. */
  conditionLabels(n: N, category: FoodCategory, max = 2): string[] {
    return this.derive(n, category).good_for.slice(0, max).map((c) => c.label);
  }

  /** Full profile including the plain-language summary (AI when available). */
  async fullSpec(
    food: { id: string; canonical_name: string },
    n: N,
    category: FoodCategory,
  ): Promise<HealthSpec> {
    const { good_for, benefits, cautions } = this.derive(n, category);
    const summary = await this.summary(food, good_for, benefits, cautions);
    return { summary, good_for, benefits, cautions, disclaimer: HealthSpecService.DISCLAIMER };
  }

  // ── Summary (AI + cache + deterministic fallback) ──────────────────────

  private async summary(
    food: { id: string; canonical_name: string },
    goodFor: HealthCondition[],
    benefits: string[],
    cautions: string[],
  ): Promise<string> {
    const key = `food:health:summary:${HealthSpecService.SUMMARY_KEY_VERSION}:${food.id}`;
    const cached = await this.cache.get<string>(key);
    if (cached) return cached;

    const fallback = this.composeSummary(food.canonical_name, goodFor, benefits);
    let text = fallback;

    if (this.model && (goodFor.length || benefits.length)) {
      try {
        const prompt = this.buildPrompt(food.canonical_name, goodFor, benefits, cautions);
        const res = await this.model.generateContent(prompt);
        const out = res.response.text().trim().replace(/^["']|["']$/g, '');
        // Reject anything that drifts into medical-claim territory.
        if (out && out.length <= 320 && !HealthSpecService.UNSAFE.test(out)) {
          text = out;
        }
      } catch (e) {
        this.logger.warn(`Gemini summary failed for ${food.canonical_name}: ${(e as Error).message}`);
      }
    }

    await this.cache.set(key, text, HealthSpecService.SUMMARY_TTL);
    return text;
  }

  private buildPrompt(
    name: string,
    goodFor: HealthCondition[],
    benefits: string[],
    cautions: string[],
  ): string {
    return [
      `Write ONE warm, plain-language sentence (max 30 words) about the food "${name}" for a nutrition app.`,
      'Base it ONLY on these facts derived from its nutrient profile:',
      `- Generally good for: ${goodFor.map((g) => g.label).join(', ') || 'a balanced diet'}`,
      `- Notable nutrients: ${benefits.join(', ') || 'none standout'}`,
      cautions.length ? `- Eat mindfully because: ${cautions.join(', ')}` : '',
      '',
      'Rules: Use phrasing like "is a good source of", "may support", "helpful for".',
      'NEVER say it cures, treats, heals, reverses, or prevents any disease.',
      'Return only the sentence - no preamble, no quotes, no lists.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Deterministic sentence used when AI is unavailable or rejected. */
  private composeSummary(name: string, goodFor: HealthCondition[], benefits: string[]): string {
    if (!goodFor.length && !benefits.length) {
      return `${name} is a balanced everyday food - enjoy it as part of a varied diet.`;
    }
    const lead = benefits.length
      ? `${name} is ${benefits.slice(0, 2).map((b) => b.toLowerCase()).join(' and ')}`
      : `${name}`;
    if (!goodFor.length) return `${lead}.`;
    const conditions = goodFor.slice(0, 3).map((g) => g.label.toLowerCase()).join(', ');
    return `${lead}, which can make it helpful for ${conditions}.`;
  }
}