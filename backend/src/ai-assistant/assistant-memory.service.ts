import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import { resolveMemoryScope, type AssistantType } from './assistant.types';

export interface MemoryRow {
  id: string;
  scope: string;
  key: string;
  value: string;
  source: string;
  created_at: string;
  updated_at: string;
}

/**
 * AssistantMemoryService — durable, role-isolated memory (Module 6 — AI Memory
 * Engine). Every read/write is keyed on the caller's (scope, scope_id), so an
 * assistant can never read or mutate another partition's memory:
 *   executive → ('business', 'platform')
 *   clinical  → ('workspace', <workspaceId>)
 *   wellness  → ('personal',  <userId>)
 */
@Injectable()
export class AssistantMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, type: AssistantType): Promise<MemoryRow[]> {
    const { scope, scopeId } = resolveMemoryScope(user, type);
    return this.prisma.$queryRawUnsafe<MemoryRow[]>(
      `SELECT id, scope, key, value, source, created_at, updated_at
         FROM public.assistant_memory
        WHERE scope = $1 AND scope_id = $2
        ORDER BY updated_at DESC LIMIT 100`,
      scope,
      scopeId,
    );
  }

  /** Upsert a memory entry (one row per key within a partition). */
  async remember(
    user: AuthUser,
    type: AssistantType,
    key: string,
    value: string,
    source: 'user' | 'inferred' = 'user',
  ): Promise<MemoryRow> {
    const { scope, scopeId } = resolveMemoryScope(user, type);
    const [row] = await this.prisma.$queryRawUnsafe<MemoryRow[]>(
      `INSERT INTO public.assistant_memory (scope, scope_id, assistant_type, key, value, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scope, scope_id, key) DO UPDATE SET
         value = EXCLUDED.value, source = EXCLUDED.source, updated_at = now()
       RETURNING id, scope, key, value, source, created_at, updated_at`,
      scope,
      scopeId,
      type,
      key.trim().slice(0, 120),
      value.trim().slice(0, 2000),
      source,
    );
    return row;
  }

  /** Delete one entry — scoped, so a caller can only remove their own partition's memory. */
  async forget(user: AuthUser, type: AssistantType, id: string): Promise<void> {
    const { scope, scopeId } = resolveMemoryScope(user, type);
    await this.prisma.$queryRawUnsafe(
      `DELETE FROM public.assistant_memory WHERE id = $1::uuid AND scope = $2 AND scope_id = $3`,
      id,
      scope,
      scopeId,
    );
  }

  /** Compact serialization of remembered facts for the model's system prompt. */
  async promptText(user: AuthUser, type: AssistantType): Promise<string> {
    const rows = await this.list(user, type);
    if (!rows.length) return '';
    const lines = rows.slice(0, 40).map((r) => `- ${r.key}: ${r.value}`).join('\n');
    return `Known facts you remember about this ${type === 'wellness' ? 'user' : 'account'} (use them naturally):\n${lines}`;
  }
}
