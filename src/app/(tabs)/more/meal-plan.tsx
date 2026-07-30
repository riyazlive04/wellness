import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { mealPlansApi, SLOT_LABELS, SLOT_ORDER, type MealCard, type MealSlot } from '@/lib/meal-plans-api';
import { brand, radius, spacing, status, tintFill } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Soft pastel fill alphas: whisper-light in light mode, a touch stronger in
// dark so tints read on the ink canvas. Mirrors the Today/Progress screens.
const fill = (c: string, dark: boolean) => tintFill(c, dark);
const chipBg = (c: string, dark: boolean) => c + (dark ? '33' : '24');

// Each meal slot gets its own soft-warm icon + tint so the day reads as a
// friendly timeline instead of a flat list. Presentation only.
const SLOT_META: Record<MealSlot, { icon: IoniconName; tint: string }> = {
  cleansing_water: { icon: 'water-outline', tint: brand.blue },
  early_morning: { icon: 'partly-sunny-outline', tint: status.warning },
  breakfast: { icon: 'cafe-outline', tint: status.warning },
  mid_breakfast: { icon: 'nutrition-outline', tint: status.success },
  mid_morning: { icon: 'sunny-outline', tint: status.warning },
  lunch: { icon: 'restaurant-outline', tint: brand.teal },
  evening_snack: { icon: 'nutrition-outline', tint: status.success },
  evening_snack_1: { icon: 'nutrition-outline', tint: status.success },
  evening_snack_2: { icon: 'nutrition-outline', tint: status.success },
  dinner: { icon: 'moon-outline', tint: status.info },
};

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
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : !plan || cards.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'], borderRadius: radius['2xl'] }}>
            <View style={[styles.emptyChip, { backgroundColor: fill(t.colors.primary, t.dark) }]}>
              <Ionicons name="restaurant-outline" size={24} color={t.colors.primary} />
            </View>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              No meal plan yet
            </AppText>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Your nutritionist will publish your personalised plan here.
            </AppText>
          </Card>
        ) : (
          <>
            {/* ── Plan hero ─────────────────────────────────────────── */}
            <Card style={{ gap: spacing.md, overflow: 'hidden', borderRadius: radius['2xl'] }}>
              <LinearGradient
                colors={[t.gradient[2] + (t.dark ? '1F' : '14'), t.gradient[1] + '08', 'transparent']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Eyebrow>Your plan · Week {plan.week_number}</Eyebrow>
                  <AppText variant="heading">
                    {fmt(plan.start_date)} – {fmt(plan.end_date)}
                  </AppText>
                  <View style={[styles.kcalChip, { backgroundColor: fill(t.colors.primary, t.dark), borderColor: t.colors.primary + '33' }]}>
                    <Ionicons name="flame-outline" size={13} color={t.colors.primary} />
                    <AppText variant="caption" style={{ color: t.colors.primary }}>
                      {plan.total_kcal} kcal/day target
                    </AppText>
                  </View>
                </View>
                <View style={[styles.heroIcon, { backgroundColor: t.colors.accent + (t.dark ? '2E' : '1A'), borderColor: t.colors.accent + '3A' }]}>
                  <Ionicons name="calendar-outline" size={22} color={t.colors.accent} />
                </View>
              </View>
            </Card>

            {days.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {days.map((d) => {
                  const active = d === activeDay;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDay(d)}
                      style={[styles.dayTab, { backgroundColor: active ? t.colors.primary : fill(t.colors.primary, t.dark), borderColor: active ? 'transparent' : t.colors.primary + '26' }]}>
                      <AppText variant="caption" tone={active ? 'onBrand' : 'accent'}>
                        Day {d}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow>Day {activeDay}</Eyebrow>
              <View style={[styles.kcalChip, { backgroundColor: fill(t.colors.primary, t.dark), borderColor: t.colors.primary + '33' }]}>
                <Ionicons name="flame-outline" size={13} color={t.colors.primary} />
                <AppText variant="caption" style={{ color: t.colors.primary }}>
                  {dayKcal} kcal
                </AppText>
              </View>
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
  const meta = SLOT_META[card.meal_type as MealSlot] ?? { icon: 'restaurant-outline' as IoniconName, tint: brand.teal };
  return (
    <Card style={{ gap: spacing.sm, borderRadius: radius.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.mealChip, { backgroundColor: chipBg(meta.tint, t.dark) }]}>
          <Ionicons name={meta.icon} size={20} color={meta.tint} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText variant="caption" style={{ color: meta.tint, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {SLOT_LABELS[card.meal_type as MealSlot] ?? card.meal_type}
          </AppText>
          <AppText variant="heading">{card.meal_name}</AppText>
        </View>
        {card.kcal ? (
          <View style={[styles.kcalChip, { backgroundColor: fill(meta.tint, t.dark), borderColor: meta.tint + '33' }]}>
            <AppText variant="caption" style={{ color: meta.tint }}>
              {card.kcal} kcal
            </AppText>
          </View>
        ) : null}
      </View>
      {card.quantity ? (
        <AppText variant="caption" tone="muted">{card.quantity}{card.unit ? ` ${card.unit}` : ''}</AppText>
      ) : null}
      {card.description ? <AppText variant="muted" tone="muted">{card.description}</AppText> : null}
      {card.ingredients ? (
        <View style={[styles.ingredientBox, { backgroundColor: t.colors.surfaceStrong }]}>
          <AppText variant="caption" tone="faint">Ingredients: {card.ingredients}</AppText>
        </View>
      ) : null}
    </Card>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  dayTab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  mealChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kcalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientBox: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: 2,
  },
});
