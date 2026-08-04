/**
 * Food library — ports the web NutritionFoods + NutritionFoodDetail pages.
 *
 * Search the shared food database, inspect a food's full nutrient panel, and
 * manage the practice's own custom foods. Detail opens in a sheet rather than
 * a route: on a phone, bouncing out of a search result list and back loses
 * your place.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  Pill,
  SearchField,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  CATEGORY_LABEL,
  CATEGORY_LIST,
  nutritionApi,
  type FoodCategory,
} from '@/lib/owner/api/nutrition';
import { titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Mode = 'search' | 'custom';

export function FoodsSection() {
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FoodCategory | 'all'>('all');
  const [openFoodId, setOpenFoodId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const debounced = useDebouncedValue(query, 300);

  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', debounced, category],
    queryFn: () =>
      nutritionApi.searchFoods({
        q: debounced || undefined,
        category: category === 'all' ? undefined : category,
        limit: 40,
      }),
    enabled: mode === 'search',
  });

  const customQ = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: nutritionApi.listCustomFoods,
    enabled: mode === 'custom',
  });

  const qc = useQueryClient();
  const removeCustom = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteCustomFood(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  return (
    <>
      <SegmentedTabs
        options={[
          { key: 'search', label: 'Search database' },
          { key: 'custom', label: 'My foods' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'search' ? (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search foods, e.g. moong dal" />
          <SegmentedTabs
            options={[
              { key: 'all', label: 'All' },
              ...CATEGORY_LIST.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })),
            ]}
            value={category}
            onChange={setCategory}
          />

          {searchQ.isLoading ? (
            <Loading />
          ) : searchQ.isError ? (
            <QueryError error={searchQ.error} onRetry={() => void searchQ.refetch()} />
          ) : !searchQ.data?.length ? (
            <EmptyState
              icon="search-outline"
              title={debounced ? 'No matches' : 'Search the food database'}
              body={
                debounced
                  ? "Nothing matched. Try a simpler name, or add it as one of your own foods."
                  : 'Type a food name to see its per-100g nutrition.'
              }
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {searchQ.data.map((hit) => (
                <ListRow
                  key={hit.food.id}
                  title={hit.food.canonical_name}
                  subtitle={[
                    CATEGORY_LABEL[hit.food.category],
                    hit.macros
                      ? `P ${fmt(hit.macros.protein_g)} · C ${fmt(hit.macros.carbohydrate_g)} · F ${fmt(hit.macros.fat_g)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="nutrition-outline"
                  meta={hit.energy_kcal_per_100g !== null ? `${Math.round(hit.energy_kcal_per_100g)} kcal` : undefined}
                  onPress={() => setOpenFoodId(hit.food.id)}
                />
              ))}
            </Card>
          )}
        </>
      ) : (
        <>
          <ActionButton label="Add a custom food" icon="add" onPress={() => setAddOpen(true)} />
          {customQ.isLoading ? (
            <Loading />
          ) : !customQ.data?.length ? (
            <EmptyState
              icon="create-outline"
              title="No custom foods"
              body="Add the regional dishes and branded products your clients actually eat but the database doesn't carry."
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {customQ.data.map((f) => (
                <ListRow
                  key={f.id}
                  title={f.canonical_name}
                  subtitle={[
                    CATEGORY_LABEL[f.category],
                    f.nutrients.protein_g !== null && f.nutrients.protein_g !== undefined
                      ? `P ${fmt(f.nutrients.protein_g)}`
                      : null,
                    f.source_citation,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="create-outline"
                  meta={f.nutrients.energy_kcal ? `${Math.round(f.nutrients.energy_kcal)} kcal` : undefined}
                  right={
                    <AppText
                      variant="caption"
                      tone="danger"
                      onPress={() =>
                        Alert.alert('Delete food?', f.canonical_name, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeCustom.mutate(f.id) },
                        ])
                      }>
                      Delete
                    </AppText>
                  }
                />
              ))}
            </Card>
          )}
        </>
      )}

      <FoodDetailSheet foodId={openFoodId} onClose={() => setOpenFoodId(null)} />
      <AddCustomFoodSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 10) / 10}g`;
}

function FoodDetailSheet({ foodId, onClose }: { foodId: string | null; onClose: () => void }) {
  const detailQ = useQuery({
    queryKey: ['nutrition', 'food', foodId],
    queryFn: () => nutritionApi.getFood(foodId!),
    enabled: !!foodId,
  });

  const d = detailQ.data;
  const n = d?.nutrients;

  return (
    <Sheet visible={!!foodId} onClose={onClose} title={d?.canonical_name ?? 'Food'}>
      {detailQ.isLoading ? (
        <Loading />
      ) : detailQ.isError ? (
        <QueryError error={detailQ.error} onRetry={() => void detailQ.refetch()} />
      ) : d && n ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Pill label={CATEGORY_LABEL[d.category]} tone="accent" />
            <Pill label={titleCase(d.measurement_state)} />
            <Pill label={d.source.toUpperCase()} />
          </View>

          <Card style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="faint">
              PER 100 G
            </AppText>
            <NutrientLine label="Energy" value={`${Math.round(n.energy_kcal)} kcal`} />
            <NutrientLine label="Protein" value={fmt(n.protein_g)} />
            <NutrientLine label="Carbohydrate" value={fmt(n.carbohydrate_g)} />
            <NutrientLine label="Fat" value={fmt(n.fat_g)} />
            <NutrientLine label="Fibre" value={fmt(n.fiber_g)} />
            <NutrientLine label="Sugar" value={fmt(n.sugar_g)} />
            <NutrientLine label="Saturated fat" value={fmt(n.saturated_fat_g)} />
          </Card>

          {d.default_serving_g ? (
            <AppText variant="caption" tone="faint">
              {`Typical serving ${d.default_serving_g} g · edible portion ${Math.round(d.edible_portion_fraction * 100)}%`}
            </AppText>
          ) : null}

          <AppText variant="caption" tone="faint">
            {`Source ${d.source} · ${d.source_version}`}
          </AppText>
        </>
      ) : null}
    </Sheet>
  );
}

function NutrientLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="muted" tone="muted">
        {label}
      </AppText>
      <AppText variant="muted">{value}</AppText>
    </View>
  );
}

function AddCustomFoodSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FoodCategory>(CATEGORY_LIST[0]);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [citation, setCitation] = useState('');

  const create = useMutation({
    mutationFn: () =>
      nutritionApi.createCustomFood({
        name: name.trim(),
        category,
        energy_kcal: Number(kcal) || 0,
        protein_g: protein ? Number(protein) : undefined,
        carbohydrate_g: carbs ? Number(carbs) : undefined,
        fat_g: fat ? Number(fat) : undefined,
        fiber_g: fiber ? Number(fiber) : undefined,
        source_citation: citation.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
      setName('');
      setKcal('');
      setProtein('');
      setCarbs('');
      setFat('');
      setFiber('');
      setCitation('');
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not add', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a custom food">
      <AppText variant="caption" tone="faint">
        All values are per 100 g, the same basis as the shared database.
      </AppText>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Ragi mudde" />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          CATEGORY
        </AppText>
        <SegmentedTabs
          options={CATEGORY_LIST.map((c) => ({ key: c, label: CATEGORY_LABEL[c] }))}
          value={category}
          onChange={setCategory}
        />
      </View>
      <Field label="Energy (kcal)" value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Fibre (g)" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" />
        </View>
      </View>
      <Field
        label="Source (optional)"
        value={citation}
        onChangeText={setCitation}
        placeholder="Label, IFCT 2017, lab report…"
      />
      <ActionButton
        label="Add food"
        disabled={!name.trim() || !kcal}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}
