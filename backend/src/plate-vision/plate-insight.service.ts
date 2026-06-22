import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { UsageService } from '../usage/usage.service';
import type { ClientGoalContext, PlateInsight, PlateTotals } from './plate-vision.types';

/**
 * PlateInsightService — turns the engine's (already-computed) plate totals into
 * a goal-based, human-readable insight.
 *
 * HARD RULE: the insight only INTERPRETS the numbers it is given. It never
 * changes a value, never invents a nutrient, never produces its own calorie
 * count. The numbers come from CalculatorService (IFCT/USDA); the model only
 * reasons about balance, adequacy vs. the client's goal, and suggestions.
 *
 * Degrades gracefully: if GEMINI_API_KEY is unset or the call fails, a
 * deterministic rule-based insight is computed from the same numbers, so the
 * feature works with zero AI dependency.
 */
@Injectable()
export class PlateInsightService implements OnModuleInit {
  private readonly logger = new Logger(PlateInsightService.name);
  private model: GenerativeModel | null = null;
  private static readonly AI_MODEL = 'gemini-2.5-flash';

  constructor(
    private readonly config: ConfigService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — plate insights will use the rule-based fallback.');
      return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: PlateInsightService.AI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    });
  }

  /**
   * Generate an insight for a plate. Always resolves — never throws — so a
   * logging request is never blocked by the AI step.
   */
  async generate(input: {
    totals: PlateTotals;
    items: Array<{ name: string; kcal: number }>;
    mealType: string;
    client: ClientGoalContext;
  }): Promise<PlateInsight> {
    // No resolved nutrition → nothing meaningful to interpret.
    if (input.totals.energy_kcal <= 0) {
      return {
        summary: 'No nutrition could be computed for this plate yet — the items need manual resolution.',
        macro_balance: { protein: 'unknown', carbohydrate: 'unknown', fat: 'unknown' },
        suggestions: ['Resolve the flagged items so nutrition can be calculated.'],
        flags: ['unresolved_items'],
        score: null,
        source: 'rule',
      };
    }

    // Over the monthly AI quota → use the deterministic rule insight (same
    // numbers), so logging never breaks and cost stays bounded.
    const overQuota = (await this.usage.checkQuota()).exceeded;
    if (this.model && !overQuota) {
      try {
        return await this.generateWithAi(input);
      } catch (err) {
        this.logger.warn(`AI insight failed, falling back to rule-based: ${(err as Error).message}`);
      }
    }
    return ruleInsight(input.totals, input.client);
  }

  private async generateWithAi(input: {
    totals: PlateTotals;
    items: Array<{ name: string; kcal: number }>;
    mealType: string;
    client: ClientGoalContext;
  }): Promise<PlateInsight> {
    const macro = macroEnergyShares(input.totals);
    // We hand the model the FINAL numbers + derived shares. It must not change them.
    const prompt = JSON.stringify({
      instruction:
        'Interpret these already-computed nutrition numbers for the client. Do NOT change or invent any numbers.',
      meal_type: input.mealType,
      totals: input.totals,
      macro_energy_percent: macro,
      foods: input.items,
      client_goal: {
        daily_target_kcal: input.client.target_kcal,
        goal_text: input.client.goals,
        activity_level: input.client.activity_level,
      },
    });

    const t0 = Date.now();
    let result;
    try {
      result = await this.model!.generateContent(prompt);
    } catch (err) {
      void this.usage.record({
        service: 'vision',
        provider: 'gemini',
        model: PlateInsightService.AI_MODEL,
        latencyMs: Date.now() - t0,
        status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
        metadata: { feature: 'plate_insight' },
      });
      throw err;
    }
    const usageMeta = result.response.usageMetadata;
    void this.usage.record({
      service: 'vision',
      provider: 'gemini',
      model: PlateInsightService.AI_MODEL,
      inputTokens: usageMeta?.promptTokenCount ?? null,
      outputTokens: usageMeta?.candidatesTokenCount ?? null,
      totalTokens: usageMeta?.totalTokenCount ?? null,
      latencyMs: Date.now() - t0,
      status: 'success',
      metadata: { feature: 'plate_insight' },
    });

    const parsed = JSON.parse(result.response.text()) as Partial<PlateInsight>;

    return {
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : ruleInsight(input.totals, input.client).summary,
      macro_balance: {
        protein: strOr(parsed.macro_balance?.protein, label(macro.protein_pct)),
        carbohydrate: strOr(parsed.macro_balance?.carbohydrate, label(macro.carbohydrate_pct)),
        fat: strOr(parsed.macro_balance?.fat, label(macro.fat_pct)),
      },
      suggestions: cleanList(parsed.suggestions),
      flags: cleanList(parsed.flags),
      score: clampScore(parsed.score) ?? ruleScore(input.totals, input.client),
      source: 'ai',
    };
  }
}

// ─── Gemini prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are SIRAH Plate Insight — a clinical nutrition assistant.

