/**
 * Post-approval wellness wizard — steps and fields come from the server.
 *
 * The practice decides what it asks and in what order; the app owns the flow
 * itself (progress bar, Back/Next/Finish, coercion, submit, the redirect once
 * `onboarded_at` is stamped). That split matters: a practice reordering its
 * intake questions should never be able to break the gate that lets a client
 * into the app.
 *
 * Every field stays optional, as before — Skip / Finish still stamps
 * `onboarded_at` so a client is never trapped on the wizard.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  AppText,
  Card,
  Eyebrow,
  GradientButton,
  KeyboardAwareScroll,
  Screen,
} from '@/components/ui';
import { useScreen } from '@/contexts/sdui-context';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type OnboardingPayload } from '@/lib/clients-api';
import { interpolate } from '@/lib/sdui/bindings';
import type { UiNode } from '@/lib/sdui/types';
import { radius, spacing } from '@/lib/theme';

/** A `step` node flattened into what this screen needs to render it. */
interface Step {
  key: string;
  title: string;
  subtitle?: string;
  fields: FieldNode[];
}

type FieldNode = Extract<UiNode, { type: 'field' }>;

/**
 * Answers keyed by the field's `key`, which is also the payload key.
 *
 * Kept as strings (and string arrays for chips) while editing so a
 * half-typed number is not repeatedly coerced under the user's cursor;
 * converted once at submit.
 */
type Answers = Record<string, string | string[]>;

/** Walk the tree for `step` nodes and the `field` nodes inside them. */
function collectSteps(node: UiNode | undefined, out: Step[]): void {
  if (!node || typeof node.type !== 'string') return;

  if (node.type === 'step') {
    const fields: FieldNode[] = [];
    collectFields(node.children, fields);
    out.push({
      key: node.key,
      title: interpolate(node.title, {}),
      subtitle: node.subtitle ? interpolate(node.subtitle, {}) : undefined,
      fields,
    });
    return;
  }

  const children = (node as { children?: UiNode[] }).children;
  if (Array.isArray(children)) children.forEach((c) => collectSteps(c, out));
}

