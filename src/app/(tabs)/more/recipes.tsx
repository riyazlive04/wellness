import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type RecipeListItem } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

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
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={[styles.search, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
          <Ionicons name="search" size={18} color={t.colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search recipes"
            placeholderTextColor={t.colors.textFaint}
            style={{ flex: 1, color: t.colors.text, fontSize: 15 }}
          />
        </View>
        {cuisines.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label="All" active={cuisine === null} onPress={() => setCuisine(null)} />
            {cuisines.map((c) => <Chip key={c} label={c} active={cuisine === c} onPress={() => setCuisine(c)} />)}
          </ScrollView>
        ) : null}
      </View>

      <ScreenScroll contentContainerStyle={{ paddingTop: 0 }}>
        {recipesQ.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : recipes.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="book-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">No recipes found.</AppText>
          </Card>
        ) : (
          recipes.map((r) => <RecipeCard key={r.id} r={r} />)
        )}
      </ScreenScroll>
    </Screen>
  );
}

function RecipeCard({ r }: { r: RecipeListItem }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }}>{r.name}</AppText>
        {r.video_url ? <Ionicons name="play-circle-outline" size={18} color={t.colors.accent} /> : null}
      </View>
      {r.description ? <AppText variant="muted" tone="muted" numberOfLines={2}>{r.description}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: 2 }}>
        {r.category ? <AppText variant="caption" tone="faint">{r.category}</AppText> : null}
        <AppText variant="caption" tone="faint">{r.servings} serving{r.servings === 1 ? '' : 's'}</AppText>
        {r.total_kcal ? <AppText variant="caption" tone="faint">{r.total_kcal} kcal</AppText> : null}
      </View>
    </Card>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { borderColor: active ? 'transparent' : t.colors.border, backgroundColor: active ? t.colors.primary : 'transparent' }]}>
      <AppText variant="caption" tone={active ? 'onBrand' : 'muted'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
});