You receive nutrition numbers that were ALREADY computed by an authoritative
deterministic engine (IFCT 2017 / USDA FDC). These numbers are final and correct.

ABSOLUTE RULES:
- NEVER change, recompute, round differently, or invent any nutrition number.
- NEVER state a calorie or macro value the input did not give you.
- Only INTERPRET: comment on macro balance, adequacy for the meal type and the
  client's goal, and give practical, non-prescriptive suggestions.
- Be concise, supportive, and specific to the foods present.

Respond ONLY with JSON, no markdown:
{
  "summary": "1-2 sentence plain-language read of this plate vs the client's goal",
  "macro_balance": { "protein": "low|balanced|high", "carbohydrate": "low|balanced|high", "fat": "low|balanced|high" },
  "suggestions": ["short actionable tip", "..."],
  "flags": ["short risk flag like high_saturated_fat or low_protein", "..."],
  "score": number  // 0-100, how well this plate supports the client's goal
}`;

// ─── Deterministic fallback + shared math ───────────────────────────

/** AMDR-based macro energy shares (% of energy from each macro). */
function macroEnergyShares(t: PlateTotals): {
  protein_pct: number;
  carbohydrate_pct: number;
  fat_pct: number;
} {
  const e = t.energy_kcal > 0 ? t.energy_kcal : 1;
  return {
    protein_pct: round1((t.protein_g * 4 * 100) / e),
    carbohydrate_pct: round1((t.carbohydrate_g * 4 * 100) / e),
    fat_pct: round1((t.fat_g * 9 * 100) / e),
  };
}

/** Acceptable Macronutrient Distribution Ranges (% energy). */
const AMDR = {
  protein: [10, 35],
  carbohydrate: [45, 65],
  fat: [20, 35],
} as const;

function label(pct: number, range?: readonly [number, number]): string {
  if (!range) return 'balanced';
  if (pct < range[0]) return 'low';
  if (pct > range[1]) return 'high';
  return 'balanced';
}

function ruleInsight(totals: PlateTotals, client: ClientGoalContext): PlateInsight {
  const macro = macroEnergyShares(totals);
  const pBal = label(macro.protein_pct, AMDR.protein);
  const cBal = label(macro.carbohydrate_pct, AMDR.carbohydrate);
  const fBal = label(macro.fat_pct, AMDR.fat);

  const suggestions: string[] = [];
  const flags: string[] = [];
  if (pBal === 'low') {
    suggestions.push('Add a protein source (dal, paneer, egg, curd, or lean meat) to balance this meal.');
    flags.push('low_protein');
  }
  if (fBal === 'high') {
    suggestions.push('This plate is fat-dense — go lighter on oil/ghee or fried items next time.');
    flags.push('high_fat');
  }
  if (cBal === 'high') {
    suggestions.push('Carbohydrates dominate the energy here — pair with more vegetables and protein.');
  }
  if ((totals.fiber_g ?? 0) < 5) {
    suggestions.push('Fibre looks low — add vegetables, salad, or whole grains.');
  }

  let summary: string;
  if (client.target_kcal) {
    const share = Math.round((totals.energy_kcal / client.target_kcal) * 100);
    summary = `This plate is ${totals.energy_kcal} kcal — about ${share}% of the daily ${client.target_kcal} kcal target. `
      + `Macros: protein ${macro.protein_pct}%, carbs ${macro.carbohydrate_pct}%, fat ${macro.fat_pct}% of energy.`;
  } else {
    summary = `This plate is ${totals.energy_kcal} kcal, with protein ${macro.protein_pct}%, `
      + `carbs ${macro.carbohydrate_pct}%, and fat ${macro.fat_pct}% of energy.`;
  }
  if (suggestions.length === 0) suggestions.push('Well-balanced plate — keep it up.');

  return {
    summary,
    macro_balance: { protein: pBal, carbohydrate: cBal, fat: fBal },
    suggestions,
    flags,
    score: ruleScore(totals, client),
    source: 'rule',
  };
}

/**
 * A 0..100 quality score: how close the plate's macro split sits to the centre
 * of the AMDR bands. Goal-target adherence isn't scored here (a single meal
 * isn't a full day) — this scores macro balance.
 */
function ruleScore(totals: PlateTotals, _client: ClientGoalContext): number {
  const macro = macroEnergyShares(totals);
  const dev = (pct: number, [lo, hi]: readonly [number, number]): number => {
    const mid = (lo + hi) / 2;
    const halfWidth = (hi - lo) / 2;
    return Math.min(1, Math.abs(pct - mid) / (halfWidth || 1));
  };
  const avgDev =
    (dev(macro.protein_pct, AMDR.protein) +
      dev(macro.carbohydrate_pct, AMDR.carbohydrate) +
      dev(macro.fat_pct, AMDR.fat)) / 3;
  return Math.round((1 - avgDev) * 100);
}

// ─── tiny helpers ───────────────────────────────────────────────────

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}
function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, 6);
}
function clampScore(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}
