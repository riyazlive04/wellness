import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { CookingMethodCode } from './nutrition.types';

export interface CookingMethod {
  code: CookingMethodCode;
  label: string;
  yield_factor: number | null;
  oil_absorption_g_per_100g: number;
  water_added_g_per_100g: number;
}

/**
 * RulesService — loads cooking method and nutrient retention rules once at
 * boot, then serves them from in-memory maps. These rules change rarely
 * (months/years) so caching is safe and avoids a DB round-trip on every
 * single nutrition calculation.
 *
 * Cache invalidation: a manual refresh() method is provided for admin tools
 * that update rules at runtime. In production, a Postgres LISTEN/NOTIFY
 * could trigger automatic refresh — out of scope for Phase 1.
 */
@Injectable()
export class RulesService implements OnModuleInit {
  private readonly logger = new Logger(RulesService.name);

  private methodsByCode = new Map<string, CookingMethod>();
  /** retention[cooking_method][nutrient_code] = retention_factor (0..1.5) */
  private retention = new Map<string, Map<string, number>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const methods = await this.prisma.$queryRawUnsafe<Array<{
      code: string; label: string;
      yield_factor: number | null;
      oil_absorption_g_per_100g: number;
      water_added_g_per_100g: number;
    }>>(
      `SELECT code, label,
              yield_factor::float                AS yield_factor,
              oil_absorption_g_per_100g::float   AS oil_absorption_g_per_100g,
              water_added_g_per_100g::float      AS water_added_g_per_100g
         FROM public.cooking_methods`,
    );
    this.methodsByCode = new Map(methods.map((m) => [m.code, m as CookingMethod]));

    const rets = await this.prisma.$queryRawUnsafe<Array<{
      cooking_method: string; nutrient_code: string; retention_factor: number;
    }>>(
      `SELECT cooking_method, nutrient_code,
              retention_factor::float AS retention_factor
         FROM public.nutrient_retention`,
    );
    this.retention = new Map();
    for (const r of rets) {
      let inner = this.retention.get(r.cooking_method);
      if (!inner) {
        inner = new Map();
        this.retention.set(r.cooking_method, inner);
      }
      inner.set(r.nutrient_code, r.retention_factor);
    }

    this.logger.log(
      `Loaded ${this.methodsByCode.size} cooking methods, ` +
      `${rets.length} retention factors.`,
    );
  }

  /** Returns the cooking method record, or null if the code is unknown. */
  getMethod(code: CookingMethodCode | string): CookingMethod | null {
    return this.methodsByCode.get(code) ?? null;
  }

  /**
   * Retention factor for a given (method, nutrient) pair. Defaults to 1.0
   * when no row exists — meaning "no measured loss for this combination, so
   * we don't subtract anything". This is the conservative default for an
   * accuracy-first engine: never invent loss we can't cite.
   */
  retentionFactor(method: CookingMethodCode | string, nutrientCode: string): number {
    const inner = this.retention.get(method);
    if (!inner) return 1.0;
    return inner.get(nutrientCode) ?? 1.0;
  }

  /** Snapshot of all retention factors actually applied — for audit logs. */
  retentionsForMethod(method: CookingMethodCode | string): Array<{ nutrient: string; factor: number }> {
    const inner = this.retention.get(method);
    if (!inner) return [];
    return [...inner.entries()].map(([nutrient, factor]) => ({ nutrient, factor }));
  }
}