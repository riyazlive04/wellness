import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CalculatorService } from '../nutrition-engine/calculator.service';
import {
  ENGINE_VERSION,
  type CookingMethodCode,
  type NutrientPanel,
} from '../nutrition-engine/nutrition.types';
import { PlateInsightService } from './plate-insight.service';
import {
  MEAL_TYPES,
  type ClientGoalContext,
  type ItemResolutionStatus,
  type LogPlateInput,
  type PlateInsight,
  type PlateItem,
  type PlateMeal,
  type PlateReviewStatus,
  type PlateTotals,
  type ReviewInput,
  type ReviewQueueItem,
} from './plate-vision.types';

const AI_MODEL = 'gemini-2.5-flash';
const EMPTY_TOTALS: PlateTotals = {
  energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0, fiber_g: null,
};

/**
 * PlateVisionService — persistence + review for the Plate Vision pipeline.
 *
 * Logging re-runs the deterministic engine from (food_id, quantity_g,
 * cooking_method) server-side; client-supplied nutrition is never trusted. Each
 * item becomes a meal_logs row with a frozen snapshot + audit_id; the plate
 * gets a plate_vision_meals parent with frozen aggregate totals, a goal-based
 * insight, and the nutritionist review state.
 */
@Injectable()
export class PlateVisionService {
  private readonly logger = new Logger(PlateVisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: CalculatorService,
    private readonly insights: PlateInsightService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  // Logging (client)
  // ────────────────────────────────────────────────────────────────────

  async logPlate(userId: string, input: LogPlateInput): Promise<PlateMeal> {
    if (!(MEAL_TYPES as readonly string[]).includes(input.meal_type)) {
      throw new BadRequestException(`Invalid meal_type "${input.meal_type}".`);
    }
    if (!input.items?.length) {
      throw new BadRequestException('A plate must have at least one item.');
    }
    if (input.items.length > 30) {
      throw new BadRequestException('Too many items on one plate (max 30).');
    }

    const client = await this.clientForUser(userId);

    // 1. Re-run the engine per item (server-side, authoritative).
    type Computed = {
      input: LogPlateInput['items'][number];
      food_id: string | null;
      food_name: string | null;
      cooking_method: string | null;
      resolution_status: ItemResolutionStatus;
      ai_confidence: number | null;
      nutrition: NutrientPanel | null;
      audit_id: string | null;
    };

    const computed: Computed[] = [];
    for (const item of input.items) {
      if (!Number.isFinite(item.quantity_g) || item.quantity_g <= 0) {
        throw new BadRequestException(`"${item.detected_name}": quantity_g must be > 0.`);
      }
      const aiConf = clamp01(item.ai_confidence);
      try {
        const calc = await this.calculator.calculate(
          {
            food_id: item.food_id,
            food_query: item.food_id ? undefined : (item.food_query ?? item.detected_name),
            quantity_g: item.quantity_g,
            cooking_method: (item.cooking_method as CookingMethodCode) ?? 'raw',
            ai_confidence: aiConf ?? undefined,
          },
          {
            actor_user_id: userId,
            workspace_id: client.workspace_id ?? undefined,
            target_type: 'plate_vision',
          },
        );
        computed.push({
          input: item,
          food_id: calc.food.id,
          food_name: calc.food.canonical_name,
          cooking_method: calc.cooking_method,
          resolution_status: 'resolved',
          ai_confidence: aiConf,
          nutrition: calc.nutrients,
          audit_id: calc.audit_id,
        });
      } catch (err) {
        // No invented numbers — flag the item for manual resolution instead.
        this.logger.debug(`Item "${item.detected_name}" unresolved: ${(err as Error).message}`);
        computed.push({
          input: item,
          food_id: item.food_id ?? null,
          food_name: null,
          cooking_method: item.cooking_method ?? null,
          resolution_status: 'manual_review',
          ai_confidence: aiConf,
          nutrition: null,
          audit_id: null,
        });
      }
    }

    const totals = sumTotals(computed.map((c) => c.nutrition));
    const resolvedCount = computed.filter((c) => c.resolution_status === 'resolved').length;
    const avgConfidence = averageConfidence(computed.map((c) => c.ai_confidence));
    const loggedAt = parseDate(input.logged_at);

    // 2. Persist the plate parent + its item rows in one transaction.
    const plateId = await this.prisma.$transaction(async (tx) => {
      const [plate] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO public.plate_vision_meals
           (client_id, workspace_id, meal_type, photo_url, notes, logged_at, source,
            totals, item_count, resolved_count, ai_confidence, ai_model, engine_version)
         VALUES ($1::uuid, $2::uuid, $3::public.meal_type, $4, $5, $6::timestamptz, $7,
                 $8::jsonb, $9, $10, $11, $12, $13)
         RETURNING id`,
        client.id,
        client.workspace_id,
        input.meal_type,
        input.photo_url ?? null,
        input.notes ?? null,
        loggedAt,
        input.source ?? 'plate_vision',
        JSON.stringify(totals),
        computed.length,
        resolvedCount,
        avgConfidence,
        AI_MODEL,
        ENGINE_VERSION,
      );

      for (const c of computed) {
        await tx.$queryRawUnsafe(
          `INSERT INTO public.meal_logs
             (client_id, workspace_id, plate_group_id, meal_type, meal_name, kcal,
              photo_url, notes, logged_at, source_type, detected_name, cooking_method,
              ai_confidence, resolution_status, food_id, audit_id, nutrition_snapshot,
              quantity, unit)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::public.meal_type, $5, $6,
                   $7, $8, $9::timestamptz, $10, $11, $12,
                   $13, $14, $15::uuid, $16::uuid, $17::jsonb,
                   $18, $19)`,
          client.id,
          client.workspace_id,
          plate.id,
          input.meal_type,
          c.food_name ?? c.input.detected_name,
          c.nutrition?.energy_kcal != null ? Math.round(c.nutrition.energy_kcal) : null,
          // Photo is stored once on the parent plate row (read by the history);
          // per-item rows skip it to avoid duplicating the thumbnail N times.
          null,
          c.input.detected_name,
          loggedAt,
          // meal_logs.source_type is constrained to ('food_item','ingredient','recipe');
          // a plate-detected food is a food_item. The plate origin is tracked via
          // plate_group_id → plate_vision_meals.source.
          'food_item',
          c.input.detected_name,
          c.cooking_method,
          c.ai_confidence,
          c.resolution_status,
          c.food_id,
          c.audit_id,
          c.nutrition ? JSON.stringify(c.nutrition) : null,
          c.input.quantity_g,
          'g',
        );
      }
      return plate.id;
    });

    // 3. Best-effort goal-based insight (never blocks the save).
    await this.attachInsight(plateId, totals, computed, input.meal_type, client);

    return this.getPlateById(plateId);
  }

  /** Generate + freeze the insight. Swallows failures — plate is already saved. */
  private async attachInsight(
    plateId: string,
    totals: PlateTotals,
    computed: Array<{ food_name: string | null; input: { detected_name: string }; nutrition: NutrientPanel | null }>,
    mealType: string,
    client: ClientGoalContext,
  ): Promise<void> {
    try {
      const insight = await this.insights.generate({
        totals,
        items: computed.map((c) => ({
          name: c.food_name ?? c.input.detected_name,
          kcal: c.nutrition?.energy_kcal != null ? Math.round(c.nutrition.energy_kcal) : 0,
        })),
        mealType,
        client,
      });
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.plate_vision_meals
            SET insight = $2::jsonb, insight_generated_at = now(), updated_at = now()
          WHERE id = $1::uuid`,
        plateId,
        JSON.stringify(insight),
      );
    } catch (err) {
      this.logger.warn(`Insight generation failed for plate ${plateId}: ${(err as Error).message}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Reads (client)
  // ────────────────────────────────────────────────────────────────────

  async listMyPlates(userId: string, days = 14): Promise<PlateMeal[]> {
    const d = clamp(days, 1, 90);
    const rows = await this.prisma.$queryRawUnsafe<RawPlateRow[]>(
      `${PLATE_SELECT}
         JOIN public.clients c ON c.id = p.client_id
        WHERE c.user_id = $1::uuid
          AND p.logged_at >= now() - ($2 || ' days')::interval
        ORDER BY p.logged_at DESC
        LIMIT 200`,
      userId,
      String(d),
    );
    return rows.map(toPlate);
  }

  async getMyPlate(userId: string, plateId: string): Promise<PlateMeal> {
    const [row] = await this.prisma.$queryRawUnsafe<RawPlateRow[]>(
      `${PLATE_SELECT}
         JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = $1::uuid AND c.user_id = $2::uuid
        LIMIT 1`,
      plateId,
      userId,
    );
    if (!row) throw new NotFoundException(`Plate ${plateId} not found.`);
    const plate = toPlate(row);
    plate.items = await this.itemsForPlate(plateId);
    return plate;
  }

  // ────────────────────────────────────────────────────────────────────
  // Review (staff)
  // ────────────────────────────────────────────────────────────────────

  async listForReview(
    workspaceId: string,
    opts: { status?: PlateReviewStatus; limit?: number; offset?: number } = {},
  ): Promise<ReviewQueueItem[]> {
    const limit = clamp(opts.limit ?? 50, 1, 200);
    const offset = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [workspaceId];
    let statusFilter = '';
    if (opts.status) {
      params.push(opts.status);
      statusFilter = `AND p.review_status = $${params.length}`;
    }
    params.push(limit, offset);

    const rows = await this.prisma.$queryRawUnsafe<Array<RawPlateRow & { client_name: string | null }>>(
      `SELECT q.*, COALESCE(cl.display_name, cl.name) AS client_name
         FROM (
           ${PLATE_SELECT}
           WHERE p.workspace_id = $1::uuid ${statusFilter}
         ) q
         JOIN public.clients cl ON cl.id = q.client_id
        ORDER BY (q.review_status = 'pending') DESC, q.logged_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      ...params,
    );
    return rows.map((r) => ({ ...toPlate(r), client_name: r.client_name }));
  }

  async getForReview(workspaceId: string, plateId: string): Promise<ReviewQueueItem> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<RawPlateRow & { client_name: string | null }>>(
      `SELECT q.*, COALESCE(cl.display_name, cl.name) AS client_name
         FROM (
           ${PLATE_SELECT}
           WHERE p.id = $1::uuid AND p.workspace_id = $2::uuid
         ) q
         JOIN public.clients cl ON cl.id = q.client_id
        LIMIT 1`,
      plateId,
      workspaceId,
    );
    if (!row) throw new NotFoundException(`Plate ${plateId} not found in this workspace.`);
    const plate: ReviewQueueItem = { ...toPlate(row), client_name: row.client_name };
    plate.items = await this.itemsForPlate(plateId);
    return plate;
  }

