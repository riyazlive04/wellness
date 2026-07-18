import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MEAL_SLOTS, MealCard, MealPlan, MealSlot, PlanStatus } from './meal-plans.types';

/**
 * Weekly meal planner.
 *
 * Every query is scoped by workspace_id — never by client_id alone — so a plan
 * id from another tenant resolves to "not found" rather than leaking. Cards are
 * reached only through their plan, which is itself workspace-checked.
 */
@Injectable()
export class MealPlansService {
  private readonly logger = new Logger(MealPlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Reads
  // ─────────────────────────────────────────────────────────────────

  /** kcal always comes from the cards, never the drift-prone stored column. */
  private static readonly PLAN_SELECT = `
    wp.id, wp.workspace_id, wp.client_id, wp.week_number,
    wp.start_date::text AS start_date, wp.end_date::text AS end_date,
    wp.status, wp.published_at, wp.created_at, wp.updated_at,
    COALESCE((SELECT SUM(mc.kcal) FROM public.meal_cards mc WHERE mc.plan_id = wp.id), 0)::int AS total_kcal`;

  async listForClient(workspaceId: string, clientId: string): Promise<{ items: MealPlan[] }> {
    const items = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `SELECT ${MealPlansService.PLAN_SELECT}
         FROM public.weekly_plans wp
        WHERE wp.workspace_id = $1::uuid AND wp.client_id = $2::uuid
        ORDER BY wp.start_date DESC`,
      workspaceId,
      clientId,
    );
    return { items };
  }

