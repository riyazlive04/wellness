import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { QueryError } from '@/components/query-state';
import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi, type FoodSearchHit } from '@/lib/nutrition-api';
import { radius, spacing } from '@/lib/theme';

/** How many foods to list when browsing (no search term). */
const BROWSE_LIMIT = 60;

export default function Foods() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const browsing = debouncedSearch.length === 0;

  /**
   * An empty `q` is dropped by the query-string builder, which puts the backend
   * into its "browse the full library alphabetically" mode. The screen used to
   * require two characters before issuing any request at all, so it opened
   * blank and looked like the food database was empty.
   */
  const resultsQ = useQuery({
    queryKey: ['foods', 'search', debouncedSearch],
    queryFn: () =>
      nutritionApi.searchFoods({
        q: debouncedSearch || undefined,
        limit: browsing ? BROWSE_LIMIT : 40,
      }),
    retry: 1,
    staleTime: 5 * 60 * 1000,
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
        {resultsQ.isLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : resultsQ.isError ? (
          <QueryError error={resultsQ.error} onRetry={() => void resultsQ.refetch()} lockedFeature="The food library" />
        ) : hits.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <AppText variant="muted" tone="muted">
              {browsing ? 'The food library is empty.' : `No foods match “${debouncedSearch}”.`}
            </AppText>
          </Card>
        ) : (
          <>
            {hits.map((h) => <FoodRow key={h.food.id} hit={h} onPress={() => setSelected(h.food.id)} />)}
            {/* Browsing is capped, so say so rather than implying this is everything. */}
            {browsing && hits.length >= BROWSE_LIMIT ? (
              <AppText variant="caption" tone="faint" style={{ textAlign: 'center', paddingVertical: spacing.md }}>
                Showing the first {BROWSE_LIMIT} foods — search to find anything else.
              </AppText>
            ) : null}
          </>
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
