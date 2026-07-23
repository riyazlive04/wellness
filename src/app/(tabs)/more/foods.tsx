import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi, type FoodSearchHit } from '@/lib/nutrition-api';
import { radius, spacing } from '@/lib/theme';

export default function Foods() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const resultsQ = useQuery({
    queryKey: ['foods', 'search', search],
    queryFn: () => nutritionApi.searchFoods({ q: search, limit: 40 }),
    enabled: search.trim().length >= 2,
    retry: 1,
  });
  const hits = resultsQ.data ?? [];

  return (
    <Screen edges={[]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={[styles.search, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search foods (IFCT 2017)"
            placeholderTextColor={t.colors.textFaint}
            autoCorrect={false}
            style={{ flex: 1, color: t.colors.text, fontSize: 15 }}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScreenScroll contentContainerStyle={{ paddingTop: 0 }} keyboardShouldPersistTaps="handled">
        {search.trim().length < 2 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="book-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              Type at least 2 letters to search the food database.
            </AppText>
          </Card>
        ) : resultsQ.isLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : hits.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <AppText variant="muted" tone="muted">No matches.</AppText>
          </Card>
        ) : (
          hits.map((h) => <FoodRow key={h.food.id} hit={h} onPress={() => setSelected(h.food.id)} />)
        )}
      </ScreenScroll>

      <FoodDetailModal id={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function FoodRow({ hit, onPress }: { hit: FoodSearchHit; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="body" style={{ flex: 1 }}>{hit.food.canonical_name}</AppText>
          {hit.energy_kcal_per_100g != null ? (
            <AppText variant="caption" tone="accent">{Math.round(hit.energy_kcal_per_100g)} kcal/100g</AppText>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <AppText variant="caption" tone="faint">{hit.food.category}</AppText>
          {hit.macros ? (
            <AppText variant="caption" tone="muted">
              P {fmt(hit.macros.protein_g)} · C {fmt(hit.macros.carbohydrate_g)} · F {fmt(hit.macros.fat_g)}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function FoodDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTheme();
  const q = useQuery({ queryKey: ['foods', 'detail', id], queryFn: () => nutritionApi.foodDetail(id!), enabled: !!id, retry: 1 });
  const d = q.data;
  const N = d?.nutrients;
  const rows: { label: string; value: string }[] = N
    ? [
        { label: 'Energy', value: `${Math.round(N.energy_kcal)} kcal` },
        { label: 'Protein', value: `${N.protein_g} g` },
        { label: 'Carbs', value: `${N.carbohydrate_g} g` },
        { label: 'Fat', value: `${N.fat_g} g` },
        ...(N.fiber_g != null ? [{ label: 'Fiber', value: `${N.fiber_g} g` }] : []),
        ...(N.sugar_g != null ? [{ label: 'Sugar', value: `${N.sugar_g} g` }] : []),
        ...(N.sodium_mg != null ? [{ label: 'Sodium', value: `${N.sodium_mg} mg` }] : []),
        ...(N.calcium_mg != null ? [{ label: 'Calcium', value: `${N.calcium_mg} mg` }] : []),
        ...(N.iron_mg != null ? [{ label: 'Iron', value: `${N.iron_mg} mg` }] : []),
        ...(N.vit_c_mg != null ? [{ label: 'Vitamin C', value: `${N.vit_c_mg} mg` }] : []),
      ]
    : [];

  return (
    <Modal visible={!!id} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailBackdrop}>
        <View style={[styles.detailSheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="heading" style={{ flex: 1 }}>{d?.canonical_name ?? 'Food'}</AppText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={t.colors.textMuted} />
            </Pressable>
          </View>
          {q.isLoading ? (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={t.colors.accent} />
            </View>
          ) : d ? (
            <ScreenScroll contentContainerStyle={{ padding: 0, paddingBottom: spacing.xl, gap: spacing.md }}>
              <AppText variant="caption" tone="faint">Per 100g · {d.category}</AppText>
              <Card style={{ padding: 0 }}>
                {rows.map((r, i) => (
                  <View key={r.label} style={[styles.nRow, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                    <AppText variant="body" tone="muted">{r.label}</AppText>
                    <AppText variant="body">{r.value}</AppText>
                  </View>
                ))}
              </Card>
              {d.health?.summary ? (
                <Card style={{ gap: spacing.xs }}>
                  <AppText variant="caption" tone="accent" style={{ textTransform: 'uppercase' }}>Good to know</AppText>
                  <AppText variant="muted" tone="muted">{d.health.summary}</AppText>
                </Card>
              ) : null}
            </ScreenScroll>
          ) : (
            <AppText variant="muted" tone="muted" style={{ paddingVertical: spacing.lg }}>Couldn&apos;t load details.</AppText>
          )}
        </View>
      </View>
    </Modal>
  );
}

function fmt(n: number | null): string {
  return n != null ? `${n}g` : '–';
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  detailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  detailSheet: { maxHeight: '85%', borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, gap: spacing.md },
  nRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 12 },
});
