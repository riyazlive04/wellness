import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

type PersonKind = 'client' | 'staff' | 'practice' | 'system';

export interface AiUsageDetail {
  /** Credits used this month (failed calls aren't charged). */
  used: number;
  failed: number;
  byFeature: Array<{ key: string; label: string; count: number }>;
  byPerson: Array<{ name: string; kind: PersonKind; count: number }>;
  recent: Array<{ at: string; feature: string; person: string; kind: PersonKind; ok: boolean }>;
}

export interface StorageDetail {
  byPerson: Array<{ name: string; kind: PersonKind; bytes: number; files: number }>;
}

/**
 * Where a practice's AI credits and storage go: by feature, by person, and
 * recent activity. Read-only views over ai_usage_events and stored files.
 */
@Injectable()
export class UsageDetailService {
  private readonly logger = new Logger(UsageDetailService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ai(workspaceId: string): Promise<AiUsageDetail> {
    const events = await this.prisma.$queryRawUnsafe<Array<{
      service: string; feature: string | null; user_id: string | null; status: string; created_at: Date;
    }>>(
      `SELECT service, metadata->>'feature' AS feature, user_id::text AS user_id, status, created_at
         FROM public.ai_usage_events
        WHERE workspace_id = $1::uuid AND created_at >= date_trunc('month', now())
        ORDER BY created_at DESC
        LIMIT 5000`,
      workspaceId,
    );
    const names = await this.people(workspaceId, [...new Set(events.map((e) => e.user_id).filter((x): x is string => !!x))]);
    const who = (id: string | null) => (id && names.get(id)) || { name: id ? 'Former member' : 'Automatic (NUSI)', kind: (id ? 'staff' : 'system') as PersonKind };

    const ok = events.filter((e) => e.status !== 'error');
    const byFeature = new Map<string, { key: string; label: string; count: number }>();
    const byPerson = new Map<string, { name: string; kind: PersonKind; count: number }>();
    for (const e of ok) {
      const f = featureOf(e.service, e.feature);
      const fe = byFeature.get(f.key) ?? { ...f, count: 0 };
      fe.count++;
      byFeature.set(f.key, fe);
      const p = who(e.user_id);
      const pk = `${p.kind}:${p.name}`;
      const pe = byPerson.get(pk) ?? { ...p, count: 0 };
      pe.count++;
      byPerson.set(pk, pe);
    }
    return {
      used: ok.length,
      failed: events.length - ok.length,
      byFeature: [...byFeature.values()].sort((a, b) => b.count - a.count),
      byPerson: [...byPerson.values()].sort((a, b) => b.count - a.count),
      recent: events.slice(0, 30).map((e) => {
        const p = who(e.user_id);
        return { at: e.created_at.toISOString(), feature: featureOf(e.service, e.feature).label, person: p.name, kind: p.kind, ok: e.status !== 'error' };
      }),
    };
  }

  /**
   * Storage per person. Files sit under a top folder naming their owner (the
   * practice, a client, a client's or staff member's user id); meal and profile
   * photos stored inline belong to the client they were taken for.
   */
  async storage(workspaceId: string): Promise<StorageDetail> {
    const rows: Array<{ kind: PersonKind; name: string; bytes: bigint; files: bigint }> = [];
    try {
      rows.push(...await this.prisma.$queryRawUnsafe<typeof rows>(
        `WITH owners AS (
           SELECT $1::text AS id, 'practice' AS kind, 'Your practice' AS name
           UNION ALL SELECT c.id::text, 'client', c.name FROM public.clients c WHERE c.workspace_id = $1::uuid
           UNION ALL SELECT c.user_id::text, 'client', c.name FROM public.clients c
                      WHERE c.workspace_id = $1::uuid AND c.user_id IS NOT NULL
           UNION ALL SELECT m.user_id::text, 'staff', COALESCE(NULLIF(pr.name, ''), u.email, 'Team member')
                       FROM public.workspace_members m
                       LEFT JOIN public.profiles pr ON pr.id = m.user_id
                       LEFT JOIN auth.users u ON u.id = m.user_id
                      WHERE m.workspace_id = $1::uuid AND m.user_id IS NOT NULL
         )
         SELECT ow.kind, ow.name,
                COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint AS bytes, COUNT(*)::bigint AS files
           FROM storage.objects o
           JOIN (SELECT DISTINCT ON (id) id, kind, name FROM owners) ow ON ow.id = split_part(o.name, '/', 1)
          GROUP BY ow.kind, ow.name
         UNION ALL
         SELECT 'practice', 'Verification documents',
                COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint, COUNT(*)::bigint
           FROM storage.objects o
          WHERE split_part(o.name, '/', 1) = 'verification' AND split_part(o.name, '/', 2) = $1::text
          HAVING COUNT(*) > 0`,
        workspaceId,
      ));
    } catch (err) {
      this.logger.warn(`Storage by person from storage.objects failed: ${(err as Error).message}`);
    }
    // Inline meal and profile photos, per client (base64 is ~4/3 of the bytes).
    rows.push(...await this.prisma.$queryRawUnsafe<typeof rows>(
      `SELECT 'client' AS kind, c.name,
              (COALESCE(SUM(octet_length(p.photo_url)), 0) * 3 / 4
                + COALESCE(SUM(octet_length(p.thumb_url)), 0) * 3 / 4)::bigint AS bytes,
              COUNT(*)::bigint AS files
         FROM public.plate_vision_meals p
         JOIN public.clients c ON c.id = p.client_id
        WHERE c.workspace_id = $1::uuid AND p.photo_url LIKE 'data:%'
        GROUP BY c.name
       UNION ALL
       SELECT 'client', c.name, (octet_length(c.avatar_url) * 3 / 4)::bigint, 1::bigint
         FROM public.clients c
        WHERE c.workspace_id = $1::uuid AND c.avatar_url LIKE 'data:%'`,
      workspaceId,
    ));
    const merged = new Map<string, { name: string; kind: PersonKind; bytes: number; files: number }>();
    for (const r of rows) {
      const k = `${r.kind}:${r.name}`;
      const m = merged.get(k) ?? { name: r.name, kind: r.kind, bytes: 0, files: 0 };
      m.bytes += Number(r.bytes);
      m.files += Number(r.files);
      merged.set(k, m);
    }
    return { byPerson: [...merged.values()].filter((p) => p.bytes > 0).sort((a, b) => b.bytes - a.bytes) };
  }

  /** Names for user ids: a client of this practice, else the person's profile. */
  private async people(workspaceId: string, ids: string[]): Promise<Map<string, { name: string; kind: PersonKind }>> {
    const out = new Map<string, { name: string; kind: PersonKind }>();
    if (!ids.length) return out;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; client_name: string | null; profile_name: string | null; meta_name: string | null; email: string | null }>>(
      `SELECT u.id::text AS id, c.name AS client_name, pr.name AS profile_name,
              u.raw_user_meta_data->>'name' AS meta_name, u.email
         FROM auth.users u
         LEFT JOIN public.clients c ON c.user_id = u.id AND c.workspace_id = $2::uuid
         LEFT JOIN public.profiles pr ON pr.id = u.id
        WHERE u.id = ANY($1::uuid[])`,
      ids,
      workspaceId,
    );
    for (const r of rows) {
      out.set(r.id, r.client_name
        ? { name: r.client_name, kind: 'client' }
        : { name: r.profile_name || r.meta_name || r.email || 'Team member', kind: 'staff' });
    }
    return out;
  }
}

/** The feature an AI call served, in the words a practice owner would use. */
export function featureOf(service: string, feature: string | null): { key: string; label: string } {
  const f = feature ?? '';
  if (service === 'vision') return { key: 'plate_vision', label: 'Plate Vision photo analysis' };
  if (service === 'voice') return { key: 'voice', label: 'Voice notes' };
  const map: Record<string, string> = {
    meal_macro_estimate: 'Estimate with AI (meal nutrition)',
    meal_plan_generate: 'AI meal plan draft',
    plate_insight: 'Plate insights for clients',
    weekly_summary: 'Weekly client summaries',
    assistant: 'AI assistant',
    ai_assistant: 'AI assistant',
    assistant_brief: 'AI assistant briefings',
    comprehensive_assessment: 'Assessment reports',
  };
  if (map[f]) return { key: f, label: map[f] };
  return { key: f || service, label: f ? f.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Other AI' };
}