  async get(workspaceId: string, planId: string): Promise<MealPlan> {
    const [plan] = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `SELECT ${MealPlansService.PLAN_SELECT}
         FROM public.weekly_plans wp
        WHERE wp.id = $1::uuid AND wp.workspace_id = $2::uuid
        LIMIT 1`,
      planId,
      workspaceId,
    );
    if (!plan) throw new NotFoundException('Meal plan not found');
    plan.cards = await this.cardsFor(planId);
    return plan;
  }

  private async cardsFor(planId: string): Promise<MealCard[]> {
    return this.prisma.$queryRawUnsafe<MealCard[]>(
      `SELECT id, plan_id, day_number, meal_type::text AS meal_type, meal_name,
              description, kcal, ingredients, instructions,
              source_type, source_id::text AS source_id, quantity::float8 AS quantity, unit
         FROM public.meal_cards
        WHERE plan_id = $1::uuid
        ORDER BY day_number, meal_type`,
      planId,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Plan lifecycle
  // ─────────────────────────────────────────────────────────────────

  async create(
    workspaceId: string,
    clientId: string,
    startDate: string,
    weekNumber?: number,
  ): Promise<MealPlan> {
    // Client must belong to this workspace — otherwise an attacker could hang a
    // plan off someone else's client id.
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!client) throw new NotFoundException('Client not found');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new BadRequestException('startDate must be YYYY-MM-DD');
    }

    // Auto-number the week when the caller doesn't care: next after the last.
    const week =
      weekNumber ??
      (
        await this.prisma.$queryRawUnsafe<Array<{ next: number }>>(
          `SELECT COALESCE(MAX(week_number), 0) + 1 AS next
             FROM public.weekly_plans
            WHERE workspace_id = $1::uuid AND client_id = $2::uuid`,
          workspaceId,
          clientId,
        )
      )[0].next;

    const [plan] = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `INSERT INTO public.weekly_plans
         (workspace_id, client_id, week_number, start_date, end_date, status)
       VALUES ($1::uuid, $2::uuid, $3::int, $4::date, ($4::date + interval '6 days')::date, 'draft')
       RETURNING id`,
      workspaceId,
      clientId,
      week,
      startDate,
    );
    return this.get(workspaceId, plan.id);
  }

  /**
   * Publish makes the plan visible to the client and notifies them. Only one
   * plan per client is published for a given week — publishing a second one for
   * the same window would leave the client with two "current" plans, so the
   * previous published plan for that window is demoted to draft.
   */
  async setStatus(workspaceId: string, planId: string, status: PlanStatus): Promise<MealPlan> {
    const plan = await this.get(workspaceId, planId);

    if (status === 'published') {
      if (!plan.cards?.length) {
        throw new BadRequestException('Add at least one meal before publishing');
      }
      await this.prisma.$queryRawUnsafe(
        `UPDATE public.weekly_plans
            SET status = 'draft', published_at = NULL
          WHERE workspace_id = $1::uuid AND client_id = $2::uuid
            AND id <> $3::uuid AND status = 'published'
            AND start_date = $4::date`,
        workspaceId,
        plan.client_id,
        planId,
        plan.start_date,
      );
    }

    await this.prisma.$queryRawUnsafe(
      `UPDATE public.weekly_plans
          SET status = $2, published_at = CASE WHEN $2 = 'published' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1::uuid AND workspace_id = $3::uuid`,
      planId,
      status,
      workspaceId,
    );

    if (status === 'published') {
      void this.notifications.notifyClient(workspaceId, plan.client_id, {
        type: 'meal_plan:published',
        title: '🍽️ Your meal plan is ready',
        body: `Week ${plan.week_number} is published - tap to see what's on the menu.`,
        url: '/portal/meal-plan',
        tag: `meal-plan-${planId}`,
      });
    }

    return this.get(workspaceId, planId);
  }

  async remove(workspaceId: string, planId: string): Promise<{ deleted: true }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      // meal_cards cascade on plan_id.
      `DELETE FROM public.weekly_plans
        WHERE id = $1::uuid AND workspace_id = $2::uuid
      RETURNING id`,
      planId,
      workspaceId,
    );
    if (!rows.length) throw new NotFoundException('Meal plan not found');
    return { deleted: true };
  }

  /** Copy a whole week onto a new start date — the "repeat last week" path. */
  async duplicate(workspaceId: string, planId: string, startDate: string): Promise<MealPlan> {
    const source = await this.get(workspaceId, planId);
    const fresh = await this.create(workspaceId, source.client_id, startDate);
    if (source.cards?.length) {
      for (const c of source.cards) {
        await this.addCard(workspaceId, fresh.id, {
          dayNumber: c.day_number,
          mealType: c.meal_type,
          mealName: c.meal_name,
          description: c.description ?? undefined,
          kcal: c.kcal,
          ingredients: c.ingredients ?? undefined,
          instructions: c.instructions ?? undefined,
          sourceType: c.source_type ?? undefined,
          sourceId: c.source_id ?? undefined,
          quantity: c.quantity ?? undefined,
          unit: c.unit ?? undefined,
        });
      }
    }
    return this.get(workspaceId, fresh.id);
  }

  // ─────────────────────────────────────────────────────────────────
  // Cards
  // ─────────────────────────────────────────────────────────────────

  /** Resolves the plan first so a card can never be written cross-tenant. */
  private async assertPlan(workspaceId: string, planId: string): Promise<MealPlan> {
    const [plan] = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `SELECT id, client_id, workspace_id FROM public.weekly_plans
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      planId,
      workspaceId,
    );
    if (!plan) throw new NotFoundException('Meal plan not found');
    return plan;
  }

  async addCard(
    workspaceId: string,
    planId: string,
    input: {
      dayNumber: number;
      mealType: string;
      mealName: string;
      description?: string;
      kcal?: number;
      ingredients?: string;
      instructions?: string;
      sourceType?: string;
      sourceId?: string;
      quantity?: number;
      unit?: string;
    },
  ): Promise<MealCard> {
    await this.assertPlan(workspaceId, planId);
    if (input.dayNumber < 1 || input.dayNumber > 7) {
      throw new BadRequestException('dayNumber must be 1-7');
    }
    if (!MEAL_SLOTS.includes(input.mealType as MealSlot)) {
      throw new BadRequestException(`Unknown meal slot: ${input.mealType}`);
    }

    const [card] = await this.prisma.$queryRawUnsafe<MealCard[]>(
      `INSERT INTO public.meal_cards
         (workspace_id, plan_id, day_number, meal_type, meal_name, description,
          kcal, ingredients, instructions, source_type, source_id, quantity, unit)
       VALUES ($1::uuid, $2::uuid, $3::int, $4::meal_type, $5, $6,
               $7::int, $8, $9, $10, $11::uuid, $12::numeric, $13)
       RETURNING id, plan_id, day_number, meal_type::text AS meal_type, meal_name,
                 description, kcal, ingredients, instructions,
                 source_type, source_id::text AS source_id, quantity::float8 AS quantity, unit`,
      workspaceId,
      planId,
      input.dayNumber,
      input.mealType,
      input.mealName.trim(),
      input.description ?? null,
      Math.max(0, Math.round(input.kcal ?? 0)),
      input.ingredients ?? null,
      input.instructions ?? null,
      input.sourceType ?? null,
      input.sourceId ?? null,
      // NUMERIC column — a non-finite value must land as NULL, not NaN.
      Number.isFinite(input.quantity) ? input.quantity : null,
      input.unit ?? null,
    );
    await this.touch(planId);
    return card;
  }

  async updateCard(
    workspaceId: string,
    planId: string,
    cardId: string,
    patch: Partial<{
      mealName: string;
      description: string;
      kcal: number;
      ingredients: string;
      instructions: string;
      dayNumber: number;
      mealType: string;
      quantity: number;
      unit: string;
    }>,
  ): Promise<MealCard> {
    await this.assertPlan(workspaceId, planId);
    if (patch.mealType && !MEAL_SLOTS.includes(patch.mealType as MealSlot)) {
      throw new BadRequestException(`Unknown meal slot: ${patch.mealType}`);
    }
    if (patch.dayNumber !== undefined && (patch.dayNumber < 1 || patch.dayNumber > 7)) {
      throw new BadRequestException('dayNumber must be 1-7');
    }

    // COALESCE-style patch: only the provided fields move.
    const [card] = await this.prisma.$queryRawUnsafe<MealCard[]>(
      `UPDATE public.meal_cards
          SET meal_name    = COALESCE($3, meal_name),
              description  = COALESCE($4, description),
              kcal         = COALESCE($5::int, kcal),
              ingredients  = COALESCE($6, ingredients),
              instructions = COALESCE($7, instructions),
              day_number   = COALESCE($8::int, day_number),
              meal_type    = COALESCE($9::meal_type, meal_type),
              quantity     = COALESCE($10::numeric, quantity),
              unit         = COALESCE($11, unit),
              updated_at   = now()
        WHERE id = $1::uuid AND plan_id = $2::uuid
      RETURNING id, plan_id, day_number, meal_type::text AS meal_type, meal_name,
                description, kcal, ingredients, instructions,
                source_type, source_id::text AS source_id, quantity::float8 AS quantity, unit`,
      cardId,
      planId,
      patch.mealName?.trim() ?? null,
      patch.description ?? null,
      patch.kcal ?? null,
      patch.ingredients ?? null,
      patch.instructions ?? null,
      patch.dayNumber ?? null,
      patch.mealType ?? null,
      Number.isFinite(patch.quantity) ? patch.quantity : null,
      patch.unit ?? null,
    );
    if (!card) throw new NotFoundException('Meal not found');
    await this.touch(planId);
    return card;
  }

  async removeCard(workspaceId: string, planId: string, cardId: string): Promise<{ deleted: true }> {
    await this.assertPlan(workspaceId, planId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.meal_cards WHERE id = $1::uuid AND plan_id = $2::uuid RETURNING id`,
      cardId,
      planId,
    );
    if (!rows.length) throw new NotFoundException('Meal not found');
    await this.touch(planId);
    return { deleted: true };
  }

  private async touch(planId: string): Promise<void> {
    await this.prisma.$queryRawUnsafe(
      `UPDATE public.weekly_plans SET updated_at = now() WHERE id = $1::uuid`,
      planId,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Client side
  // ─────────────────────────────────────────────────────────────────

  /**
   * The client's current plan: the published week covering today, else the most
   * recent published one. Drafts are never returned — an unfinished plan must
   * not leak to the person it's for.
   */
  async myCurrentPlan(userId: string): Promise<MealPlan | null> {
    const [plan] = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `SELECT ${MealPlansService.PLAN_SELECT}
         FROM public.weekly_plans wp
         JOIN public.clients c ON c.id = wp.client_id
        WHERE c.user_id = $1::uuid
          AND wp.status = 'published'
        ORDER BY (CURRENT_DATE BETWEEN wp.start_date AND wp.end_date) DESC,
                 wp.start_date DESC
        LIMIT 1`,
      userId,
    );
    if (!plan) return null;
    plan.cards = await this.cardsFor(plan.id);
    return plan;
  }

  /** Every published week for the client, for their history view. */
  async myPlans(userId: string): Promise<{ items: MealPlan[] }> {
    const items = await this.prisma.$queryRawUnsafe<MealPlan[]>(
      `SELECT ${MealPlansService.PLAN_SELECT}
         FROM public.weekly_plans wp
         JOIN public.clients c ON c.id = wp.client_id
        WHERE c.user_id = $1::uuid AND wp.status = 'published'
        ORDER BY wp.start_date DESC
        LIMIT 26`,
      userId,
    );
    return { items };
  }
}
