import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ClientsService } from './clients.service';

/** The bucket progress photos already use; exercise photos sit beside them. */
const BUCKET = 'progress-photos';
/** One session rarely needs more than this, and it bounds the signing work. */
const MAX_PHOTOS = 6;

export interface ExercisePhoto {
  id: string;
  storage_key: string;
  sort_order: number;
}

export interface ExerciseLog {
  id: string;
  client_id: string;
  name: string;
  kind: string | null;
  performed_on: string;
  performed_at: string | null;
  duration_min: number | null;
  notes: string | null;
  submitted_at: Date;
  photos: ExercisePhoto[];
  /** Feed rows only: who logged it. */
  client_name?: string | null;
}

export interface CreateExerciseInput {
  name: string;
  kind?: string;
  performed_on?: string;
  performed_at?: string;
  duration_min?: number;
  notes?: string;
  photos?: Array<{ storage_key: string; bytes?: number }>;
}

/**
 * Daily exercise logs — a client records what they did, with photos, and
 * everyone in their practice can see it.
 *
 * Photos reuse the progress-photos bucket and ClientsService's signed-upload
 * helpers rather than a second storage path: the client asks for an upload
 * ticket, PUTs the bytes straight to Supabase, then posts the object key
 * here. Nothing is base64 in a column, and the bucket stays private.
 */
