import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_BOOKING_HOURS,
  openBookingSlots,
  validateBookingHours,
  type BookingHours,
} from './booking-hours';

interface Row {
  enabled: boolean;
  days: number[];
  day_start: number;
  day_end: number;
  break_start: number | null;
  break_end: number | null;
  step_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  horizon_days: number;
}

/** A practice's booking hours, and the open slots clients can request. */
@Injectable()
export class BookingHoursService {
  private readonly logger = new Logger(BookingHoursService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The practice a signed-in client belongs to (clients book with their own practice). */
  async workspaceForClientUser(userId: string): Promise<string | null> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ workspace_id: string }>>(
      `SELECT workspace_id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    return r?.workspace_id ?? null;
  }

  /** Saved hours, or the defaults when the practice never changed them. */
  async get(workspaceId: string): Promise<BookingHours> {
    try {
      const [r] = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT enabled, days, day_start, day_end, break_start, break_end, step_minutes,
                buffer_minutes, min_notice_hours, horizon_days
           FROM public.workspace_booking_hours WHERE workspace_id = $1::uuid`,
        workspaceId,
      );
      if (!r) return { ...DEFAULT_BOOKING_HOURS };
      return {
        enabled: r.enabled,
        days: r.days.map(Number),
        dayStart: r.day_start,
        dayEnd: r.day_end,
        breakStart: r.break_start,
        breakEnd: r.break_end,
        stepMinutes: r.step_minutes,
        bufferMinutes: r.buffer_minutes,
        minNoticeHours: r.min_notice_hours,
        horizonDays: r.horizon_days,
      };
    } catch (err) {
      // Table not migrated yet: behave as if the practice kept the defaults.
      this.logger.warn(`booking hours fell back to defaults: ${(err as Error).message}`);
      return { ...DEFAULT_BOOKING_HOURS };
    }
  }

  async save(workspaceId: string, input: BookingHours): Promise<BookingHours> {
    const checked = validateBookingHours(input);
    if (!checked.ok) throw new BadRequestException(checked.message);
    const h = checked.value;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_booking_hours
         (workspace_id, enabled, days, day_start, day_end, break_start, break_end,
          step_minutes, buffer_minutes, min_notice_hours, horizon_days, updated_at)
       VALUES ($1::uuid, $2, $3::smallint[], $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, days = EXCLUDED.days,
         day_start = EXCLUDED.day_start, day_end = EXCLUDED.day_end,
         break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end,
         step_minutes = EXCLUDED.step_minutes, buffer_minutes = EXCLUDED.buffer_minutes,
         min_notice_hours = EXCLUDED.min_notice_hours, horizon_days = EXCLUDED.horizon_days,
         updated_at = now()`,
      workspaceId,
      h.enabled,
      h.days,
      h.dayStart,
      h.dayEnd,
      h.breakStart,
      h.breakEnd,
      h.stepMinutes,
      h.bufferMinutes,
      h.minNoticeHours,
      h.horizonDays,
    );
    return h;
  }

  /** Open start times for a session of this length. */
  async openSlots(workspaceId: string, durationMinutes: number, now = new Date()): Promise<{ enabled: boolean; slots: string[] }> {
    const hours = await this.get(workspaceId);
    if (!hours.enabled) return { enabled: false, slots: [] };
    const busy = await this.prisma.$queryRawUnsafe<Array<{ scheduled_at: Date; duration_minutes: number }>>(
      `SELECT scheduled_at, duration_minutes FROM public.appointments
        WHERE workspace_id = $1::uuid AND status IN ('scheduled', 'pending')
          AND scheduled_at > now() - interval '1 day'
          AND scheduled_at < now() + make_interval(days => $2::int + 1)`,
      workspaceId,
      hours.horizonDays,
    );
    const ranges = busy.map((b) => {
      const start = new Date(b.scheduled_at);
      return { start, end: new Date(start.getTime() + (b.duration_minutes || 30) * 60_000) };
    });
    return { enabled: true, slots: openBookingSlots(hours, ranges, now, durationMinutes) };
  }

  /**
   * A client request must land on an open slot while booking hours are on.
   * The browser saw the slot free a moment ago; this is the check that holds.
   */
  async assertOpen(workspaceId: string, scheduledAt: string, durationMinutes: number): Promise<void> {
    const { enabled, slots } = await this.openSlots(workspaceId, durationMinutes);
    if (!enabled) return;
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || !slots.includes(when.toISOString())) {
      throw new BadRequestException("That time isn't available any more. Please pick another slot.");
    }
  }
}
