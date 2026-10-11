import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_SCHEDULE, MEAL_SLOTS, MealSlot, MealSlotEntry, STANDARD_SLOT_LABELS } from './meal-plans.types';

type Stored = Array<{ slot: string; label?: string | null }>;

/**
 * A practice's meal times: which slots its clients see and what they're
 * called ("First Meal", "Mid Meal", "Last Meal"). Stored on
 * workspaces.meal_slots; null means the standard five with standard names.
 * The slot keys stay the meal_type enum, so logs and reports keep working.
 */
@Injectable()
export class MealSlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The practice's meal times in time-of-day order. */
  async forWorkspace(workspaceId: string): Promise<MealSlotEntry[]> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ meal_slots: Stored | null }>>(
      `SELECT meal_slots FROM public.workspaces WHERE id = $1::uuid LIMIT 1`,
      workspaceId,
    );
    return toEntries(row?.meal_slots ?? null);
  }

  /** The meal times of the practice a client belongs to. */
  async forClientUser(userId: string): Promise<MealSlotEntry[]> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ meal_slots: Stored | null }>>(
      `SELECT w.meal_slots FROM public.clients c
         JOIN public.workspaces w ON w.id = c.workspace_id
        WHERE c.user_id = $1::uuid
        ORDER BY c.created_at DESC LIMIT 1`,
      userId,
    );
    if (!row) throw new NotFoundException('Client profile not found');
    return toEntries(row.meal_slots);
  }

  /** Replace the practice's meal times. An empty label means the standard name. */
  async set(workspaceId: string, input: Array<{ slot?: unknown; label?: unknown }>): Promise<MealSlotEntry[]> {
    if (!Array.isArray(input) || input.length === 0) {
      throw new BadRequestException('Keep at least one meal time.');
    }
    const seen = new Set<string>();
    const stored: Stored = [];
    for (const e of input) {
      const slot = typeof e?.slot === 'string' ? e.slot : '';
      if (!(MEAL_SLOTS as readonly string[]).includes(slot)) throw new BadRequestException(`Unknown meal time "${slot}".`);
      if (seen.has(slot)) continue;
      seen.add(slot);
      const label = typeof e.label === 'string' ? e.label.trim().replace(/\s+/g, ' ') : '';
      if (label.length > 40) throw new BadRequestException('Keep a meal time name to 40 characters.');
      stored.push(label && label !== STANDARD_SLOT_LABELS[slot as MealSlot] ? { slot, label } : { slot });
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE public.workspaces SET meal_slots = $1::jsonb, updated_at = now() WHERE id = $2::uuid`,
      JSON.stringify(stored),
      workspaceId,
    );
    return toEntries(stored);
  }
}

function toEntries(stored: Stored | null): MealSlotEntry[] {
  const list: Stored = Array.isArray(stored) && stored.length ? stored : DEFAULT_SCHEDULE.map((slot) => ({ slot }));
  const bySlot = new Map(list.map((e) => [e.slot, e.label?.trim() || null]));
  return MEAL_SLOTS.filter((s) => bySlot.has(s)).map((slot) => {
    const custom = bySlot.get(slot);
    return { slot, label: custom || STANDARD_SLOT_LABELS[slot], custom: !!custom };
  });
}

/** The renamed slots only, as the { slot: name } map plans carry. */
export function customLabels(entries: MealSlotEntry[]): Partial<Record<MealSlot, string>> {
  return Object.fromEntries(entries.filter((e) => e.custom).map((e) => [e.slot, e.label]));
}
