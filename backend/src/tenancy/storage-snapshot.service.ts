import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../database/prisma.service';
import { skipScheduled } from '../common/schedulers';

/** Practices are Indian, so a snapshot belongs to an Indian calendar day. */
const TZ = 'Asia/Kolkata';

/**
 * A nightly reading of how much storage each practice is using.
 *
 * Storage is a point-in-time total — a file either exists or it does not — so
 * unlike AI credits there is no history to recover later. The only way to
 * answer "is this growing, and how fast" is to start writing it down, which
 * means today's reading is the earliest one that will ever exist.
 *
 * One row per practice per day, keyed so a re-run overwrites rather than
 * duplicates.
 */
@Injectable()
export class StorageSnapshotService {
  private readonly logger = new Logger(StorageSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'storage-daily-snapshot',
    timeZone: TZ,
  })
  async nightly(): Promise<void> {
    if (skipScheduled(this.logger, 'storage.snapshot')) return;
    const n = await this.snapshotAll();
    this.logger.log(`Storage snapshot written for ${n} practice(s).`);
  }

  /**
   * Measure and record every live practice. Returns how many rows were
   * written. Safe to call repeatedly: the upsert is keyed on (workspace, day).
   */
  async snapshotAll(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `WITH owners AS (
         SELECT w.id AS workspace_id, w.id::text AS owner_id FROM public.workspaces w WHERE w.status <> 'deleted'
         UNION SELECT c.workspace_id, c.id::text FROM public.clients c
         UNION SELECT c.workspace_id, c.user_id::text FROM public.clients c WHERE c.user_id IS NOT NULL
         UNION SELECT m.workspace_id, m.user_id::text FROM public.workspace_members m WHERE m.user_id IS NOT NULL
       ),
       sized AS (
         SELECT o.workspace_id,
                COALESCE(SUM((so.metadata->>'size')::bigint), 0)::bigint AS bytes,
                COUNT(so.id)::int AS files
           FROM owners o
           LEFT JOIN storage.objects so
             ON split_part(so.name, '/', 1) = o.owner_id
          GROUP BY o.workspace_id
       )
       INSERT INTO public.workspace_storage_daily (workspace_id, day, bytes, files)
       SELECT workspace_id, (now() AT TIME ZONE '${TZ}')::date, bytes, files
         FROM sized
       ON CONFLICT (workspace_id, day) DO UPDATE
         SET bytes = EXCLUDED.bytes, files = EXCLUDED.files, created_at = now()
       RETURNING 1 AS n`,
    );
    return rows.length;
  }

  /** Recent daily readings for one practice, oldest first. */
  async history(workspaceId: string, days = 30): Promise<Array<{ day: string; bytes: number; files: number }>> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ day: Date; bytes: bigint; files: number }>>(
      `SELECT day, bytes, files
         FROM public.workspace_storage_daily
        WHERE workspace_id = $1::uuid
          AND day > (now() AT TIME ZONE '${TZ}')::date - $2::int
        ORDER BY day ASC`,
      workspaceId,
      days,
    );
    return rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      bytes: Number(r.bytes),
      files: Number(r.files),
    }));
  }
}
