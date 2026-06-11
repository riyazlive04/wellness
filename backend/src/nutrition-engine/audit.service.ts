import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { CalculateInput, CalculateOutput } from './nutrition.types';

export interface AuditWriteParams {
  target_type: 'food' | 'recipe' | 'meal_log' | 'plate_vision' | 'voice_log';
  target_id?: string | null;
  food_id?: string | null;
  inputs: CalculateInput | Record<string, unknown>;
  outputs: CalculateOutput | Record<string, unknown>;
  engine_version: string;
  database_version: string;
  ai_confidence?: number | null;
  actor_user_id?: string | null;
  workspace_id?: string | null;
}

export interface AuditRecord {
  id: string;
  target_type: string;
  target_id: string | null;
  food_id: string | null;
  inputs: unknown;
  outputs: unknown;
  engine_version: string;
  database_version: string;
  ai_confidence: number | null;
  actor_user_id: string | null;
  workspace_id: string | null;
  created_at: string;
}

/**
 * AuditService — writes one row per calculate() call to public.nutrition_audit.
 *
 * Every calculation in the system is auditable from this table. The frozen
 * inputs+outputs+engine_version mean a value can always be re-explained — even
 * after the engine logic or upstream nutrient data has been updated.
 *
 * Audit rows are append-only by design. No update/delete API. Workspace
 * scoping is captured for RLS filtering at read-time.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(params: AuditWriteParams): Promise<string> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO public.nutrition_audit
         (target_type, target_id, food_id, inputs, outputs,
          engine_version, database_version, ai_confidence,
          actor_user_id, workspace_id)
       VALUES ($1, $2::uuid, $3::uuid, $4::jsonb, $5::jsonb,
               $6, $7, $8::numeric, $9::uuid, $10::uuid)
       RETURNING id`,
      params.target_type,
      params.target_id ?? null,
      params.food_id ?? null,
      JSON.stringify(params.inputs),
      JSON.stringify(params.outputs),
      params.engine_version,
      params.database_version,
      params.ai_confidence ?? null,
      params.actor_user_id ?? null,
      params.workspace_id ?? null,
    );
    return row.id;
  }

  async getById(id: string): Promise<AuditRecord> {
    const [row] = await this.prisma.$queryRawUnsafe<AuditRecord[]>(
      `SELECT id, target_type, target_id, food_id, inputs, outputs,
              engine_version, database_version,
              ai_confidence::float AS ai_confidence,
              actor_user_id, workspace_id, created_at
         FROM public.nutrition_audit
        WHERE id = $1::uuid
        LIMIT 1`,
      id,
    );
    if (!row) throw new NotFoundException('Audit record not found.');
    return row;
  }
}