import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { QueryError } from '@/components/query-state';
import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi, type FoodSearchHit } from '@/lib/nutrition-api';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** How many foods to list when browsing (no search term). */
const BROWSE_LIMIT = 60;

/** Soft brand tint — a low-alpha wash of a brand/teal hue for chips & badges. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>Nutrition · Food library</Eyebrow>
          <AppText variant="title">Look up a food</AppText>
        </View>

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

      <ScreenScroll contentContainerStyle={{ paddingTop: 0, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {resultsQ.isLoading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : resultsQ.isError ? (
          <QueryError error={resultsQ.error} onRetry={() => void resultsQ.refetch()} lockedFeature="The food library" />
        ) : hits.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.12) }]}>
              <Ionicons name="nutrition-outline" size={24} color={t.colors.primary} />
            </View>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
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
  const t = useTheme();
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, opacity: pressed ? 0.85 : 1 }}>
          <View style={[styles.thumb, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.13) }]}>
            <Ionicons name="nutrition-outline" size={22} color={t.colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="body" style={{ flex: 1 }}>{hit.food.canonical_name}</AppText>
              {hit.energy_kcal_per_100g != null ? (
                <View style={[styles.badge, { backgroundColor: tint(status.warning, t.dark ? 0.18 : 0.12) }]}>
                  <Ionicons name="flame-outline" size={12} color={status.warning} />
                  <AppText variant="caption" style={{ color: status.warning }}>{Math.round(hit.energy_kcal_per_100g)} kcal</AppText>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
              {hit.food.category ? (
                <View style={[styles.badge, { backgroundColor: tint(brand.cyan, t.dark ? 0.18 : 0.11) }]}>
                  <AppText variant="caption" style={{ color: brand.cyan }}>{hit.food.category}</AppText>
                </View>
              ) : null}
              {hit.macros ? (
                <AppText variant="caption" tone="muted">
                  P {fmt(hit.macros.protein_g)} · C {fmt(hit.macros.carbohydrate_g)} · F {fmt(hit.macros.fat_g)}
                </AppText>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} />
        </Card>
      )}
    </Pressable>
  );
}

/** Accent hue per nutrient so the detail sheet reads as a designed panel. */
const NUTRIENT_HUE: Record<string, string> = {
  Energy: status.warning,
  Protein: brand.teal,
  Carbs: brand.cyan,
  Fat: status.info,
  Fiber: status.success,
  Sugar: brand.blue,
  Sodium: brand.cyan,
  Calcium: brand.teal,
  Iron: status.danger,
  'Vitamin C': status.success,
};
const NUTRIENT_ICON: Record<string, IoniconName> = {
  Energy: 'flame-outline',
  Protein: 'barbell-outline',
  Carbs: 'leaf-outline',
  Fat: 'water-outline',
  Fiber: 'nutrition-outline',
  Sugar: 'ice-cream-outline',
  Sodium: 'flask-outline',
  Calcium: 'egg-outline',
  Iron: 'magnet-outline',
  'Vitamin C': 'sunny-outline',
};

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={[styles.thumb, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.13) }]}>
              <Ionicons name="nutrition-outline" size={22} color={t.colors.primary} />
            </View>
            <AppText variant="heading" style={{ flex: 1 }}>{d?.canonical_name ?? 'Food'}</AppText>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.closeBtn, { backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="close" size={20} color={t.colors.textMuted} />
            </Pressable>
          </View>
          {q.isLoading ? (
            <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={t.colors.accent} />
            </View>
          ) : d ? (
            <ScreenScroll contentContainerStyle={{ padding: 0, paddingBottom: spacing.xl, gap: spacing.md }}>
              <View style={[styles.perBadge, { backgroundColor: tint(brand.cyan, t.dark ? 0.18 : 0.11) }]}>
                <Ionicons name="pie-chart-outline" size={13} color={t.colors.accent} />
                <AppText variant="caption" tone="accent">Per 100g · {d.category}</AppText>
              </View>
              <Card style={{ padding: 0 }}>
                {rows.map((r, i) => {
                  const hue = NUTRIENT_HUE[r.label] ?? brand.teal;
                  return (
                    <View key={r.label} style={[styles.nRow, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                      <View style={[styles.nChip, { backgroundColor: tint(hue, t.dark ? 0.2 : 0.13) }]}>
                        <Ionicons name={NUTRIENT_ICON[r.label] ?? 'ellipse-outline'} size={15} color={hue} />
                      </View>
                      <AppText variant="body" tone="muted" style={{ flex: 1 }}>{r.label}</AppText>
                      <AppText variant="body" style={{ fontVariant: ['tabular-nums'] }}>{r.value}</AppText>
                    </View>
                  );
                })}
              </Card>
              {d.health?.summary ? (
                <Card style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: tint(status.success, t.dark ? 0.12 : 0.08) }}>
                  <View style={[styles.nChip, { backgroundColor: tint(status.success, t.dark ? 0.2 : 0.14) }]}>
                    <Ionicons name="sparkles-outline" size={15} color={status.success} />
                  </View>
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <AppText variant="caption" tone="accent" style={{ textTransform: 'uppercase' }}>Good to know</AppText>
                    <AppText variant="muted" tone="muted">{d.health.summary}</AppText>
                  </View>
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
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 11 },
  thumb: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  emptyChip: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  perBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  closeBtn: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  detailBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  detailSheet: { maxHeight: '85%', borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, gap: spacing.md },
  nRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  nChip: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
