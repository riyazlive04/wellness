/**
 * A client's weekly meal plans — the phone version of the web MealPlanTab.
 *
 * Same plans, same rules: weeks are drafts until published, AI only ever
 * drafts (the nutritionist publishes), and the meal times are the practice's
 * own, shared by every client. On a phone the week reads one day at a time
 * instead of as a 7-column grid. Renaming meal times and PDF / Excel export
 * stay on the web.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ActionButton, EmptyState, Field, Loading, Pill, SearchField, SegmentedTabs, Sheet } from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_SLOTS,
  MEAL_SLOTS,
  SLOT_LABELS,
  cardsByDay,
  dayDate,
  mealPlansApi,
  slotLabel,
  type AddCardInput,
  type MealCard,
  type MealPlan,
  type MealSlot,
  type MealSlotEntry,
  type SavedMeal,
} from '@/lib/owner/api/mealPlans';
import { ownerClientsApi, type ClientListItem } from '@/lib/owner/api/clients';
import { nutritionApi, type FoodSearchHit } from '@/lib/owner/api/nutrition';
import { radius, spacing } from '@/lib/theme';

/** Next Monday (today if it is Monday), as YYYY-MM-DD: the natural start of a new week. */
function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const delta = day === 1 ? 0 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function MealPlanTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [editing, setEditing] = useState<{ slot: MealSlot; card?: MealCard } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const plansQ = useQuery({
    queryKey: ['workspace', 'meal-plans', clientId],
    queryFn: () => mealPlansApi.list(clientId),
    staleTime: 30_000,
  });
  const plans = plansQ.data?.items ?? [];
  const activeId = selectedId ?? plans[0]?.id ?? null;

  const planQ = useQuery({
    queryKey: ['workspace', 'meal-plan', activeId],
    queryFn: () => mealPlansApi.get(activeId!),
    enabled: !!activeId,
  });
  const plan = planQ.data;

  const slotsQ = useQuery({
    queryKey: ['workspace', 'meal-plans', 'slots'],
    queryFn: () => mealPlansApi.slots(),
    staleTime: 30_000,
  });
  const schedule: MealSlotEntry[] = useMemo(
    () => slotsQ.data?.schedule ?? DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false })),
    [slotsQ.data?.schedule],
  );
  const labelOf = (slot: MealSlot) => schedule.find((e) => e.slot === slot)?.label ?? slotLabel(plan, slot);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plan', activeId] });
    void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
  };

  const create = useMutation({
    mutationFn: () => mealPlansApi.create({ clientId, startDate: nextMonday() }),
    onSuccess: (p) => {
      setSelectedId(p.id);
      setDay(1);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
    },
    onError: (e: Error) => Alert.alert('Could not create the week', e.message),
  });
  const setStatus = useMutation({
    mutationFn: (status: 'draft' | 'published') => mealPlansApi.setStatus(plan!.id, status),
    onSuccess: (p) => {
      refresh();
      Alert.alert(p.status === 'published' ? 'Published' : 'Back to draft', p.status === 'published' ? `${clientName} can now see this plan.` : undefined);
    },
    onError: (e: Error) => Alert.alert('Could not change the status', e.message),
  });
  const duplicate = useMutation({
    mutationFn: () => mealPlansApi.duplicate(plan!.id, nextMonday()),
    onSuccess: (p) => {
      setSelectedId(p.id);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
      Alert.alert('Copied', `Copied to week ${p.week_number}.`);
    },
    onError: (e: Error) => Alert.alert('Could not duplicate', e.message),
  });
  const remove = useMutation({
    mutationFn: () => mealPlansApi.remove(plan!.id),
    onSuccess: () => {
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', clientId] });
    },
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const byDay = useMemo(() => cardsByDay(plan?.cards), [plan?.cards]);
  // The practice's meal times, plus any other slot this week already has meals in.
  const visibleSlots = useMemo<MealSlot[]>(() => {
    const used = new Set((plan?.cards ?? []).map((c) => c.meal_type));
    schedule.forEach((e) => used.add(e.slot));
    return MEAL_SLOTS.filter((s) => used.has(s));
  }, [plan?.cards, schedule]);

  if (plansQ.isLoading) return <Loading />;
  if (plansQ.isError) return <QueryError error={plansQ.error} onRetry={() => void plansQ.refetch()} />;

  if (!plans.length) {
    return (
      <EmptyState
        icon="restaurant-outline"
        title="No meal plans yet"
        body={`Build ${clientName} a week of meals: write it yourself, or let AI draft it from their profile and edit from there.`}
        action={<ActionButton label="Start week 1" icon="add" loading={create.isPending} onPress={() => create.mutate()} />}
      />
    );
  }

  const dayCards = byDay.get(day) ?? [];
  const dayKcal = dayCards.reduce((s, c) => s + (c.kcal ?? 0), 0);

  return (
    <>
      {/* Weeks */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
        {plans.map((p) => {
          const on = p.id === activeId;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                setSelectedId(p.id);
                setDay(1);
              }}
              style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : t.colors.surface }]}>
              <AppText variant="caption" style={{ color: on ? t.colors.primary : t.colors.text, fontWeight: '700' }}>
                Week {p.week_number}
              </AppText>
              <View style={[styles.dot, { backgroundColor: p.status === 'published' ? t.colors.success : t.colors.warning }]} />
            </Pressable>
          );
        })}
        <Pressable onPress={() => create.mutate()} disabled={create.isPending} style={[styles.chip, styles.dashed, { borderColor: t.colors.border }]}>
          <Ionicons name="add" size={14} color={t.colors.textMuted} />
          <AppText variant="caption" tone="muted" style={{ fontWeight: '600' }}>
            New week
          </AppText>
        </Pressable>
      </ScrollView>

      {planQ.isLoading || !plan ? (
        <Loading />
      ) : (
        <>
          {/* The week */}
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText variant="heading" style={{ flex: 1 }}>
                Week {plan.week_number}
              </AppText>
              <Pill label={plan.status === 'published' ? 'Published' : 'Draft'} tone={plan.status === 'published' ? 'success' : 'warning'} />
            </View>
            <AppText variant="muted" tone="muted">
              {shortDate(plan.start_date)} – {shortDate(plan.end_date)} · {plan.total_kcal.toLocaleString('en-IN')} kcal
              {byDay.size ? ` · ≈${Math.round(plan.total_kcal / byDay.size)} kcal/day` : ''}
            </AppText>
            {plan.status === 'published' ? (
              <ActionButton label="Unpublish" icon="arrow-undo-outline" tone="neutral" loading={setStatus.isPending} onPress={() => setStatus.mutate('draft')} />
            ) : (
              <ActionButton label="Publish to client" icon="send" loading={setStatus.isPending} onPress={() => setStatus.mutate('published')} />
            )}
            <View style={styles.tools}>
              <Tool icon="sparkles-outline" label="AI draft" disabled={!slotsQ.data?.aiEnabled} onPress={() => setAiOpen(true)} />
              <Tool icon="copy-outline" label="Duplicate" disabled={duplicate.isPending} onPress={() => duplicate.mutate()} />
              <Tool icon="person-add-outline" label="Copy to client" disabled={!plan.cards?.length} onPress={() => setCopyOpen(true)} />
              <Tool
                icon="trash-outline"
                label="Delete"
                danger
                disabled={remove.isPending}
                onPress={() =>
                  Alert.alert(`Delete week ${plan.week_number}?`, 'This removes its meals.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
                  ])
                }
              />
            </View>
            {!slotsQ.data?.aiEnabled && slotsQ.data ? (
              <AppText variant="caption" tone="faint">
                AI is off for your practice. See Settings → AI.
              </AppText>
            ) : null}
          </Card>

          {/* Days */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
            {Array.from({ length: 7 }, (_, i) => {
              const n = i + 1;
              const d = dayDate(plan.start_date, n);
              const kcal = (byDay.get(n) ?? []).reduce((s, c) => s + (c.kcal ?? 0), 0);
              const on = n === day;
              return (
                <Pressable
                  key={n}
                  onPress={() => setDay(n)}
                  style={[styles.dayChip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? t.colors.primary : t.colors.surface }]}>
                  <AppText variant="caption" style={{ color: on ? '#fff' : t.colors.textMuted, fontWeight: '600' }}>
                    {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </AppText>
                  <AppText variant="heading" style={{ color: on ? '#fff' : t.colors.text }}>
                    {d.getDate()}
                  </AppText>
                  <AppText variant="caption" style={{ color: on ? 'rgba(255,255,255,0.85)' : t.colors.textFaint, fontSize: 10 }}>
                    {kcal ? `${kcal}` : '–'}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          <AppText variant="label" tone="muted">
            DAY {day} · {dayKcal.toLocaleString('en-IN')} KCAL
          </AppText>
          {visibleSlots.map((slot) => {
            const cards = dayCards.filter((c) => c.meal_type === slot);
            return (
              <Card key={slot} style={{ gap: spacing.sm, padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <AppText variant="body" style={{ flex: 1, fontWeight: '700' }}>
                    {labelOf(slot)}
                  </AppText>
                  <Pressable onPress={() => setEditing({ slot })} hitSlop={8} style={styles.addBtn} accessibilityLabel={`Add a meal to ${labelOf(slot)}`}>
                    <Ionicons name="add" size={16} color={t.colors.primary} />
                    <AppText variant="caption" style={{ color: t.colors.primary, fontWeight: '700' }}>
                      Add
                    </AppText>
                  </Pressable>
                </View>
                {cards.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setEditing({ slot, card: c })}
                    style={[styles.meal, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="body" numberOfLines={2}>
                        {c.meal_name}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {[
                          c.quantity ? `${c.quantity}${c.unit ? ` ${c.unit}` : ''}` : null,
                          c.kcal ? `${c.kcal} kcal` : null,
                          c.protein_g != null ? `P ${c.protein_g}g` : null,
                          c.carbs_g != null ? `C ${c.carbs_g}g` : null,
                          c.fat_g != null ? `F ${c.fat_g}g` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </AppText>
                    </View>
                    <Ionicons name="create-outline" size={16} color={t.colors.textFaint} />
                  </Pressable>
                ))}
                {!cards.length ? (
                  <AppText variant="caption" tone="faint">
                    Nothing planned.
                  </AppText>
                ) : null}
              </Card>
            );
          })}

          {/* Keyed so the box starts from the saved notes whenever the week or its notes change. */}
          <PlanNotes key={`${plan.id}:${plan.notes ?? ''}`} plan={plan} onSaved={refresh} />
        </>
      )}

      {editing && plan ? (
        <MealSheet
          planId={plan.id}
          day={day}
          slot={editing.slot}
          slotName={labelOf(editing.slot)}
          card={editing.card}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {aiOpen && plan ? (
        <AiDraftSheet plan={plan} schedule={schedule} clientName={clientName} onClose={() => setAiOpen(false)} onDone={refresh} />
      ) : null}
      {copyOpen && plan ? (
        <CopyToClientSheet plan={plan} fromClientId={clientId} fromClientName={clientName} onClose={() => setCopyOpen(false)} />
      ) : null}
    </>
  );
}

function Tool({ icon, label, onPress, disabled, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const t = useTheme();
  const color = danger ? t.colors.danger : t.colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.tool, { borderColor: t.colors.border, opacity: disabled ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={15} color={color} />
      <AppText variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PlanNotes({ plan, onSaved }: { plan: MealPlan; onSaved: () => void }) {
  const [draft, setDraft] = useState(plan.notes ?? '');
  const save = useMutation({
    mutationFn: () => mealPlansApi.updateNotes(plan.id, draft),
    onSuccess: onSaved,
    onError: (e: Error) => Alert.alert('Could not save notes', e.message),
  });
  const dirty = draft !== (plan.notes ?? '');
  return (
    <Card style={{ gap: spacing.sm }}>
      <Field
        label="NUTRITIONIST'S NOTES"
        hint="Shown to the client and on the PDF."
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={4000}
        placeholder="General guidance for the week: do's and don'ts, hydration, portion tips…"
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
      {dirty ? <ActionButton label="Save notes" icon="save-outline" loading={save.isPending} onPress={() => save.mutate()} /> : null}
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── add / edit meal ────

const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : undefined);
const str = (n: number | null | undefined) => (n != null ? String(n) : '');

function MealSheet({
  planId,
  day,
  slot,
  slotName,
  card,
  onClose,
  onSaved,
}: {
  planId: string;
  day: number;
  slot: MealSlot;
  slotName: string;
  card?: MealCard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'custom' | 'library'>('custom');
  const [search, setSearch] = useState('');
  const [name, setName] = useState(card?.meal_name ?? '');
  const [quantity, setQuantity] = useState(str(card?.quantity));
  const [unit, setUnit] = useState(card?.unit ?? '');
  const [kcal, setKcal] = useState(card?.kcal ? String(card.kcal) : '');
  const [protein, setProtein] = useState(str(card?.protein_g));
  const [carbs, setCarbs] = useState(str(card?.carbs_g));
  const [fat, setFat] = useState(str(card?.fat_g));
  const [fiber, setFiber] = useState(str(card?.fiber_g));
  const [description, setDescription] = useState(card?.description ?? '');
  const [ingredients, setIngredients] = useState(card?.ingredients ?? '');
  const [source, setSource] = useState<{ type: 'recipe' | 'food'; id: string } | null>(
    card?.source_type && card.source_id ? { type: card.source_type, id: card.source_id } : null,
  );

  const q = search.trim();
  const savedQ = useQuery({
    queryKey: ['workspace', 'meal-plans', 'saved-meals', q],
    queryFn: () => mealPlansApi.savedMeals(q || undefined),
    enabled: mode === 'library',
    staleTime: 30_000,
  });
  const foodsQ = useQuery({
    queryKey: ['nutrition', 'foods', 'picker', q],
    queryFn: () => nutritionApi.searchFoods({ q, limit: 8 }),
    enabled: mode === 'library' && q.length >= 2,
    staleTime: 60_000,
  });

  const clearMacros = () => {
    setProtein('');
    setCarbs('');
    setFat('');
    setFiber('');
  };
  const pickSaved = (m: SavedMeal) => {
    setName(m.meal_name);
    setKcal(m.kcal ? String(Math.round(m.kcal)) : '');
    setQuantity(str(m.quantity));
    setUnit(m.unit ?? '');
    setDescription(m.description ?? '');
    setIngredients(m.ingredients ?? '');
    clearMacros();
    setSource(null);
    setMode('custom');
  };
  const pickFood = (hit: FoodSearchHit) => {
    const grams = hit.food.default_serving_g ?? 100;
    const per = (v: number | null | undefined) => (v != null ? String(Math.round(((v * grams) / 100) * 10) / 10) : '');
    setName(hit.food.canonical_name);
    setKcal(hit.energy_kcal_per_100g != null ? String(Math.round((hit.energy_kcal_per_100g * grams) / 100)) : '');
    setQuantity(String(grams));
    setUnit('g');
    setProtein(per(hit.macros?.protein_g));
    setCarbs(per(hit.macros?.carbohydrate_g));
    setFat(per(hit.macros?.fat_g));
    setFiber(per(hit.macros?.fiber_g));
    setSource({ type: 'food', id: hit.food.id });
    setMode('custom');
  };

  const estimate = useMutation({
    mutationFn: () => {
      const qty = Number(quantity.trim());
      return mealPlansApi.estimateMacros({
        mealName: name.trim(),
        quantity: quantity.trim() && Number.isFinite(qty) ? qty : undefined,
        unit: unit.trim() || undefined,
        ingredients: ingredients.trim() || undefined,
        description: description.trim() || undefined,
      });
    },
    onSuccess: (r) => {
      setKcal(String(r.kcal));
      setProtein(String(r.protein_g));
      setCarbs(String(r.carbs_g));
      setFat(String(r.fat_g));
      if (r.fiber_g != null) setFiber(String(r.fiber_g));
    },
    onError: (e: Error) => Alert.alert('Could not estimate', e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const input: AddCardInput = {
        dayNumber: day,
        mealType: slot,
        mealName: name.trim(),
        kcal: kcal.trim() ? Math.max(0, Math.round(Number(kcal))) : 0,
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
        fiber: num(fiber),
        quantity: quantity.trim() ? Number(quantity.trim()) : undefined,
        unit: unit.trim() || undefined,
        description: description.trim() || undefined,
        ingredients: ingredients.trim() || undefined,
        sourceType: source?.type,
        sourceId: source?.id,
      };
      return card ? mealPlansApi.updateCard(planId, card.id, input) : mealPlansApi.addCard(planId, input);
    },
    onSuccess: () => {
      if (!source) void qc.invalidateQueries({ queryKey: ['workspace', 'meal-plans', 'saved-meals'] });
      onSaved();
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not save this meal', e.message),
  });
  const del = useMutation({
    mutationFn: () => mealPlansApi.removeCard(planId, card!.id),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not remove', e.message),
  });

  const trySave = () => {
    if (!name.trim()) return Alert.alert('Give the meal a name');
    if (quantity.trim() && !Number.isFinite(Number(quantity.trim()))) {
      return Alert.alert('Quantity must be a number', 'Put the words in Unit, e.g. 2 / katori.');
    }
    save.mutate();
  };

  return (
    <Sheet visible onClose={onClose} title={`${card ? 'Edit meal' : 'Add meal'} · Day ${day} · ${slotName}`}>
      <SegmentedTabs
        options={[
          { key: 'custom', label: 'Type it' },
          { key: 'library', label: 'From library' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'library' ? (
        <>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search foods and your meals…" autoFocus />
          {savedQ.data?.length ? (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="muted">
                MY MEALS
              </AppText>
              {savedQ.data.slice(0, 8).map((m, i) => (
                <PickRow key={`${m.meal_name}-${i}`} title={m.meal_name} sub={[m.quantity && `${m.quantity} ${m.unit ?? ''}`, m.kcal ? `${Math.round(m.kcal)} kcal` : null].filter(Boolean).join(' · ')} onPress={() => pickSaved(m)} />
              ))}
            </View>
          ) : null}
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="muted">
              FOOD LIBRARY
            </AppText>
            {q.length < 2 ? (
              <AppText variant="caption" tone="faint">
                Type at least 2 letters to search the food library.
              </AppText>
            ) : foodsQ.isLoading ? (
              <Loading />
            ) : !foodsQ.data?.length ? (
              <AppText variant="caption" tone="faint">
                No foods match.
              </AppText>
            ) : (
              foodsQ.data.map((h) => (
                <PickRow
                  key={h.food.id}
                  title={h.food.canonical_name}
                  sub={`${h.food.default_serving_g ?? 100} g${h.energy_kcal_per_100g != null ? ` · ${Math.round((h.energy_kcal_per_100g * (h.food.default_serving_g ?? 100)) / 100)} kcal` : ''}`}
                  onPress={() => pickFood(h)}
                />
              ))
            )}
          </View>
        </>
      ) : (
        <>
          <Field label="MEAL" value={name} onChangeText={setName} placeholder="e.g. 2 rotis with dal" maxLength={200} />
          <View style={styles.grid}>
            <Small label="QTY" value={quantity} onChange={setQuantity} placeholder="2" numeric />
            <Small label="UNIT" value={unit} onChange={setUnit} placeholder="katori" />
            <Small label="KCAL" value={kcal} onChange={setKcal} placeholder="320" numeric />
          </View>
          <View style={styles.grid}>
            <Small label="PROTEIN g" value={protein} onChange={setProtein} placeholder="12" numeric />
            <Small label="CARBS g" value={carbs} onChange={setCarbs} placeholder="40" numeric />
            <Small label="FAT g" value={fat} onChange={setFat} placeholder="8" numeric />
            <Small label="FIBRE g" value={fiber} onChange={setFiber} placeholder="5" numeric />
          </View>
          <ActionButton
            label={estimate.isPending ? 'Estimating…' : 'Estimate with AI'}
            icon="sparkles-outline"
            tone="neutral"
            loading={estimate.isPending}
            disabled={!name.trim()}
            onPress={() => estimate.mutate()}
          />
          {estimate.isSuccess ? (
            <AppText variant="caption" tone="faint">
              Filled in by AI. Check the numbers, then save.
            </AppText>
          ) : null}
          <Field
            label="HOW TO HAVE IT (OPTIONAL)"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="e.g. eat within 30 min of waking"
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <Field
            label="INGREDIENTS (OPTIONAL)"
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            placeholder="wheat flour, toor dal, ghee"
            style={{ minHeight: 64, textAlignVertical: 'top' }}
          />
          <ActionButton label={card ? 'Save changes' : 'Add meal'} icon="checkmark" loading={save.isPending} onPress={trySave} />
          {card ? (
            <Pressable
              onPress={() =>
                Alert.alert('Remove this meal?', card.meal_name, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => del.mutate() },
                ])
              }
              style={{ alignSelf: 'center', padding: spacing.sm }}>
              <AppText variant="caption" style={{ color: t.colors.danger, fontWeight: '700' }}>
                {del.isPending ? 'Removing…' : 'Remove meal'}
              </AppText>
            </Pressable>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function Small({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; numeric?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 70 }}>
      <Field label={label} value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={numeric ? 'decimal-pad' : 'default'} />
    </View>
  );
}

function PickRow({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.pick, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {sub ? (
          <AppText variant="caption" tone="faint">
            {sub}
          </AppText>
        ) : null}
      </View>
      <Ionicons name="add-circle-outline" size={20} color={t.colors.primary} />
    </Pressable>
  );
}

// ──────────────────────────────────────────────────────────────── AI draft ────

function AiDraftSheet({
  plan,
  schedule,
  clientName,
  onClose,
  onDone,
}: {
  plan: MealPlan;
  schedule: MealSlotEntry[];
  clientName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const hasCards = !!plan.cards?.length;
  const [slots, setSlots] = useState<MealSlot[]>(() => (schedule.length ? schedule.map((e) => e.slot) : DEFAULT_SLOTS));
  const [notes, setNotes] = useState('');
  const [replace, setReplace] = useState(hasCards);

  const run = useMutation({
    mutationFn: () => mealPlansApi.generate(plan.id, { slots, notes: notes.trim() || undefined, replace }),
    onSuccess: () => {
      onDone();
      onClose();
      Alert.alert('Draft ready', 'Review it before publishing.');
    },
    onError: (e: Error) => Alert.alert('Could not draft the week', e.message),
  });
  const toggle = (s: MealSlot) =>
    setSlots((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : MEAL_SLOTS.filter((m) => m === s || cur.includes(m))));
  const options = schedule.length ? schedule : DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false }));

  return (
    <Sheet visible onClose={() => !run.isPending && onClose()} title={`Draft week ${plan.week_number} with AI`}>
      <AppText variant="muted" tone="muted">
        Uses {clientName}&apos;s goals, targets, allergies and preferences. Nothing is published until you do it.
      </AppText>
      <AppText variant="label" tone="muted">
        MEAL TIMES
      </AppText>
      <View style={styles.wrap}>
        {options.map((e) => {
          const on = slots.includes(e.slot);
          return (
            <Pressable
              key={e.slot}
              onPress={() => toggle(e.slot)}
              style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={on ? t.colors.primary : t.colors.textFaint} />
              <AppText variant="caption" style={{ fontWeight: '600' }}>
                {e.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <Field
        label="ANYTHING TO KEEP IN MIND (OPTIONAL)"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="e.g. South Indian, no onion or garlic, 1600 kcal"
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      {hasCards ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText variant="body" style={{ flex: 1 }}>
            Replace the meals already in this week
          </AppText>
          <Switch value={replace} onValueChange={setReplace} trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }} />
        </View>
      ) : null}
      <ActionButton
        label={run.isPending ? 'Drafting… (about a minute)' : 'Draft the week'}
        icon="sparkles"
        loading={run.isPending}
        disabled={!slots.length}
        onPress={() => run.mutate()}
      />
    </Sheet>
  );
}

/** Monday `weeks` after the coming Monday, as YYYY-MM-DD. */
function mondayPlus(weeks: number): string {
  const d = new Date(`${nextMonday()}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Give another client this same week: meals, amounts, macros and notes, as a draft. */
function CopyToClientSheet({
  plan,
  fromClientId,
  fromClientName,
  onClose,
}: {
  plan: MealPlan;
  fromClientId: string;
  fromClientName: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<ClientListItem | null>(null);
  const starts = [
    { key: nextMonday(), label: `Next Monday · ${shortDate(nextMonday())}` },
    { key: mondayPlus(1), label: `Week after · ${shortDate(mondayPlus(1))}` },
    { key: plan.start_date, label: `Same dates · ${shortDate(plan.start_date)}` },
  ].filter((o, i, all) => all.findIndex((x) => x.key === o.key) === i);
  const [startDate, setStartDate] = useState(starts[0].key);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const clientsQ = useQuery({
    queryKey: ['workspace', 'clients', 'copy-plan', q],
    queryFn: () => ownerClientsApi.list({ q: q || undefined, limit: 30 }),
    staleTime: 30_000,
  });
  const options = (clientsQ.data?.items ?? []).filter((c) => c.id !== fromClientId);
  const mealCount = plan.cards?.length ?? 0;

  const copy = useMutation({
    mutationFn: () => mealPlansApi.duplicate(plan.id, startDate, target!.id),
    onSuccess: (p) => {
      const who = target!;
      onClose();
      Alert.alert('Copied', `${who.display_name || who.name} now has this as week ${p.week_number} (draft). Publish it when it's ready.`, [
        { text: 'OK', style: 'cancel' },
        { text: 'Open their plan', onPress: () => router.push(`/(owner)/clients/${who.id}` as Href) },
      ]);
    },
    onError: (e: Error) => Alert.alert('Could not copy the plan', e.message),
  });

  return (
    <Sheet visible onClose={() => !copy.isPending && onClose()} title={`Copy week ${plan.week_number} to a client`}>
      <AppText variant="muted" tone="muted">
        All {mealCount} meal{mealCount === 1 ? '' : 's'} from {fromClientName}&apos;s week, with amounts, macros and notes. It arrives as a draft.
      </AppText>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search clients" />
      <View style={{ gap: spacing.xs }}>
        {clientsQ.isLoading ? (
          <Loading />
        ) : clientsQ.isError ? (
          <QueryError error={clientsQ.error} onRetry={() => void clientsQ.refetch()} />
        ) : options.length === 0 ? (
          <AppText variant="caption" tone="muted">
            {q ? `No other client matches "${q}".` : 'No other clients yet.'}
          </AppText>
        ) : (
          options.slice(0, 8).map((c) => {
            const on = target?.id === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setTarget(c)}
                style={[styles.pick, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
                <Ionicons name={on ? 'checkmark-circle' : 'person-circle-outline'} size={22} color={on ? t.colors.primary : t.colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <AppText variant="body" numberOfLines={1}>{c.display_name || c.name}</AppText>
                  <AppText variant="caption" tone="faint" numberOfLines={1}>{c.email}</AppText>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
      <AppText variant="label" tone="muted">
        WEEK STARTS
      </AppText>
      <View style={styles.wrap}>
        {starts.map((o) => {
          const on = startDate === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setStartDate(o.key)}
              style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
              <AppText variant="caption" style={{ fontWeight: '600' }}>{o.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <ActionButton
        label={target ? `Copy to ${target.display_name || target.name}` : 'Pick a client'}
        icon="copy-outline"
        loading={copy.isPending}
        disabled={!target}
        onPress={() => copy.mutate()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  dashed: { borderStyle: 'dashed' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  dayChip: { width: 56, alignItems: 'center', gap: 1, paddingVertical: 8, borderRadius: radius.lg, borderWidth: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
