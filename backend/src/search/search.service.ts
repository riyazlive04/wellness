import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SearchResultType = 'client' | 'program' | 'recipe';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel: string | null;
  url: string;
}

/**
 * Cross-entity workspace search. Every query is scoped by workspaceId (tenant
 * isolation) and uses a parameterised ILIKE — the raw term is bound as a
 * parameter, never interpolated, so it's injection-safe.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(workspaceId: string, term: string): Promise<SearchResult[]> {
    const q = term.trim();
    if (q.length < 2 || !workspaceId) return [];

    const [clients, programs, recipes] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ id: string; name: string; email: string | null; program_type: string | null }>>(
        `SELECT id, name, email, program_type::text AS program_type
           FROM public.clients
          WHERE workspace_id = $1::uuid
            AND (name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
          ORDER BY updated_at DESC LIMIT 6`,
        workspaceId, q,
      ).catch(() => []),
      this.prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
        `SELECT id, name FROM public.program_templates
          WHERE workspace_id = $1::uuid AND name ILIKE '%' || $2 || '%'
          ORDER BY updated_at DESC LIMIT 5`,
        workspaceId, q,
      ).catch(() => []),
      this.prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
        `SELECT id, name FROM public.workspace_recipes
          WHERE workspace_id = $1::uuid AND name ILIKE '%' || $2 || '%'
          ORDER BY updated_at DESC LIMIT 5`,
        workspaceId, q,
      ).catch(() => []),
    ]);

    return [
      ...clients.map((c): SearchResult => ({
        type: 'client', id: c.id, label: c.name,
        sublabel: c.email || c.program_type || null, url: `/clients/${c.id}`,
      })),
      ...programs.map((p): SearchResult => ({
        type: 'program', id: p.id, label: p.name, sublabel: 'Program template', url: `/programs/${p.id}`,
      })),
      ...recipes.map((r): SearchResult => ({
        type: 'recipe', id: r.id, label: r.name, sublabel: 'Recipe', url: `/dashboard/nutrition/recipes/${r.id}`,
      })),
    ];
  }
}
