import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { mealPlansApi, SLOT_LABELS, SLOT_ORDER, type MealCard, type MealSlot } from '@/lib/meal-plans-api';
import { radius, spacing } from '@/lib/theme';

export default function MealPlan() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['me', 'meal-plan'], queryFn: () => mealPlansApi.myCurrent(), retry: 1 });
  const plan = q.data ?? null;
  const cards = useMemo(() => plan?.cards ?? [], [plan]);

  const days = useMemo(() => {
    const set = new Set(cards.map((c) => c.day_number));
    return [...set].sort((a, b) => a - b);
  }, [cards]);
  const [day, setDay] = useState(1);
  const activeDay = days.includes(day) ? day : days[0] ?? 1;

  const dayCards = cards
    .filter((c) => c.day_number === activeDay)
    .sort((a, b) => SLOT_ORDER.indexOf(a.meal_type) - SLOT_ORDER.indexOf(b.meal_type));
  const dayKcal = dayCards.reduce((s, c) => s + (c.kcal ?? 0), 0);

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : !plan || cards.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="calendar-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              No meal plan yet. Your nutritionist will publish one here.
            </AppText>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Eyebrow>Your plan · Week {plan.week_number}</Eyebrow>
              <AppText variant="muted" tone="muted">
                {fmt(plan.start_date)} – {fmt(plan.end_date)} · {plan.total_kcal} kcal/day target
              </AppText>
            </Card>

            {days.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {days.map((d) => {
                  const active = d === activeDay;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDay(d)}
                      style={[styles.dayTab, { backgroundColor: active ? t.colors.primary : 'transparent', borderColor: active ? 'transparent' : t.colors.border }]}>
                      <AppText variant="muted" tone={active ? 'onBrand' : 'muted'}>
                        Day {d}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow>Day {activeDay}</Eyebrow>
              <AppText variant="caption" tone="accent">{dayKcal} kcal</AppText>
            </View>

            {dayCards.map((c) => <MealCardView key={c.id} card={c} />)}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function MealCardView({ card }: { card: MealCard }) {
  const t = useTheme();
  return (
    <Card style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[styles.slot, { backgroundColor: t.colors.surfaceStrong }]}>
          <AppText variant="caption" tone="muted">{SLOT_LABELS[card.meal_type as MealSlot] ?? card.meal_type}</AppText>
        </View>
        <AppText variant="caption" tone="faint">{card.kcal} kcal</AppText>
      </View>
      <AppText variant="heading">{card.meal_name}</AppText>
      {card.quantity ? (
        <AppText variant="caption" tone="muted">{card.quantity}{card.unit ? ` ${card.unit}` : ''}</AppText>
      ) : null}
      {card.description ? <AppText variant="muted" tone="muted">{card.description}</AppText> : null}
      {card.ingredients ? (
        <AppText variant="caption" tone="faint" style={{ marginTop: 2 }}>Ingredients: {card.ingredients}</AppText>
      ) : null}
    </Card>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  dayTab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  slot: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
});