function collectFields(nodes: UiNode[] | undefined, out: FieldNode[]): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.type !== 'string') continue;
    if (node.type === 'field') {
      out.push(node);
      continue;
    }
    collectFields((node as { children?: UiNode[] }).children, out);
  }
}

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const screen = useScreen('onboarding');

  const [answers, setAnswers] = useState<Answers>({});
  const [stepIdx, setStepIdx] = useState(0);

  const steps = useMemo(() => {
    const found: Step[] = [];
    collectSteps(screen.root, found);
    return found;
  }, [screen]);

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    retry: 1,
  });

  useEffect(() => {
    if (profileQ.data?.onboarded_at) router.replace('/(tabs)');
  }, [profileQ.data?.onboarded_at, router]);

  /**
   * Coerce answers into the API payload.
   *
   * Only keys the user actually filled are sent. "Skip all" must not invent a
   * default activity level or a zero weight — an absent answer and an answer of
   * zero mean very different things to whoever reads this profile next.
   */
  const payload = useMemo<OnboardingPayload>(() => {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(answers)) {
      if (Array.isArray(raw)) {
        const joined = raw.filter(Boolean).join(', ');
        if (joined) out[key] = joined;
        continue;
      }
      const value = (raw ?? '').trim();
      if (!value) continue;

      if (key === 'age' || key === 'height_cm' || key === 'initial_weight_kg') {
        const n = key === 'age' ? parseInt(value, 10) : parseFloat(value);
        if (Number.isFinite(n)) out[key] = n;
        continue;
      }
      out[key] = value;
    }
    return out as OnboardingPayload;
  }, [answers]);

  const completeMut = useMutation({
    mutationFn: () => clientsApi.completeOnboarding(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me', 'profile'] });
      router.replace('/(tabs)');
    },
    onError: (err: Error) => Alert.alert('Could not finish', err.message),
  });

  const setAnswer = (key: string, value: string | string[]) =>
    setAnswers((s) => ({ ...s, [key]: value }));

  const toggleChip = (key: string, option: string) =>
    setAnswers((s) => {
      const current = Array.isArray(s[key]) ? (s[key] as string[]) : [];
      return {
        ...s,
        [key]: current.includes(option)
          ? current.filter((x) => x !== option)
          : [...current, option],
      };
    });

  // The final "You're ready" page is app chrome, not an authored step, so the
  // flow is one longer than the layout describes.
  const total = steps.length + 1;
  // A newly published layout can be shorter than the one this session started
  // on. Clamping on read rather than correcting the state in an effect avoids a
  // render where `step` is undefined.
  const safeIdx = Math.min(stepIdx, total - 1);
  const onDone = safeIdx >= steps.length;
  const step = onDone ? null : steps[safeIdx];

  const inputStyle = [
    styles.input,
    { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surface },
  ];

  return (
    <Screen>
      <KeyboardAwareScroll>
        <Eyebrow>
          Welcome · Step {safeIdx + 1} of {total}
        </Eyebrow>
        <AppText variant="title">{onDone ? "You're ready" : (step?.title ?? '')}</AppText>
        <AppText variant="muted" tone="muted">
          {onDone
            ? 'We have what we need to start. You can change any of this later in Settings.'
            : (step?.subtitle ?? '')}
        </AppText>

        <View style={[styles.progress, { backgroundColor: t.colors.surfaceStrong }]}>
          <View
            style={{
              width: `${((safeIdx + 1) / total) * 100}%`,
              height: '100%',
              backgroundColor: t.colors.accent,
              borderRadius: 999,
            }}
          />
        </View>

        <Card style={{ gap: spacing.lg }}>
          {step?.fields.map((field) => {
            const value = answers[field.key];
            const label = interpolate(field.label, {});
            const placeholder = field.placeholder ? interpolate(field.placeholder, {}) : undefined;

            if (field.kind === 'select' || field.kind === 'chips') {
              const multi = field.kind === 'chips';
              const selected = multi
                ? Array.isArray(value)
                  ? value
                  : []
                : typeof value === 'string'
                  ? [value]
                  : [];
              return (
                <Field key={field.id} label={label}>
                  <View style={styles.chips}>
                    {(field.options ?? []).map((opt) => {
                      const on = selected.includes(opt.value);
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() =>
                            multi
                              ? toggleChip(field.key, opt.value)
                              : setAnswer(field.key, on ? '' : opt.value)
                          }
                          style={[
                            styles.chip,
                            {
                              borderColor: t.colors.border,
                              backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                            },
                          ]}>
                          <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                            {opt.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              );
            }

            const numeric = field.kind === 'number';
            return (
              <Field key={field.id} label={label}>
                <TextInput
                  value={typeof value === 'string' ? value : ''}
                  onChangeText={(v) =>
                    setAnswer(
                      field.key,
                      // Digits only for age; a decimal point for heights and
                      // weights. Filtering as they type beats rejecting on submit.
                      numeric
                        ? v.replace(field.key === 'age' ? /[^\d]/g : /[^\d.]/g, '')
                        : v,
                    )
                  }
                  keyboardType={
                    numeric ? (field.key === 'age' ? 'number-pad' : 'decimal-pad') : 'default'
                  }
                  multiline={field.kind === 'multiline'}
                  placeholder={placeholder}
                  placeholderTextColor={t.colors.textFaint}
                  style={[
                    inputStyle,
                    field.kind === 'multiline' ? { minHeight: 80, textAlignVertical: 'top' } : null,
                  ]}
                />
              </Field>
            );
          })}

          {onDone ? (
            <AppText variant="body" tone="muted">
              Tap Finish to open your dashboard.
            </AppText>
          ) : null}
        </Card>

        <View style={styles.nav}>
          {safeIdx > 0 ? (
            <Pressable onPress={() => setStepIdx(Math.max(0, safeIdx - 1))} style={styles.back}>
              <AppText variant="body" tone="muted">
                Back
              </AppText>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}

          {onDone ? (
            <GradientButton
              label="Finish"
              loading={completeMut.isPending}
              onPress={() => completeMut.mutate()}
              style={{ flex: 1, marginLeft: spacing.md }}
            />
          ) : (
            <GradientButton
              label="Next"
              onPress={() => setStepIdx(Math.min(safeIdx + 1, total - 1))}
              style={{ flex: 1, marginLeft: spacing.md }}
            />
          )}
        </View>

        <Pressable onPress={() => completeMut.mutate()} style={{ alignItems: 'center' }}>
          <AppText variant="muted" tone="faint">
            Skip for now
          </AppText>
        </Pressable>
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
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  back: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
