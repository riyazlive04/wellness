import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MealSlotsService } from '../meal-plans/meal-slots.service';

const TZ = 'Asia/Kolkata';
const DAYS = 14;

export interface ClientPreview {
  /** Meals logged per day vs the practice's meal times, oldest day first. */
  logging: {
    mealsPerDay: number;
    days: Array<{ date: string; meals: number }>;
    /** Share of planned meals logged, last 7 days and the 7 before (0-100). */
    pct: number;
    prevPct: number;
    lastMealAt: string | null;
  };
  weight: { current: number; start: number | null; change: number | null; since: string | null } | null;
  nextSession: { at: string; kind: string | null; mode: string | null; minutes: number } | null;
  today: Array<{ id: string; slot: string; label: string; name: string; kcal: number | null; at: string; thumb: string | null }>;
}

/**
 * One client at a glance for the roster's preview panel: how consistently
 * they log meals, weight change, the next session and what they ate today.
 */
@Injectable()
export class ClientPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mealSlots: MealSlotsService,
  ) {}

  async preview(workspaceId: string, clientId: string): Promise<ClientPreview> {
    const [client] = await this.prisma.$queryRawUnsafe<Array<{ id: string; last_weight: string | null }>>(
      `SELECT id, last_weight::text AS last_weight FROM public.clients
        WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      clientId, workspaceId,
    );
    if (!client) throw new NotFoundException('Client not in this workspace.');

    const [slots, perDay, weights, [session], today, [last]] = await Promise.all([
      this.mealSlots.forWorkspace(workspaceId),
      this.prisma.$queryRawUnsafe<Array<{ d: string; n: bigint }>>(
        `SELECT to_char((logged_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS d,
                count(DISTINCT COALESCE(plate_group_id, id)) AS n
           FROM public.meal_logs
          WHERE client_id = $1::uuid
            AND logged_at >= ((now() AT TIME ZONE '${TZ}')::date - ${DAYS - 1})::timestamp AT TIME ZONE '${TZ}'
          GROUP BY 1`,
        clientId,
      ),
      // First and latest weigh-in on record.
      this.prisma.$queryRawUnsafe<Array<{ d: string; w: string }>>(
        `(SELECT to_char(log_date, 'YYYY-MM-DD') AS d, weight::text AS w FROM public.daily_logs
           WHERE client_id = $1::uuid AND weight > 0 ORDER BY log_date ASC LIMIT 1)
         UNION ALL
         (SELECT to_char(log_date, 'YYYY-MM-DD'), weight::text FROM public.daily_logs
           WHERE client_id = $1::uuid AND weight > 0 ORDER BY log_date DESC LIMIT 1)`,
        clientId,
      ),
      this.prisma.$queryRawUnsafe<Array<{ scheduled_at: Date; kind: string | null; mode: string | null; duration_minutes: number | null }>>(
        `SELECT scheduled_at, kind::text AS kind, mode::text AS mode, duration_minutes
           FROM public.appointments
          WHERE client_id = $1::uuid AND scheduled_at >= now() AND status = 'scheduled'
          ORDER BY scheduled_at LIMIT 1`,
        clientId,
      ),
      this.prisma.$queryRawUnsafe<Array<{ id: string; plate: string | null; meal_type: string; meal_name: string | null; kcal: number | null; logged_at: Date; thumb: string | null }>>(
        `SELECT m.id, m.plate_group_id::text AS plate, m.meal_type::text AS meal_type, m.meal_name, m.kcal::float8 AS kcal, m.logged_at,
                COALESCE(p.thumb_url, CASE WHEN m.photo_url LIKE 'http%' THEN m.photo_url END) AS thumb
           FROM public.meal_logs m
           LEFT JOIN public.plate_vision_meals p ON p.id = m.plate_group_id
          WHERE m.client_id = $1::uuid
            AND m.logged_at >= ((now() AT TIME ZONE '${TZ}')::date)::timestamp AT TIME ZONE '${TZ}'
          ORDER BY m.logged_at`,
        clientId,
      ),
      this.prisma.$queryRawUnsafe<Array<{ at: Date | null }>>(
        `SELECT max(logged_at) AS at FROM public.meal_logs WHERE client_id = $1::uuid`,
        clientId,
      ),
    ]);

    const labels = new Map(slots.map((s) => [s.slot as string, s.label]));
    const mealsPerDay = Math.max(1, slots.length);
    const counts = new Map(perDay.map((r) => [r.d, Number(r.n)]));
    const days = lastDays(DAYS).map((date) => ({ date, meals: counts.get(date) ?? 0 }));

    return {
      logging: {
        mealsPerDay,
        days,
        pct: share(days.slice(7), mealsPerDay),
        prevPct: share(days.slice(0, 7), mealsPerDay),
        lastMealAt: last?.at ? last.at.toISOString() : null,
      },
      weight: weightOf(weights, client.last_weight),
      nextSession: session
        ? { at: session.scheduled_at.toISOString(), kind: session.kind, mode: session.mode, minutes: session.duration_minutes ?? 30 }
        : null,
      // Plate Vision writes one row per food; show the plate once.
      today: collapsePlates(today).map((m) => ({
        id: m.id,
        slot: m.meal_type,
        label: labels.get(m.meal_type) ?? humanize(m.meal_type),
        name: m.meal_name ?? 'Meal',
        kcal: m.kcal,
        at: m.logged_at.toISOString(),
        thumb: m.thumb,
      })),
    };
  }
}

/** The last n calendar dates in India, oldest first, as YYYY-MM-DD. */
export function lastDays(n: number, now = new Date()): string[] {
  const today = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Planned meals logged across these days, capped at the plan each day. */
export function share(days: Array<{ meals: number }>, perDay: number): number {
  if (!days.length) return 0;
  const got = days.reduce((s, d) => s + Math.min(d.meals, perDay), 0);
  return Math.round((got / (days.length * perDay)) * 100);
}

export function weightOf(rows: Array<{ d: string; w: string }>, lastWeight: string | null): ClientPreview['weight'] {
  const first = rows[0], latest = rows[rows.length - 1];
  const current = latest ? Number(latest.w) : lastWeight != null ? Number(lastWeight) : NaN;
  if (!Number.isFinite(current) || current <= 0) return null;
  if (!first || rows.length < 2 || first.d === latest.d) return { current, start: null, change: null, since: null };
  const start = Number(first.w);
  return { current, start, change: Math.round((current - start) * 10) / 10, since: first.d };
}

export function collapsePlates<T extends { plate: string | null; meal_name: string | null; kcal: number | null }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const prev = r.plate ? out.find((o) => o.plate === r.plate) : undefined;
    if (prev) {
      prev.kcal = (prev.kcal ?? 0) + (r.kcal ?? 0);
      prev.meal_name = `${prev.meal_name}, ${r.meal_name}`;
      continue;
    }
    out.push({ ...r });
  }
  return out;
}

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
