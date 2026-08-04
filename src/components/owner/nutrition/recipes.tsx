/**
 * Recipes — ports the web NutritionRecipes + RecipeDetail/Edit/New pages.
 *
 * List with search and draft/published filter, a detail sheet showing computed
 * per-serving nutrition, ingredient editing against the food database, bulk
 * import by name, and bulk publish. Plan-gated on `recipes` (Scale Pro) — the
 * tab isn't rendered at all on plans without it, so this component only ever
 * mounts when the feature is unlocked.
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
import { useTheme } from '@/hooks/use-theme';
import { nutritionApi } from '@/lib/owner/api/nutrition';
import { recipesApi, type UpsertRecipeIngredientInput } from '@/lib/owner/api/recipes';
import { titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Filter = 'all' | 'published' | 'draft';

export function RecipesSection() {
  const t = useTheme();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const debounced = useDebouncedValue(query, 300);

  const listQ = useQuery({
    queryKey: ['recipes', debounced],
    queryFn: () => recipesApi.list({ search: debounced || undefined, includeDrafts: true }),
  });

  const bulkPublish = useMutation({
    mutationFn: () => recipesApi.bulkPublish({ publish: true, onlyWithIngredients: true }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      Alert.alert('Published', `${res.updated} recipe${res.updated === 1 ? '' : 's'} published.`);
    },
    onError: (e: Error) => Alert.alert('Could not publish', e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => recipesApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const rows = (listQ.data ?? []).filter((r) =>
    filter === 'all' ? true : filter === 'published' ? r.is_published : !r.is_published,
  );
  const draftCount = (listQ.data ?? []).filter((r) => !r.is_published).length;

  return (
    <>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search recipes" />
      <SegmentedTabs
        options={[
          { key: 'all', label: 'All', badge: listQ.data?.length },
          { key: 'published', label: 'Published' },
          { key: 'draft', label: 'Drafts', badge: draftCount || undefined },
        ]}
        value={filter}
        onChange={setFilter}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ActionButton label="New recipe" icon="add" onPress={() => setNewOpen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton
            label="Bulk import"
            icon="cloud-download-outline"
            tone="neutral"
            onPress={() => setImportOpen(true)}
          />
        </View>
      </View>

      {draftCount ? (
        <ActionButton
          label={`Publish ${draftCount} draft${draftCount === 1 ? '' : 's'} with ingredients`}
          icon="cloud-upload-outline"
          tone="neutral"
          loading={bulkPublish.isPending}
          onPress={() => bulkPublish.mutate()}
        />
      ) : null}

      {listQ.isLoading ? (
        <Loading />
      ) : listQ.isError ? (
        <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} lockedFeature="Recipes" />
      ) : !rows.length ? (
        <EmptyState
          icon="book-outline"
          title={debounced ? 'No matches' : 'No recipes yet'}
          body={
            debounced
              ? 'Try a different search.'
              : 'Build a recipe from the food database and its nutrition is computed for you.'
          }
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((r) => (
            <ListRow
              key={r.id}
              title={r.name}
              subtitle={[
                r.category ? titleCase(r.category) : null,
                `${r.servings} serving${r.servings === 1 ? '' : 's'}`,
                `${r.ingredient_count} ingredients`,
              ]
                .filter(Boolean)
                .join(' · ')}
              icon="book-outline"
              tint={r.is_published ? t.colors.success : undefined}
              meta={
                r.kcal_per_serving_estimate !== null
                  ? `~${Math.round(r.kcal_per_serving_estimate)} kcal`
                  : undefined
              }
              onPress={() => setOpenId(r.id)}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Pill label={r.is_published ? 'Live' : 'Draft'} tone={r.is_published ? 'success' : 'warning'} />
                  <AppText
                    variant="caption"
                    tone="danger"
                    onPress={() =>
                      Alert.alert('Delete recipe?', r.name, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(r.id) },
                      ])
                    }>
                    Delete
                  </AppText>
                </View>
              }
            />
          ))}
        </Card>
      )}

      <RecipeSheet recipeId={openId} onClose={() => setOpenId(null)} />
      <NewRecipeSheet visible={newOpen} onClose={() => setNewOpen(false)} onCreated={setOpenId} />
      <BulkImportSheet visible={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

/** Detail + ingredient editing. Nutrition is recomputed server-side on save. */
function RecipeSheet({ recipeId, onClose }: { recipeId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [addingIngredient, setAddingIngredient] = useState(false);

  const recipeQ = useQuery({
    queryKey: ['recipes', 'detail', recipeId],
    queryFn: () => recipesApi.get(recipeId!),
    enabled: !!recipeId,
  });

  const r = recipeQ.data;

  const save = useMutation({
    mutationFn: (ingredients: UpsertRecipeIngredientInput[]) =>
      recipesApi.update(recipeId!, { ingredients }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const togglePublish = useMutation({
    mutationFn: () => recipesApi.update(recipeId!, { is_published: !r?.recipe.is_published }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recipes'] }),
    onError: (e: Error) => Alert.alert('Could not update', e.message),
  });

  const currentIngredients = (): UpsertRecipeIngredientInput[] =>
    (r?.ingredients ?? []).map((i) => ({
      food_id: i.food_id,
      quantity_g: i.quantity_g,
      cooking_method: i.cooking_method,
      quantity_state: i.quantity_state,
      sort_order: i.sort_order,
      notes: i.notes,
    }));

  return (
    <Sheet visible={!!recipeId} onClose={onClose} title={r?.recipe.name ?? 'Recipe'}>
      {recipeQ.isLoading ? (
        <Loading />
      ) : recipeQ.isError ? (
        <QueryError error={recipeQ.error} onRetry={() => void recipeQ.refetch()} lockedFeature="Recipes" />
      ) : r ? (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Pill
              label={r.recipe.is_published ? 'Published' : 'Draft'}
              tone={r.recipe.is_published ? 'success' : 'warning'}
            />
            <Pill label={`${r.recipe.servings} servings`} />
            {r.recipe.category ? <Pill label={titleCase(r.recipe.category)} /> : null}
          </View>

          {r.recipe.description ? <AppText variant="body">{r.recipe.description}</AppText> : null}

          <Card style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="faint">
              PER SERVING
            </AppText>
            <Line label="Energy" value={`${Math.round(r.totals.per_serving.energy_kcal)} kcal`} />
            <Line label="Protein" value={`${round(r.totals.per_serving.protein_g)} g`} />
            <Line label="Carbohydrate" value={`${round(r.totals.per_serving.carbohydrate_g)} g`} />
            <Line label="Fat" value={`${round(r.totals.per_serving.fat_g)} g`} />
            <AppText variant="caption" tone="faint">
              {`Cooked weight ${Math.round(r.totals.final_cooked_weight_g)} g · engine ${r.meta.engine_version}`}
            </AppText>
          </Card>

          <AppText variant="label" tone="muted">
            INGREDIENTS
          </AppText>
          {!r.ingredients.length ? (
            <AppText variant="muted" tone="faint">
              No ingredients yet — a recipe needs at least one before it can be published.
            </AppText>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {r.ingredients.map((i) => (
                <ListRow
                  key={i.id}
                  title={i.food.canonical_name}
                  subtitle={`${i.quantity_g} g · ${titleCase(i.cooking_method)} · ${titleCase(i.quantity_state)}`}
                  icon="nutrition-outline"
                  meta={`${Math.round(i.nutrition.energy_kcal)} kcal`}
                  right={
                    <AppText
                      variant="caption"
                      tone="danger"
                      onPress={() =>
                        save.mutate(currentIngredients().filter((x) => x.food_id !== i.food_id))
                      }>
                      Remove
                    </AppText>
                  }
                />
              ))}
            </Card>
          )}

          <ActionButton
            label="Add an ingredient"
            icon="add"
            tone="neutral"
            onPress={() => setAddingIngredient(true)}
          />

          {r.recipe.instructions ? (
            <Card style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="faint">
                METHOD
              </AppText>
              <AppText variant="body">{r.recipe.instructions}</AppText>
            </Card>
          ) : null}

          <ActionButton
            label={r.recipe.is_published ? 'Unpublish' : 'Publish recipe'}
            icon={r.recipe.is_published ? 'eye-off-outline' : 'cloud-upload-outline'}
            loading={togglePublish.isPending}
            disabled={!r.recipe.is_published && !r.ingredients.length}
            onPress={() => togglePublish.mutate()}
          />

          <AddIngredientSheet
            visible={addingIngredient}
            onClose={() => setAddingIngredient(false)}
            onAdd={(ing) => {
              save.mutate([...currentIngredients(), ing]);
              setAddingIngredient(false);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

function AddIngredientSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (i: UpsertRecipeIngredientInput) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [grams, setGrams] = useState('100');
  const debounced = useDebouncedValue(query, 300);

  const searchQ = useQuery({
    queryKey: ['nutrition', 'foods', debounced, 'all'],
    queryFn: () => nutritionApi.searchFoods({ q: debounced, limit: 25 }),
    enabled: visible && debounced.length > 1,
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Add ingredient">
      {picked ? (
        <>
          <Card>
            <AppText variant="heading">{picked.name}</AppText>
          </Card>
          <Field label="Quantity (g, raw)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" />
          <ActionButton
            label="Add to recipe"
            disabled={!Number(grams)}
            onPress={() => {
              onAdd({ food_id: picked.id, quantity_g: Number(grams), quantity_state: 'raw' });
              setPicked(null);
              setQuery('');
              setGrams('100');
            }}
          />
          <ActionButton label="Pick a different food" tone="neutral" onPress={() => setPicked(null)} />
        </>
      ) : (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search the food database" />
          {searchQ.isLoading ? (
            <Loading />
          ) : !searchQ.data?.length ? (
            <AppText variant="muted" tone="faint">
              {debounced.length > 1 ? 'No matches.' : 'Type at least two letters.'}
            </AppText>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {searchQ.data.map((hit) => (
                <ListRow
                  key={hit.food.id}
                  title={hit.food.canonical_name}
                  meta={
                    hit.energy_kcal_per_100g !== null ? `${Math.round(hit.energy_kcal_per_100g)} kcal` : undefined
                  }
                  icon="nutrition-outline"
                  onPress={() => setPicked({ id: hit.food.id, name: hit.food.canonical_name })}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </Sheet>
  );
}

function NewRecipeSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [servings, setServings] = useState('2');
  const [instructions, setInstructions] = useState('');

  const create = useMutation({
    mutationFn: () =>
      recipesApi.create({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        servings: Number(servings) || 1,
        instructions: instructions.trim() || null,
        ingredients: [],
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      setName('');
      setDescription('');
      setInstructions('');
      onClose();
      onCreated(res.recipe.id);
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="New recipe">
      <Field label="Name" value={name} onChangeText={setName} placeholder="Sprouted moong salad" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Category" value={category} onChangeText={setCategory} placeholder="Breakfast" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Servings" value={servings} onChangeText={setServings} keyboardType="number-pad" />
        </View>
      </View>
      <Field
        label="Method"
        value={instructions}
        onChangeText={setInstructions}
        multiline
        style={{ minHeight: 110, textAlignVertical: 'top' }}
      />
      <ActionButton
        label="Create draft"
        disabled={!name.trim()}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}

function BulkImportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [names, setNames] = useState('');

  const list = names
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean);

  const run = useMutation({
    mutationFn: () => recipesApi.bulkImport(list),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      setNames('');
      onClose();
      Alert.alert('Import finished', `${res.created} created, ${res.replaced} replaced, ${res.total} total.`);
    },
    onError: (e: Error) => Alert.alert('Import failed', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Bulk import recipes">
      <AppText variant="caption" tone="faint">
        One dish name per line. Each becomes a draft recipe with AI-suggested ingredients you can then correct.
      </AppText>
      <Field
        label="Dish names"
        value={names}
        onChangeText={setNames}
        multiline
        placeholder={'Palak paneer\nVegetable upma\nOats chilla'}
        style={{ minHeight: 150, textAlignVertical: 'top' }}
        hint={list.length ? `${list.length} recipes` : undefined}
      />
      <ActionButton
        label={list.length ? `Import ${list.length}` : 'Import'}
        disabled={!list.length}
        loading={run.isPending}
        onPress={() => run.mutate()}
      />
    </Sheet>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText variant="muted" tone="muted">
        {label}
      </AppText>
      <AppText variant="muted">{value}</AppText>
    </View>
  );
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
