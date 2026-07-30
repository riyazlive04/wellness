import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type OnboardingPayload } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say'] as const;
const GOAL_PRESETS = [
  'Weight loss',
  'Muscle gain',
  'Better energy',
  'Sleep & recovery',
  'Manage a health condition',
  'General wellness',
];
const ACTIVITY: { value: NonNullable<OnboardingPayload['activity_level']>; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Light movement' },
  { value: 'moderate', label: 'Moderately active' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

const STEPS = ['Basics', 'Body', 'Goals', 'Activity', 'Health', 'Done'] as const;
type StepName = (typeof STEPS)[number];

// Per-step icon + friendly subtitle for the warm gradient hero.
const STEP_META: Record<StepName, { icon: IoniconName; blurb: string }> = {
  Basics: { icon: 'person-outline', blurb: 'A little about you' },
  Body: { icon: 'body-outline', blurb: 'Your body basics' },
  Goals: { icon: 'flag-outline', blurb: 'What matters to you' },
  Activity: { icon: 'walk-outline', blurb: 'How you move' },
  Health: { icon: 'heart-outline', blurb: 'Keeping you safe' },
  Done: { icon: 'sparkles-outline', blurb: "You're all set" },
};

interface FormState {
  age: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  goals: string[];
  goalsNote: string;
  activity: OnboardingPayload['activity_level'] | null;
  allergies: string;
  medical: string;
  preferences: string;
}

const EMPTY: FormState = {
  age: '',
  gender: '',
  heightCm: '',
  weightKg: '',
  goals: [],
  goalsNote: '',
  activity: null,
  allergies: '',
  medical: '',
  preferences: '',
};

function joinGoals(form: FormState): string {
  return [...form.goals, form.goalsNote.trim()].filter(Boolean).join(', ');
}

/**
 * Post-approval wellness wizard. Mirrors web /portal/onboarding — all steps
 * optional; Skip / Finish still stamps onboarded_at so the client can enter tabs.
 */
export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
  });

  useEffect(() => {
    if (profileQ.data?.onboarded_at) {
      router.replace('/(tabs)');
    }
  }, [profileQ.data?.onboarded_at, router]);

  const payload = useMemo<OnboardingPayload>(() => {
    const age = parseInt(form.age, 10);
    const height = parseFloat(form.heightCm);
    const weight = parseFloat(form.weightKg);
    return {
      age: Number.isFinite(age) ? age : undefined,
      gender: form.gender || undefined,
      height_cm: Number.isFinite(height) ? height : undefined,
      initial_weight_kg: Number.isFinite(weight) ? weight : undefined,
      goals: joinGoals(form) || undefined,
      // Only send activity when the client actually picks one (Skip all must not
      // invent a default "moderate").
      activity_level: form.activity ?? undefined,
      allergies: form.allergies.trim() || undefined,
      medical_conditions: form.medical.trim() || undefined,
      food_preferences: form.preferences.trim() || undefined,
    };
  }, [form]);

  const completeMut = useMutation({
    mutationFn: () => clientsApi.completeOnboarding(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me', 'profile'] });
      router.replace('/(tabs)');
    },
    onError: (err: Error) => Alert.alert('Could not finish', err.message),
  });

  const step = STEPS[stepIdx];
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const toggleGoal = (g: string) =>
    setForm((s) => ({
      ...s,
      goals: s.goals.includes(g) ? s.goals.filter((x) => x !== g) : [...s.goals, g],
    }));

  const meta = STEP_META[step];
  const pct = ((stepIdx + 1) / STEPS.length) * 100;

  const inputStyle = [
    styles.input,
    { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
  ];

  return (
    <Screen>
      <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg }}>
        {/* ── Warm gradient step hero ──────────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <LinearGradient
            colors={t.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.xl, gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={styles.heroMark}>
                <Ionicons name={meta.icon} size={22} color={t.colors.onBrand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText
                  variant="label"
                  tone="onBrand"
                  style={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1.4 }}>
                  Step {stepIdx + 1} of {STEPS.length}
                </AppText>
                <AppText variant="heading" tone="onBrand">
                  {step === 'Done' ? "You're ready" : step}
                </AppText>
              </View>
            </View>

            <AppText variant="muted" tone="onBrand" style={{ opacity: 0.9 }}>
              {step === 'Done'
                ? 'You can update these details later in Settings.'
                : `${meta.blurb} — all fields are optional, skip anytime.`}
            </AppText>

            <View style={styles.heroTrack}>
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: t.colors.onBrand,
                }}
              />
            </View>
          </LinearGradient>
        </Card>

        <Card style={{ gap: spacing.md }}>
          {step === 'Basics' && (
            <>
              <Field label="Age">
                <TextInput
                  value={form.age}
                  onChangeText={(v) => set('age', v.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 32"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
              <Field label="Gender">
                <View style={styles.chips}>
                  {GENDERS.map((g) => (
                    <SelectChip key={g} label={g} on={form.gender === g} onPress={() => set('gender', g)} />
                  ))}
                </View>
              </Field>
            </>
          )}

          {step === 'Body' && (
            <>
              <Field label="Height (cm)">
                <TextInput
                  value={form.heightCm}
                  onChangeText={(v) => set('heightCm', v.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 165"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
              <Field label="Weight (kg)">
                <TextInput
                  value={form.weightKg}
                  onChangeText={(v) => set('weightKg', v.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 68"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {step === 'Goals' && (
            <>
              <View style={styles.chips}>
                {GOAL_PRESETS.map((g) => (
                  <SelectChip key={g} label={g} on={form.goals.includes(g)} onPress={() => toggleGoal(g)} />
                ))}
              </View>
              <Field label="Anything else?">
                <TextInput
                  value={form.goalsNote}
                  onChangeText={(v) => set('goalsNote', v)}
                  placeholder="Optional note"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {step === 'Activity' && (
            <View style={{ gap: spacing.sm }}>
              {ACTIVITY.map((a) => {
                const on = form.activity === a.value;
                return (
                  <Pressable
                    key={a.value}
                    onPress={() => set('activity', a.value)}
                    style={[
                      styles.activityRow,
                      {
                        borderColor: on ? t.colors.primary : t.colors.border,
                        backgroundColor: on
                          ? t.colors.primary + (t.dark ? '2E' : '1A')
                          : t.colors.surfaceStrong,
                      },
                    ]}>
                    <AppText variant="heading" tone={on ? 'accent' : undefined}>
                      {a.label}
                    </AppText>
                    {on ? <Ionicons name="checkmark-circle" size={20} color={t.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {step === 'Health' && (
            <>
              <Field label="Allergies">
                <TextInput
                  value={form.allergies}
                  onChangeText={(v) => set('allergies', v)}
                  placeholder="e.g. peanuts, lactose"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
              <Field label="Medical conditions">
                <TextInput
                  value={form.medical}
                  onChangeText={(v) => set('medical', v)}
                  placeholder="Optional"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
              <Field label="Food preferences">
                <TextInput
                  value={form.preferences}
                  onChangeText={(v) => set('preferences', v)}
                  placeholder="e.g. vegetarian, no spicy"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {step === 'Done' && (
            <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
              <View style={[styles.doneChip, { backgroundColor: t.colors.success + (t.dark ? '2E' : '1A') }]}>
                <Ionicons name="checkmark-circle" size={30} color={t.colors.success} />
              </View>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                Tap Finish to enter your portal. You can refine goals and health details anytime.
              </AppText>
            </View>
          )}
        </Card>

        <View style={styles.nav}>
          {stepIdx > 0 ? (
            <Pressable onPress={() => setStepIdx((i) => i - 1)} style={styles.back}>
              <AppText variant="caption" tone="muted">Back</AppText>
            </Pressable>
          ) : (
            <View style={{ width: 64 }} />
          )}
          {step === 'Done' ? (
            <GradientButton
              label="Finish"
              onPress={() => completeMut.mutate()}
              loading={completeMut.isPending}
              disabled={completeMut.isPending}
              style={{ paddingHorizontal: spacing.xl }}
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <Pressable onPress={() => completeMut.mutate()} disabled={completeMut.isPending} hitSlop={8}>
                <AppText variant="caption" tone="muted">
                  Skip all
                </AppText>
              </Pressable>
              <GradientButton
                label="Continue"
                onPress={() => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))}
                style={{ paddingHorizontal: spacing.xl }}
              />
            </View>
          )}
        </View>
      </KeyboardAwareScroll>
    </Screen>
  );
}

/** Soft tinted selectable pill — teal fill + border when active. */
function SelectChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: on ? t.colors.primary : t.colors.border,
          backgroundColor: on ? t.colors.primary + (t.dark ? '2E' : '1A') : t.colors.surfaceStrong,
        },
      ]}>
      <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  heroMark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  input: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  doneChip: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  back: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
