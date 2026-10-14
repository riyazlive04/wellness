import { useQuery } from '@tanstack/react-query';
import { DEFAULT_SLOTS, SLOT_LABELS, mealPlansApi, type MealSlotEntry } from '../api/mealPlans';

/** The practice's meal times, else the standard five. */
export function usePracticeSchedule(): MealSlotEntry[] {
  const slotsQ = useQuery({ queryKey: ['workspace', 'meal-plans', 'slots'], queryFn: () => mealPlansApi.slots(), staleTime: 30_000 });
  return slotsQ.data?.schedule?.length
    ? slotsQ.data.schedule
    : DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false }));
}
