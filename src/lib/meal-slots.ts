import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api';
import { MEAL_TYPE_LABEL, MEAL_TYPES, mealTypeForNow, type MealType } from '@/lib/plate-vision-api';

export interface MealSlotEntry {
  slot: MealType;
  /** The practice's name for it ("First Meal"), else the standard name. */
  label: string;
  custom: boolean;
}

const STANDARD: MealSlotEntry[] = (['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner'] as MealType[]).map(
  (slot) => ({ slot, label: MEAL_TYPE_LABEL[slot], custom: false }),
);

// Time-of-day order, to find the meal time nearest to now.
const DAY_ORDER: MealType[] = [
  'cleansing_water', 'early_morning', 'breakfast', 'mid_breakfast', 'mid_morning',
  'lunch', 'evening_snack', 'evening_snack_1', 'evening_snack_2', 'dinner',
];

/**
 * The meal times the client's practice uses, with its names for them. Every
 * screen that offers or shows a meal time reads this, so the client sees what
 * the nutritionist set (e.g. only First Meal / Mid Meal / Last Meal).
 */
export function useMealSlots() {
  const q = useQuery({
    queryKey: ['me', 'meal-slots'],
    queryFn: () => api.get<MealSlotEntry[]>('/api/v1/me/meal-plan/slots'),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const slots = useMemo(() => {
    const known = (q.data ?? []).filter((e) => (MEAL_TYPES as readonly string[]).includes(e.slot));
    return known.length ? known : STANDARD;
  }, [q.data]);
  return {
    slots,
    label: (type: string | null | undefined): string =>
      slots.find((e) => e.slot === type)?.label ?? MEAL_TYPE_LABEL[type as MealType] ?? type ?? '',
    /** The practice's meal time nearest to now, to preselect when logging. */
    forNow: (): MealType => nearest(slots, mealTypeForNow()),
  };
}

function nearest(slots: MealSlotEntry[], target: MealType): MealType {
  if (!slots.length) return target;
  if (slots.some((e) => e.slot === target)) return target;
  const at = DAY_ORDER.indexOf(target);
  return slots.reduce((best, e) =>
    Math.abs(DAY_ORDER.indexOf(e.slot) - at) < Math.abs(DAY_ORDER.indexOf(best.slot) - at) ? e : best,
  ).slot;
}
