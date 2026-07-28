import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GradientButton, KeyboardAwareScroll, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type AssessmentCard } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type QType = 'text' | 'textarea' | 'single' | 'multi' | 'scale' | 'number' | 'section' | 'table' | string;

interface Question {
  id: string;
  question: string;
  type?: QType;
  options?: string[];
  max?: number;
  required?: boolean;
  rows?: string[];
  columns?: string[];
}

/** A `table` answer: { [rowLabel]: { [columnHeader]: value } }. */
type TableAnswer = Record<string, Record<string, string>>;

function isTableBlank(v: unknown): boolean {
  if (!v || typeof v !== 'object') return true;
  return !Object.values(v as TableAnswer).some(
    (row) =>
      row && typeof row === 'object' && Object.values(row).some((cell) => String(cell ?? '').trim() !== ''),
  );
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}

function parseCard(card: AssessmentCard): { title: string; intro: string | null; questions: Question[] } {
  const c = (card.generated_content ?? {}) as Record<string, unknown>;
  const title = String(c.title ?? c.name ?? card.card_type);
  const intro = (c.intro ?? c.summary ?? c.description ?? null) as string | null;
  let rawQs: unknown = c.questions ?? c.fields ?? c.form ?? [];
  if (!Array.isArray(rawQs)) rawQs = [];
  const questions: Question[] = (rawQs as unknown[]).flatMap((item, i) => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    const qtext = (o.question ?? o.label ?? o.prompt) as string | undefined;
    if (!qtext || typeof qtext !== 'string') return [];
    const id = String(o.id ?? o.key ?? `q${i}`);
    const type = (o.type ?? o.kind) as QType | undefined;
    const options = Array.isArray(o.options)
      ? (o.options as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined;
    const max = typeof o.max === 'number' ? o.max : undefined;
    const required = o.required === true;
    return [{ id, question: qtext, type, options, max, required, rows: strArr(o.rows), columns: strArr(o.columns) }];
  });
  return { title, intro, questions };
}

