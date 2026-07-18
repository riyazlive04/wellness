import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import { PrismaService } from '../database/prisma.service';
import { UsageService } from '../usage/usage.service';
import { MEAL_SLOTS, MealSlot } from './meal-plans.types';

/** Deterministic-ish and long enough for 7 days of meals. */
const PLAN_CONFIG = {
  temperature: 0.7,
  maxOutputTokens: 8192,
  responseMimeType: 'application/json',
} as unknown as GenerationConfig;

interface GeneratedCard {
  day_number: number;
  meal_type: MealSlot;
  meal_name: string;
  description?: string;
  kcal: number;
  ingredients?: string;
}

/**
 * Drafts a week of meals from the client's profile. The output is always a
 * DRAFT the nutritionist edits — never published automatically. This is a
 * clinical product; an AI plan reaching a client unreviewed is not acceptable.
 */
@Injectable()
export class MealPlanAiService implements OnModuleInit {
  private readonly logger = new Logger(MealPlanAiService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private static readonly MODEL = 'gemini-2.5-flash';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set - AI meal-plan generation disabled.');
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  get isConfigured(): boolean {
    return this.genAI !== null;
  }

  async generate(params: {
    workspaceId: string;
    clientId: string;
    slots: MealSlot[];
    notes?: string;
  }): Promise<GeneratedCard[]> {
    if (!this.genAI) {
      throw new BadRequestException(
        'AI generation is not configured on this server (GEMINI_API_KEY is unset).',
      );
    }

    const quota = await this.usage.checkQuota(params.workspaceId);
    if (quota.exceeded) {
      throw new BadRequestException(
        `This workspace has reached its monthly AI limit (${quota.limit} requests). It resets next month.`,
      );
    }

    const [client] = await this.prisma.$queryRawUnsafe<
      Array<{
        name: string; age: number | null; gender: string | null;
        goals: string | null; target_kcal: number | null; allergies: string | null;
        medical_conditions: string | null; food_preferences: string | null;
        activity_level: string | null;
      }>
    >(
      `SELECT name, age, gender::text AS gender, goals, target_kcal, allergies,
              medical_conditions, food_preferences, activity_level::text AS activity_level
         FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid
        LIMIT 1`,
      params.clientId,
      params.workspaceId,
    );
    if (!client) throw new BadRequestException('Client not found');

    const slots = params.slots.filter((s) => MEAL_SLOTS.includes(s));
    if (!slots.length) throw new BadRequestException('Pick at least one meal slot');

    const prompt = this.buildPrompt(client, slots, params.notes);
    const t0 = Date.now();

    try {
      const model = this.genAI.getGenerativeModel({
        model: MealPlanAiService.MODEL,
        generationConfig: PLAN_CONFIG,
      });
      const result = await model.generateContent(prompt);
      const raw = result.response.text();

      void this.usage.record({
        service: 'chat',
        provider: 'gemini',
        model: MealPlanAiService.MODEL,
        workspaceId: params.workspaceId,
        latencyMs: Date.now() - t0,
        status: 'success',
        totalTokens: result.response.usageMetadata?.totalTokenCount ?? 0,
        metadata: { feature: 'meal_plan_generate', client_id: params.clientId },
      });

      return this.parse(raw, slots);
    } catch (err) {
      void this.usage.record({
        service: 'chat',
        provider: 'gemini',
        model: MealPlanAiService.MODEL,
        workspaceId: params.workspaceId,
        latencyMs: Date.now() - t0,
        status: 'error',
        errorCode: (err as Error).message?.slice(0, 100),
        metadata: { feature: 'meal_plan_generate', client_id: params.clientId },
      });
      throw err;
    }
  }

  private buildPrompt(
    c: {
      name: string; age: number | null; gender: string | null; goals: string | null;
      target_kcal: number | null; allergies: string | null; medical_conditions: string | null;
      food_preferences: string | null; activity_level: string | null;
    },
    slots: MealSlot[],
    notes?: string,
  ): string {
    const facts = [
      c.age && `Age: ${c.age}`,
      c.gender && `Gender: ${c.gender}`,
      c.activity_level && `Activity: ${c.activity_level}`,
      c.goals && `Goals: ${c.goals}`,
      c.target_kcal && `Daily calorie target: ${c.target_kcal} kcal`,
      c.allergies && `ALLERGIES (must avoid): ${c.allergies}`,
      c.medical_conditions && `Medical conditions: ${c.medical_conditions}`,
      c.food_preferences && `Food preferences: ${c.food_preferences}`,
    ].filter(Boolean).join('\n');

    return [
      'You are an experienced Indian clinical nutritionist writing a 7-day meal plan.',
      '',
      'CLIENT',
      facts || '(no profile details recorded)',
      notes ? `\nNUTRITIONIST NOTES (follow these closely):\n${notes}` : '',
      '',
      'RULES',
      '- Cover days 1 through 7, and exactly these meal slots each day: ' + slots.join(', '),
      '- Respect allergies absolutely. Never include an allergen, or anything containing it.',
      '- Honour the food preferences (e.g. vegetarian means no meat, fish or egg).',
      c.target_kcal
        ? `- Each day's kcal across all slots should total roughly ${c.target_kcal} (±10%).`
        : '- Keep each day nutritionally balanced and realistic.',
      '- Prefer everyday Indian home foods; keep portions concrete (e.g. "2 rotis", "1 katori dal").',
      '- Vary meals across the week - do not repeat the same dish every day.',
      '',
      'OUTPUT',
      'Return ONLY a JSON array. Each element:',
      '{"day_number":1-7,"meal_type":"<one of the slots above>","meal_name":"short name",' +
        '"description":"one line","kcal":number,"ingredients":"comma-separated"}',
      'No markdown, no commentary - just the JSON array.',
    ].join('\n');
  }

  /**
   * The model returns JSON, but "returns JSON" is not a guarantee — bad rows are
   * dropped rather than allowed to fail the whole generation, since a plan with
   * 34 of 35 meals is still useful to a nutritionist who is going to edit it.
   */
  private parse(raw: string, slots: MealSlot[]): GeneratedCard[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim().replace(/^```(?:json)?|```$/g, '').trim());
    } catch {
      throw new BadRequestException('The AI returned something we could not read. Try again.');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('The AI returned an unexpected shape. Try again.');
    }

    const out: GeneratedCard[] = [];
    for (const row of parsed) {
      const r = row as Partial<GeneratedCard>;
      const day = Number(r.day_number);
      const kcal = Number(r.kcal);
      if (!Number.isInteger(day) || day < 1 || day > 7) continue;
      if (!r.meal_type || !slots.includes(r.meal_type)) continue;
      if (!r.meal_name || typeof r.meal_name !== 'string') continue;
      out.push({
        day_number: day,
        meal_type: r.meal_type,
        meal_name: r.meal_name.slice(0, 200),
        description: typeof r.description === 'string' ? r.description.slice(0, 500) : undefined,
        kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : 0,
        ingredients: typeof r.ingredients === 'string' ? r.ingredients.slice(0, 1000) : undefined,
      });
    }
    if (!out.length) {
      throw new BadRequestException('The AI did not return any usable meals. Try again.');
    }
    return out;
  }
}
