import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { DEFAULT_SLOTS, MEAL_SLOTS, SLOT_LABELS, type MealSlot, type MealSlotEntry } from '@/modules/workspace/api/mealPlans';
import { mealTypeForNow } from '@/modules/workspace/api/plate-vision';

const STANDARD: MealSlotEntry[] = DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false }));

/**
 * The meal times the client's practice uses, with its names for them
 * ("First Meal", "Mid Meal", "Last Meal"). Every client screen that offers or
 * shows a meal time reads this, so the client sees what the nutritionist set.
 */
export function useMealSlots() {
  const q = useQuery({
    queryKey: ['me', 'meal-slots'],
    queryFn: () => api.get<MealSlotEntry[]>('/api/v1/me/meal-plan/slots'),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const slots = q.data?.length ? q.data : STANDARD;
  return {
    slots,
    /** The practice's name for a meal type, else the standard name. */
    label: (type: string | null | undefined) =>
      slots.find((e) => e.slot === type)?.label ?? SLOT_LABELS[type as MealSlot] ?? type ?? '',
    /** The practice's meal time closest to now, to preselect when logging. */
    forNow: () => nearestSlot(slots, mealTypeForNow()),
  };
}

/** The listed slot nearest in the day to `target`. */
function nearestSlot(slots: MealSlotEntry[], target: string): MealSlot {
  if (slots.some((e) => e.slot === target)) return target as MealSlot;
  const at = MEAL_SLOTS.indexOf(target as MealSlot);
  return slots.reduce((best, e) =>
    Math.abs(MEAL_SLOTS.indexOf(e.slot) - at) < Math.abs(MEAL_SLOTS.indexOf(best.slot) - at) ? e : best,
  ).slot;
}
