import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { QueryError } from '@/components/query-state';
import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type RecipeListItem } from '@/lib/clients-api';
import { brand, radius, spacing, status } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Soft brand tint — a low-alpha wash of a brand/teal hue for chips & badges. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function Recipes() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);

  const cuisinesQ = useQuery({ queryKey: ['recipes', 'cuisines'], queryFn: () => clientsApi.listCuisines(), retry: 1, staleTime: 5 * 60 * 1000 });
  const recipesQ = useQuery({
    queryKey: ['recipes', search, cuisine],
    queryFn: () => clientsApi.listRecipes({ q: search || undefined, cuisine: cuisine || undefined, limit: 50 }),
    retry: 1,
  });

  const cuisines = cuisinesQ.data ?? [];
  const recipes = recipesQ.data ?? [];

  return (
    <Screen edges={[]}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <Eyebrow>Nutrition · Recipes</Eyebrow>
          <AppText variant="title">Recipe library</AppText>
        </View>

        <View style={[styles.search, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes"
            placeholderTextColor={t.colors.textFaint}
            style={{ flex: 1, color: t.colors.text, fontSize: 15 }}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={t.colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        {/* The cuisine strip comes from an UNGATED endpoint, so on a plan
            without Recipes it would still render filters above a locked
            message. Hide it whenever the list itself failed. */}
        {cuisines.length && !recipesQ.isError ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
            <Chip label="All" active={cuisine === null} onPress={() => setCuisine(null)} />
            {cuisines.map((c) => <Chip key={c} label={c} active={cuisine === c} onPress={() => setCuisine(c)} />)}
          </ScrollView>
        ) : null}
      </View>

      <ScreenScroll contentContainerStyle={{ paddingTop: 0, paddingBottom: 110 }}>
        {recipesQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : recipesQ.isError ? (
          <QueryError error={recipesQ.error} onRetry={() => void recipesQ.refetch()} lockedFeature="Recipes" />
        ) : recipes.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
            <View style={[styles.emptyChip, { backgroundColor: tint(brand.teal, t.dark ? 0.2 : 0.12) }]}>
              <Ionicons name="book-outline" size={24} color={t.colors.primary} />
            </View>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              {search || cuisine ? 'No recipes match that search.' : 'Your nutritionist hasn’t published any recipes yet.'}
            </AppText>
          </Card>
        ) : (
          recipes.map((r) => <RecipeCard key={r.id} r={r} />)
        )}
      </ScreenScroll>
    </Screen>
  );
}

/** Rotate a small palette of brand hues so cards in a list feel varied but on-brand. */
const CARD_HUES = [brand.teal, brand.cyan, brand.blue, status.success] as const;
function hueFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return CARD_HUES[sum % CARD_HUES.length];
}

function RecipeCard({ r }: { r: RecipeListItem }) {
  const t = useTheme();
  const hue = hueFor(r.id);
  return (
    <Card style={{ flexDirection: 'row', gap: spacing.md, borderRadius: radius.xl }}>
      <View style={[styles.thumb, { backgroundColor: tint(hue, t.dark ? 0.2 : 0.13) }]}>
        <Ionicons name={r.video_url ? 'play-circle-outline' : 'restaurant-outline'} size={24} color={hue} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="heading">{r.name}</AppText>
        {r.description ? <AppText variant="muted" tone="muted" numberOfLines={2}>{r.description}</AppText> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
          {r.category ? <Badge icon="pricetag-outline" label={r.category} hue={brand.teal} /> : null}
          <Badge icon="people-outline" label={`${r.servings} serving${r.servings === 1 ? '' : 's'}`} hue={brand.cyan} />
          {r.total_kcal ? <Badge icon="flame-outline" label={`${r.total_kcal} kcal`} hue={status.warning} /> : null}
        </View>
      </View>
    </Card>
  );
}

function Badge({ icon, label, hue }: { icon: IoniconName; label: string; hue: string }) {
  const t = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: tint(hue, t.dark ? 0.18 : 0.11) }]}>
      <Ionicons name={icon} size={12} color={hue} />
      <AppText variant="caption" style={{ color: hue }}>{label}</AppText>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active
          ? { backgroundColor: tint(brand.teal, t.dark ? 0.22 : 0.14), borderColor: 'transparent' }
          : { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border },
      ]}>
      <AppText variant="caption" tone={active ? 'accent' : 'muted'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 11 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  emptyChip: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