@Injectable()
export class ExerciseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  /** Today in the practice's timezone, so an 11pm log isn't tomorrow. */
  private async localToday(workspaceId: string): Promise<string> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT to_char((now() AT TIME ZONE COALESCE(
                (SELECT NULLIF(timezone, '') FROM public.workspaces WHERE id = $1::uuid),
                'Asia/Kolkata')), 'YYYY-MM-DD') AS d`,
      workspaceId,
    );
    return r?.d ?? new Date().toISOString().slice(0, 10);
  }

  /** A signed URL to PUT one photo to, before the log row exists. */
  async uploadTicket(clientId: string, fileName: string) {
    const workspaceId = await this.clients.workspaceOfClient(clientId);
    await this.clients.assertStorageAvailableFor(workspaceId);
    const safe = (fileName || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `${clientId}/${Date.now()}-${randomBytes(6).toString('hex')}-${safe}`;
    return this.clients.createUploadTicket(BUCKET, key);
  }

  /** Record a session. Photos must already be uploaded via uploadTicket. */
  async create(clientId: string, input: CreateExerciseInput): Promise<ExerciseLog> {
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException('What exercise did you do?');

    const workspaceId = await this.clients.workspaceOfClient(clientId);
    const photos = (input.photos ?? []).slice(0, MAX_PHOTOS);
    // A key outside the client's own folder would let one client attach
    // another's photo to their log.
    for (const p of photos) {
      if (!p.storage_key?.startsWith(`${clientId}/`)) {
        throw new BadRequestException('That photo does not belong to you.');
      }
    }

    const performedOn = input.performed_on ?? (await this.localToday(workspaceId));
    const [log] = await this.prisma.$queryRawUnsafe<ExerciseLog[]>(
      `INSERT INTO public.exercise_logs
         (client_id, workspace_id, name, kind, performed_on, performed_at, duration_min, notes)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::date, $6::time, $7, $8)
       RETURNING id, client_id, name, kind,
                 to_char(performed_on, 'YYYY-MM-DD') AS performed_on,
                 to_char(performed_at, 'HH24:MI')    AS performed_at,
                 duration_min, notes, submitted_at`,
      clientId,
      workspaceId,
      name.slice(0, 120),
      input.kind?.trim().slice(0, 40) || null,
      performedOn,
      input.performed_at || null,
      input.duration_min ?? null,
      input.notes?.trim().slice(0, 2000) || null,
    );

    if (photos.length) {
      const values = photos
        .map((_, i) => `($1::uuid, $2::uuid, $${i * 2 + 3}, $${i * 2 + 4}, ${i})`)
        .join(', ');
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO public.exercise_log_photos (log_id, client_id, storage_key, bytes, sort_order)
         VALUES ${values}`,
        log.id,
        clientId,
        ...photos.flatMap((p) => [p.storage_key, p.bytes ?? null]),
      );
    }
    return { ...log, photos: await this.photosFor([log.id]).then((m) => m.get(log.id) ?? []) };
  }

  /** Photos for several logs at once, so a list doesn't query per row. */
  private async photosFor(logIds: string[]): Promise<Map<string, ExercisePhoto[]>> {
    const out = new Map<string, ExercisePhoto[]>();
    if (!logIds.length) return out;
    const rows = await this.prisma.$queryRawUnsafe<Array<ExercisePhoto & { log_id: string }>>(
      `SELECT id, log_id, storage_key, sort_order
         FROM public.exercise_log_photos
        WHERE log_id = ANY($1::uuid[])
        ORDER BY log_id, sort_order`,
      logIds,
    );
    for (const r of rows) {
      const list = out.get(r.log_id) ?? [];
      list.push({ id: r.id, storage_key: r.storage_key, sort_order: r.sort_order });
      out.set(r.log_id, list);
    }
    return out;
  }

  private async withPhotos(logs: ExerciseLog[]): Promise<ExerciseLog[]> {
    const byLog = await this.photosFor(logs.map((l) => l.id));
    return logs.map((l) => ({ ...l, photos: byLog.get(l.id) ?? [] }));
  }

  /** One client's history, newest first. */
  async forClient(clientId: string, limit = 60): Promise<ExerciseLog[]> {
    const logs = await this.prisma.$queryRawUnsafe<ExerciseLog[]>(
      `SELECT id, client_id, name, kind,
              to_char(performed_on, 'YYYY-MM-DD') AS performed_on,
              to_char(performed_at, 'HH24:MI')    AS performed_at,
              duration_min, notes, submitted_at
         FROM public.exercise_logs
        WHERE client_id = $1::uuid
        ORDER BY performed_on DESC, performed_at DESC NULLS LAST, submitted_at DESC
        LIMIT $2`,
      clientId,
      Math.min(Math.max(limit, 1), 365),
    );
    return this.withPhotos(logs);
  }

  /** The practice-wide feed, newest first, with optional filters. */
  async feed(
    workspaceId: string,
    opts: { clientId?: string; kind?: string; from?: string; to?: string; limit?: number } = {},
  ): Promise<ExerciseLog[]> {
    const where: string[] = ['e.workspace_id = $1::uuid'];
    const args: unknown[] = [workspaceId];
    const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace('$n', `$${args.length}`)); };
    if (opts.clientId) add('e.client_id = $n::uuid', opts.clientId);
    if (opts.kind) add('lower(e.kind) = lower($n)', opts.kind);
    if (opts.from) add('e.performed_on >= $n::date', opts.from);
    if (opts.to) add('e.performed_on <= $n::date', opts.to);
    args.push(Math.min(Math.max(opts.limit ?? 50, 1), 200));

    const logs = await this.prisma.$queryRawUnsafe<ExerciseLog[]>(
      `SELECT e.id, e.client_id, c.name AS client_name, e.name, e.kind,
              to_char(e.performed_on, 'YYYY-MM-DD') AS performed_on,
              to_char(e.performed_at, 'HH24:MI')    AS performed_at,
              e.duration_min, e.notes, e.submitted_at
         FROM public.exercise_logs e
         JOIN public.clients c ON c.id = e.client_id
        WHERE ${where.join(' AND ')}
        ORDER BY e.performed_on DESC, e.submitted_at DESC
        LIMIT $${args.length}`,
      ...args,
    );
    return this.withPhotos(logs);
  }

  /** The exercise kinds this practice has actually used, for the filter. */
  async kinds(workspaceId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ kind: string }>>(
      `SELECT DISTINCT kind FROM public.exercise_logs
        WHERE workspace_id = $1::uuid AND kind IS NOT NULL AND btrim(kind) <> ''
        ORDER BY kind LIMIT 50`,
      workspaceId,
    );
    return rows.map((r) => r.kind);
  }

  /**
   * A signed URL for one photo. `workspaceId` authorises a practice member;
   * `clientId` authorises the client themselves. One must be given.
   */
  async signPhoto(
    photoId: string,
    who: { clientId?: string; workspaceId?: string },
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ storage_key: string }>>(
      `SELECT p.storage_key
         FROM public.exercise_log_photos p
         JOIN public.clients c ON c.id = p.client_id
        WHERE p.id = $1::uuid
          AND ($2::uuid IS NULL OR p.client_id = $2::uuid)
          AND ($3::uuid IS NULL OR c.workspace_id = $3::uuid)
        LIMIT 1`,
      photoId,
      who.clientId ?? null,
      who.workspaceId ?? null,
    );
    if (!row) throw new NotFoundException('Photo not found.');
    return this.clients.signStorageObject(BUCKET, row.storage_key);
  }

  /** Delete a log and its photos. The client owns their entries. */
  async remove(clientId: string, logId: string): Promise<{ deleted: true }> {
    const keys = await this.prisma.$queryRawUnsafe<Array<{ storage_key: string }>>(
      `SELECT storage_key FROM public.exercise_log_photos
        WHERE log_id = $1::uuid AND client_id = $2::uuid`,
      logId,
      clientId,
    );
    const [gone] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.exercise_logs
        WHERE id = $1::uuid AND client_id = $2::uuid RETURNING id`,
      logId,
      clientId,
    );
    if (!gone) throw new NotFoundException('Exercise entry not found.');
    // Best effort: a left-behind object costs quota but losing the row is worse.
    for (const k of keys) await this.clients.deleteFromStorage(BUCKET, k.storage_key).catch(() => undefined);
    return { deleted: true };
  }

  /** Which days this client logged, for the calendar dots. */
  async loggedDays(clientId: string, days = 60): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT DISTINCT to_char(performed_on, 'YYYY-MM-DD') AS d
         FROM public.exercise_logs
        WHERE client_id = $1::uuid
          AND performed_on > now()::date - ($2::int || ' days')::interval
        ORDER BY d DESC`,
      clientId,
      Math.min(Math.max(days, 1), 365),
    );
    return rows.map((r) => r.d);
  }
}
