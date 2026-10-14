/**
 * A client's reminders, set by the nutritionist — the phone version of the web
 * Reminders tab. Apply one of the practice's sequences, or set the times by
 * hand. Building and editing sequences stays on the web (Clients → Reminders).
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ActionButton, Field, Loading, Sheet } from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_SLOTS, SLOT_LABELS, mealPlansApi, type MealSlotEntry } from '@/lib/owner/api/mealPlans';
import {
  BLANK_REMINDERS, MAX_CUSTOM, formatTime, mealTimeFor, reminderSummary, remindersApi, remindersValid, waterCount,
  type CustomReminder, type ReminderSettings,
} from '@/lib/owner/api/reminders';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const INTERVALS: { value: ReminderSettings['water_every_minutes']; label: string }[] = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 h' },
  { value: 120, label: '2 hours' },
];

const shift = (hhmm: string, by: number): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + by) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function RemindersTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const q = useQuery({ queryKey: ['workspace', 'client-reminders', clientId], queryFn: () => remindersApi.forClient(clientId) });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  return <Form key={JSON.stringify(q.data)} clientId={clientId} clientName={clientName} saved={q.data ?? null} />;
}

function Form({ clientId, clientName, saved }: { clientId: string; clientName: string; saved: ReminderSettings | null }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [s, setS] = useState<ReminderSettings>(saved ?? BLANK_REMINDERS);
  const [adding, setAdding] = useState(false);
  const set = (patch: Partial<ReminderSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const dirty = JSON.stringify(s) !== JSON.stringify(saved ?? BLANK_REMINDERS);

  const slotsQ = useQuery({ queryKey: ['workspace', 'meal-plans', 'slots'], queryFn: () => mealPlansApi.slots(), staleTime: 30_000 });
  const schedule: MealSlotEntry[] = slotsQ.data?.schedule?.length
    ? slotsQ.data.schedule
    : DEFAULT_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], custom: false }));
  const sequencesQ = useQuery({ queryKey: ['workspace', 'reminder-sequences'], queryFn: () => remindersApi.sequences() });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['workspace', 'client-reminders', clientId] });
    void qc.invalidateQueries({ queryKey: ['workspace', 'reminder-sequences'] });
  };
  const save = useMutation({
    mutationFn: () => remindersApi.setForClient(clientId, s),
    onSuccess: () => {
      refresh();
      Alert.alert('Reminders saved', `${clientName} gets them the next time they open the NUSI app.`);
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });
  const apply = useMutation({
    mutationFn: (id: string) => remindersApi.apply(id, [clientId]),
    onSuccess: () => {
      refresh();
      Alert.alert('Sequence applied', `${clientName} gets it the next time they open the NUSI app.`);
    },
    onError: (e: Error) => Alert.alert('Could not apply', e.message),
  });
  const confirmApply = (id: string, name: string) =>
    Alert.alert(`Apply “${name}”?`, saved ? `This replaces ${clientName}'s current reminders.` : undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Apply', onPress: () => apply.mutate(id) },
    ]);

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="body" style={{ fontWeight: '700' }}>
          {!saved ? 'No reminders set yet' : saved.sequence_name ? `On “${saved.sequence_name}”` : 'Set by hand'}
        </AppText>
        <AppText variant="caption" tone="muted">
          {saved ? reminderSummary(saved, schedule) : 'Apply a sequence or set the times below.'}
          {saved?.updated_by === 'client' && saved.updated_at
            ? ` · ${clientName} adjusted them on ${new Date(saved.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
            : ''}
        </AppText>
        <AppText variant="label" tone="muted" style={{ marginTop: spacing.xs }}>
          APPLY A SEQUENCE
        </AppText>
        {sequencesQ.data?.length ? (
          <View style={styles.wrap}>
            {sequencesQ.data.map((seq) => (
              <Pressable
                key={seq.id}
                disabled={apply.isPending}
                onPress={() => confirmApply(seq.id, seq.name)}
                style={[styles.chip, { borderColor: saved?.sequence_id === seq.id ? t.colors.primary : t.colors.border }]}>
                <Ionicons name="layers-outline" size={14} color={t.colors.primary} />
                <AppText variant="caption" style={{ fontWeight: '600' }}>{seq.name}</AppText>
              </Pressable>
            ))}
          </View>
        ) : sequencesQ.isSuccess ? (
          <AppText variant="caption" tone="faint">No sequences yet. Create them on the web: Clients → Reminders.</AppText>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <ToggleRow icon="restaurant-outline" tint="#3FAE88" title="Meal times" sub={s.meals_enabled ? `${schedule.length} a day` : 'Off'} value={s.meals_enabled} onChange={(v) => set({ meals_enabled: v })} />
        {s.meals_enabled
          ? schedule.map((e) => (
              <Stepper
                key={e.slot}
                label={e.label}
                time={mealTimeFor(s, e.slot)}
                onShift={(by) => set({ meal_times: { ...s.meal_times, [e.slot]: shift(mealTimeFor(s, e.slot), by) } })}
              />
            ))
          : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <ToggleRow
          icon="water-outline"
          tint="#22A3C3"
          title="Water"
          sub={s.water_enabled ? `${waterCount(s)} a day, ${formatTime(s.water_start)} to ${formatTime(s.water_end)}` : 'Off'}
          value={s.water_enabled}
          onChange={(v) => set({ water_enabled: v })}
        />
        {s.water_enabled ? (
          <>
            <View style={styles.wrap}>
              {INTERVALS.map((o) => {
                const on = s.water_every_minutes === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => set({ water_every_minutes: o.value })}
                    style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : 'transparent' }]}>
                    <AppText variant="caption" style={{ fontWeight: '600' }}>{o.label}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <Stepper label="From" time={s.water_start} step={30} onShift={(by) => shift(s.water_start, by) < s.water_end && set({ water_start: shift(s.water_start, by) })} />
            <Stepper label="Until" time={s.water_end} step={30} onShift={(by) => shift(s.water_end, by) > s.water_start && set({ water_end: shift(s.water_end, by) })} />
          </>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <ToggleRow
          icon="list-outline"
          tint="#7C6BD6"
          title="Daily routine"
          sub={s.custom_enabled ? (s.custom.length ? `${s.custom.length} of your own reminders` : 'Methi water, a walk, supplements…') : 'Off'}
          value={s.custom_enabled}
          onChange={(v) => set({ custom_enabled: v })}
        />
        {s.custom_enabled ? (
          <>
            {s.custom.map((c, i) => (
              <View key={c.id ?? `new-${i}`} style={[styles.row, { borderTopColor: t.colors.border }]}>
                <AppText variant="body" style={styles.time}>{formatTime(c.time)}</AppText>
                <View style={{ flex: 1 }}>
                  <AppText variant="body">{c.title}</AppText>
                  {c.body ? <AppText variant="caption" tone="muted">{c.body}</AppText> : null}
                </View>
                <Pressable hitSlop={8} onPress={() => set({ custom: s.custom.filter((_, j) => j !== i) })} accessibilityLabel={`Remove ${c.title}`}>
                  <Ionicons name="trash-outline" size={18} color={t.colors.danger} />
                </Pressable>
              </View>
            ))}
            <ActionButton label="Add a reminder" icon="add" tone="neutral" disabled={s.custom.length >= MAX_CUSTOM} onPress={() => setAdding(true)} />
          </>
        ) : null}
      </Card>

      <ActionButton label="Save reminders" icon="checkmark" loading={save.isPending} disabled={!dirty || !remindersValid(s)} onPress={() => save.mutate()} />
      <AppText variant="caption" tone="faint" style={{ textAlign: 'center' }}>
        Times are on {clientName}&apos;s phone clock. They need the NUSI app with notifications allowed.
      </AppText>

      {adding ? (
        <AddReminderSheet
          onClose={() => setAdding(false)}
          onAdd={(c) => {
            set({ custom: [...s.custom, c].sort((a, b) => a.time.localeCompare(b.time)) });
            setAdding(false);
          }}
        />
      ) : null}
    </View>
  );
}

function AddReminderSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (c: CustomReminder) => void }) {
  const [time, setTime] = useState('09:00');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <Sheet visible onClose={onClose} title="Add a routine reminder">
      <Stepper label="Time" time={time} onShift={(by) => setTime(shift(time, by))} />
      <Field label="WHAT TO DO" value={title} onChangeText={setTitle} maxLength={60} placeholder="e.g. Methi water" />
      <Field label="NOTE (OPTIONAL)" value={body} onChangeText={setBody} maxLength={140} placeholder="e.g. Soaked overnight" />
      <ActionButton
        label="Add"
        icon="add"
        disabled={!title.trim()}
        onPress={() => onAdd({ time, title: title.trim(), ...(body.trim() ? { body: body.trim() } : {}) })}
      />
    </Sheet>
  );
}

function ToggleRow({ icon, tint, title, sub, value, onChange }: { icon: IoniconName; tint: string; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={[styles.icon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="body" style={{ fontWeight: '600' }}>{title}</AppText>
        <AppText variant="caption" tone="muted">{sub}</AppText>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }} />
    </View>
  );
}

function Stepper({ label, time, onShift, step = 15 }: { label: string; time: string; onShift: (by: number) => void; step?: number }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: t.colors.border }]}>
      <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>{label}</AppText>
      <Pressable onPress={() => onShift(-step)} hitSlop={6} style={[styles.step, { borderColor: t.colors.border }]} accessibilityLabel={`${label} earlier`}>
        <Ionicons name="remove" size={16} color={t.colors.text} />
      </Pressable>
      <AppText variant="body" style={styles.stepTime}>{formatTime(time)}</AppText>
      <Pressable onPress={() => onShift(step)} hitSlop={6} style={[styles.step, { borderColor: t.colors.border }]} accessibilityLabel={`${label} later`}>
        <Ionicons name="add" size={16} color={t.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  time: { width: 78, fontWeight: '600', fontVariant: ['tabular-nums'] },
  step: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepTime: { minWidth: 82, textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
