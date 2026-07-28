import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

  const inputStyle = [
    styles.input,
    { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface },
  ];

  return (
    <Screen>
      <KeyboardAwareScroll>
        <Eyebrow>Welcome · Step {stepIdx + 1} of {STEPS.length}</Eyebrow>
        <AppText variant="title">{step === 'Done' ? "You're ready" : step}</AppText>
        <AppText variant="muted" tone="muted">
          {step === 'Done'
            ? 'You can update these details later in Settings.'
            : 'All fields are optional — skip anytime.'}
        </AppText>

        <View style={[styles.progress, { backgroundColor: t.colors.surfaceStrong }]}>
          <View
            style={{
              width: `${((stepIdx + 1) / STEPS.length) * 100}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: t.colors.accent,
            }}
          />
        </View>

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
                  {GENDERS.map((g) => {
                    const on = form.gender === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => set('gender', g)}
                        style={[
                          styles.chip,
                          {
                            borderColor: t.colors.border,
                            backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                          },
                        ]}>
                        <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                          {g}
                        </AppText>
                      </Pressable>
                    );
                  })}
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
                {GOAL_PRESETS.map((g) => {
                  const on = form.goals.includes(g);
                  return (
                    <Pressable
                      key={g}
                      onPress={() => toggleGoal(g)}
                      style={[
                        styles.chip,
                        {
                          borderColor: t.colors.border,
                          backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                        },
                      ]}>
                      <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                        {g}
                      </AppText>
                    </Pressable>
                  );
                })}
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
                        borderColor: t.colors.border,
                        backgroundColor: on ? t.colors.surfaceStrong : t.colors.surface,
                      },
                    ]}>
                    <AppText variant="heading" tone={on ? 'accent' : undefined}>
                      {a.label}
                    </AppText>
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
            <AppText variant="muted" tone="muted">
              Tap Finish to enter your portal. You can refine goals and health details anytime.
            </AppText>
          )}
        </Card>

        <View style={styles.nav}>
          {stepIdx > 0 ? (
            <Pressable onPress={() => setStepIdx((i) => i - 1)} style={styles.back}>
              <AppText variant="caption">Back</AppText>
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
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <Pressable onPress={() => completeMut.mutate()} disabled={completeMut.isPending}>
                <AppText variant="caption" tone="muted">
                  Skip all
                </AppText>
              </Pressable>
              <GradientButton
                label="Next"
                onPress={() => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1))}
              />
            </View>
          )}
        </View>
      </KeyboardAwareScroll>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { height: 6, borderRadius: 999, overflow: 'hidden' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activityRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  back: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