  async reviewPlate(
    workspaceId: string,
    reviewerUserId: string,
    plateId: string,
    input: ReviewInput,
  ): Promise<ReviewQueueItem> {
    if (!['approved', 'adjusted', 'flagged'].includes(input.status)) {
      throw new BadRequestException(`Invalid review status "${input.status}".`);
    }
    const [existing] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.plate_vision_meals WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      plateId,
      workspaceId,
    );
    if (!existing) throw new ForbiddenException('Plate not in this workspace.');

    await this.prisma.$queryRawUnsafe(
      `UPDATE public.plate_vision_meals
          SET review_status = $3, review_note = $4, reviewed_by = $5::uuid,
              reviewed_at = now(), updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $2::uuid`,
      plateId,
      workspaceId,
      input.status,
      input.note ?? null,
      reviewerUserId,
    );
    return this.getForReview(workspaceId, plateId);
  }

  // ────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────

  private async getPlateById(plateId: string): Promise<PlateMeal> {
    const [row] = await this.prisma.$queryRawUnsafe<RawPlateRow[]>(
      `${PLATE_SELECT} WHERE p.id = $1::uuid LIMIT 1`,
      plateId,
    );
    if (!row) throw new NotFoundException(`Plate ${plateId} not found.`);
    const plate = toPlate(row);
    plate.items = await this.itemsForPlate(plateId);
    return plate;
  }

  private async itemsForPlate(plateId: string): Promise<PlateItem[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        detected_name: string | null;
        food_id: string | null;
        food_name: string | null;
        quantity: string | null;
        cooking_method: string | null;
        resolution_status: string | null;
        ai_confidence: string | null;
        nutrition_snapshot: unknown;
        audit_id: string | null;
      }>
    >(
      `SELECT m.id, m.detected_name, m.food_id,
              f.canonical_name AS food_name,
              m.quantity::text AS quantity,
              m.cooking_method, m.resolution_status,
              m.ai_confidence::text AS ai_confidence,
              m.nutrition_snapshot, m.audit_id
         FROM public.meal_logs m
         LEFT JOIN public.foods f ON f.id = m.food_id
        WHERE m.plate_group_id = $1::uuid
        ORDER BY m.created_at ASC`,
      plateId,
    );
    return rows.map((r) => ({
      id: r.id,
      detected_name: r.detected_name ?? '',
      food_id: r.food_id,
      food_name: r.food_name,
      quantity_g: r.quantity != null ? Number(r.quantity) : 0,
      cooking_method: r.cooking_method,
      resolution_status: (r.resolution_status as ItemResolutionStatus) ?? 'manual_entry',
      ai_confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
      nutrition: (r.nutrition_snapshot as NutrientPanel | null) ?? null,
      audit_id: r.audit_id,
    }));
  }

  private async clientForUser(userId: string): Promise<{ id: string; workspace_id: string | null } & ClientGoalContext> {
    const [me] = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        workspace_id: string | null;
        target_kcal: number | null;
        goals: string | null;
        activity_level: string | null;
      }>
    >(
      `SELECT id, workspace_id, target_kcal, goals, activity_level
         FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!me) throw new NotFoundException('No client profile linked to this user.');
    return me;
  }
}

// ─── Row mapping ─────────────────────────────────────────────────────

const PLATE_SELECT = `
  SELECT p.id, p.client_id, p.workspace_id, p.meal_type::text AS meal_type,
         p.photo_url, p.notes, p.logged_at, p.source,
         p.totals, p.item_count, p.resolved_count,
         p.ai_confidence::text AS ai_confidence, p.ai_model, p.engine_version,
         p.insight, p.insight_generated_at,
         p.review_status, p.reviewed_by, p.reviewed_at, p.review_note, p.created_at
    FROM public.plate_vision_meals p`;

interface RawPlateRow {
  id: string;
  client_id: string;
  workspace_id: string | null;
  meal_type: string;
  photo_url: string | null;
  notes: string | null;
  logged_at: Date;
  source: string;
  totals: unknown;
  item_count: number;
  resolved_count: number;
  ai_confidence: string | null;
  ai_model: string | null;
  engine_version: string | null;
  insight: unknown;
  insight_generated_at: Date | null;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  created_at: Date;
}

function toPlate(r: RawPlateRow): PlateMeal {
  return {
    id: r.id,
    client_id: r.client_id,
    workspace_id: r.workspace_id,
    meal_type: r.meal_type as PlateMeal['meal_type'],
    photo_url: r.photo_url,
    notes: r.notes,
    logged_at: r.logged_at.toISOString(),
    source: r.source as PlateMeal['source'],
    totals: normalizeTotals(r.totals),
    item_count: r.item_count,
    resolved_count: r.resolved_count,
    ai_confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
    ai_model: r.ai_model,
    engine_version: r.engine_version,
    insight: (r.insight as PlateInsight | null) ?? null,
    insight_generated_at: r.insight_generated_at ? r.insight_generated_at.toISOString() : null,
    review_status: r.review_status as PlateReviewStatus,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    review_note: r.review_note,
    created_at: r.created_at.toISOString(),
  };
}

// ─── Pure helpers ────────────────────────────────────────────────────

function sumTotals(panels: Array<NutrientPanel | null>): PlateTotals {
  return panels.reduce<PlateTotals>((acc, p) => {
    if (!p) return acc;
    return {
      energy_kcal: round1(acc.energy_kcal + (p.energy_kcal ?? 0)),
      protein_g: round1(acc.protein_g + (p.protein_g ?? 0)),
      carbohydrate_g: round1(acc.carbohydrate_g + (p.carbohydrate_g ?? 0)),
      fat_g: round1(acc.fat_g + (p.fat_g ?? 0)),
      fiber_g:
        acc.fiber_g == null && p.fiber_g == null
          ? null
          : round1((acc.fiber_g ?? 0) + (p.fiber_g ?? 0)),
    };
  }, { ...EMPTY_TOTALS });
}

function normalizeTotals(v: unknown): PlateTotals {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return {
      energy_kcal: numOr(o.energy_kcal, 0),
      protein_g: numOr(o.protein_g, 0),
      carbohydrate_g: numOr(o.carbohydrate_g, 0),
      fat_g: numOr(o.fat_g, 0),
      fiber_g: o.fiber_g == null ? null : numOr(o.fiber_g, 0),
    };
  }
  return { ...EMPTY_TOTALS };
}

function averageConfidence(vals: Array<number | null>): number | null {
  const present = vals.filter((v): v is number => v != null);
  if (!present.length) return null;
  return round3(present.reduce((a, b) => a + b, 0) / present.length);
}

function parseDate(iso?: string): string {
  if (!iso) return new Date().toISOString();
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function clamp01(v: number | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(v)));
}
function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : fallback;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
