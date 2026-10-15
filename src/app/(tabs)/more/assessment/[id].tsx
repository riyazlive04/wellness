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
import { QuestionInput, isTableBlank, type QType, type Question } from '@/components/form-field';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type AssessmentCard } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

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