export default function AssessmentDetail() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listQ = useQuery({
    queryKey: ['me', 'assessments'],
    queryFn: () => clientsApi.myAssessments(),
    retry: 1,
  });

  const card = useMemo(
    () => (listQ.data ?? []).find((c) => c.id === id) ?? null,
    [listQ.data, id],
  );

  const parsed = useMemo(() => (card ? parseCard(card) : null), [card]);
  const existing = useMemo<Record<string, unknown>>(() => {
    if (!card?.generated_content) return {};
    const r = (card.generated_content as { client_responses?: Record<string, unknown> }).client_responses;
    return r && typeof r === 'object' ? r : {};
  }, [card]);

  // null = still using server seed; object = user has edited
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  const effectiveAnswers = answers ?? existing;

  const submitMut = useMutation({
    mutationFn: () => clientsApi.submitAssessment(id!, effectiveAnswers),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me', 'assessments'] });
      Alert.alert('Saved', 'Your answers were sent to your nutritionist.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err: Error) => Alert.alert('Could not save', err.message),
  });

  if (listQ.isLoading) {
    return (
      <Screen edges={[]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!card || !parsed) {
    return (
      <Screen edges={[]}>
        <ScreenScroll>
          <Card>
            <AppText variant="muted" tone="muted">
              Assessment not found.
            </AppText>
          </Card>
        </ScreenScroll>
      </Screen>
    );
  }

  const setAnswer = (qid: string, v: unknown) =>
    setAnswers((s) => ({ ...(s ?? existing), [qid]: v }));

  const onSubmit = () => {
    const missing = parsed.questions.find((q) => {
      if (q.type === 'section' || !q.required) return false;
      const v = effectiveAnswers[q.id];
      if (q.type === 'table') return isTableBlank(v);
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    });
    if (missing) {
      Alert.alert('Required', `Please answer: "${missing.question}"`);
      return;
    }
    submitMut.mutate();
  };

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll>
        <Eyebrow>{card.card_type.replace(/_/g, ' ')}</Eyebrow>
        <AppText variant="title">{parsed.title}</AppText>
        {parsed.intro ? (
          <AppText variant="muted" tone="muted">
            {parsed.intro}
          </AppText>
        ) : null}

        {parsed.questions.length === 0 ? (
          <Card>
            <AppText variant="muted" tone="muted">
              This card has no form to fill — it may be read-only content from your nutritionist.
            </AppText>
          </Card>
        ) : (
          parsed.questions.map((q) => {
            if (q.type === 'section') {
              return (
                <AppText key={q.id} variant="heading" style={{ marginTop: spacing.sm }}>
                  {q.question}
                </AppText>
              );
            }
            const value = effectiveAnswers[q.id];
            return (
              <Card key={q.id} style={{ gap: spacing.sm }}>
                <AppText variant="heading">
                  {q.question}
                  {q.required ? ' *' : ''}
                </AppText>
                <QuestionInput q={q} value={value} onChange={(v) => setAnswer(q.id, v)} />
              </Card>
            );
          })
        )}

        {parsed.questions.some((q) => q.type !== 'section') ? (
          <GradientButton
            label={card.has_responses ? 'Update answers' : 'Submit answers'}
            onPress={onSubmit}
            loading={submitMut.isPending}
            disabled={submitMut.isPending}
          />
        ) : null}
      </KeyboardAwareScroll>
    </Screen>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useTheme();
  const type = q.type ?? 'text';

  if (type === 'single' && q.options?.length) {
    return (
      <View style={styles.chips}>
        {q.options.map((opt) => {
          const on = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              style={[
                styles.chip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                },
              ]}>
              <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'multi' && q.options?.length) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <View style={styles.chips}>
        {q.options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() =>
                onChange(on ? selected.filter((x) => x !== opt) : [...selected, opt])
              }
              style={[
                styles.chip,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                },
              ]}>
              <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'scale') {
    const max = q.max ?? 10;
    // API may store scale as string ("5") — coerce so reopened answers highlight.
    const n = value == null || value === '' ? NaN : Number(value);
    return (
      <View style={styles.chips}>
        {Array.from({ length: max }, (_, i) => i + 1).map((num) => {
          const on = Number.isFinite(n) && n === num;
          return (
            <Pressable
              key={num}
              onPress={() => onChange(num)}
              style={[
                styles.scale,
                {
                  borderColor: t.colors.border,
                  backgroundColor: on ? t.colors.accent : t.colors.surfaceStrong,
                },
              ]}>
              <AppText variant="caption" style={{ color: on ? t.colors.onBrand : t.colors.text }}>
                {num}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (type === 'table' && q.rows?.length) {
    return <TableField q={q} value={value} onChange={onChange} />;
  }

  return (
    <TextInput
      value={value == null ? '' : String(value)}
      onChangeText={onChange}
      multiline={type === 'textarea'}
      keyboardType={type === 'number' ? 'decimal-pad' : 'default'}
      placeholder="Your answer"
      placeholderTextColor={t.colors.textFaint}
      style={[
        styles.input,
        {
          borderColor: t.colors.border,
          color: t.colors.text,
          backgroundColor: t.colors.surface,
          minHeight: type === 'textarea' ? 96 : undefined,
          textAlignVertical: type === 'textarea' ? 'top' : 'center',
        },
      ]}
    />
  );
}

function TableField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = useTheme();
  const rows = q.rows ?? [];
  const cols = q.columns?.length ? q.columns : ['Value'];
  const data = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as TableAnswer;

  const cell = (row: string, col: string) => data[row]?.[col] ?? '';
  const setCell = (row: string, col: string, v: string) =>
    onChange({ ...data, [row]: { ...(data[row] ?? {}), [col]: v } });

  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View
          key={r}
          style={[
            styles.tableRow,
            { borderColor: t.colors.border, backgroundColor: t.colors.surface },
          ]}>
          <AppText variant="caption" style={{ fontWeight: '600' }}>
            {r}
          </AppText>
          {cols.map((c) => (
            <View key={c} style={{ gap: 4 }}>
              {cols.length > 1 || c !== 'Value' ? (
                <AppText variant="caption" tone="muted">
                  {c}
                </AppText>
              ) : null}
              <TextInput
                value={cell(r, c)}
                onChangeText={(v) => setCell(r, c, v)}
                placeholder="—"
                placeholderTextColor={t.colors.textFaint}
                style={[
                  styles.input,
                  {
                    borderColor: t.colors.border,
                    color: t.colors.text,
                    backgroundColor: t.colors.surfaceStrong,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scale: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  tableRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
});
