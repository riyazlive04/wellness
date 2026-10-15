import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { QuestionInput, type Question } from '@/components/form-field';
import { AppText, Card, Eyebrow, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

/** Questions the nutritionist built, in the shape the renderer expects. */
function parseQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const o = item as Record<string, unknown>;
    const text = o.question ?? o.label;
    if (typeof text !== 'string' || !text) return [];
    const strs = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
    return [{
      id: String(o.id ?? text),
      question: text,
      type: (o.type ?? 'text') as Question['type'],
      options: strs(o.options),
      max: typeof o.max === 'number' ? o.max : undefined,
      required: o.required === true,
      rows: strs(o.rows),
      columns: strs(o.columns),
    }];
  });
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const today = () =>
  new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Daily log — the form the nutritionist set to repeat every day, opened on
 * today's entry. Answers already saved today come back filled in, so the
 * client can do their morning readings and return in the evening for the rest.
 */
export default function DailyLog() {
  const t = useTheme();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['me', 'daily-form'],
    queryFn: () => clientsApi.myDailyForm(),
    retry: 1,
  });

  const questions = useMemo(() => parseQuestions(q.data?.form?.questions), [q.data]);
  const saved = useMemo<Record<string, unknown>>(
    () => (q.data?.entry?.responses ?? {}) as Record<string, unknown>,
    [q.data],
  );
  // null until the client edits something; then it holds the working answers.
  const [edited, setEdited] = useState<Record<string, unknown> | null>(null);
  const answers = edited ?? saved;

  const save = useMutation({
    mutationFn: () => clientsApi.saveDailyForm(q.data!.form.id, answers),
    onSuccess: async () => {
      setEdited(null);
      await qc.invalidateQueries({ queryKey: ['me', 'daily-form'] });
      Alert.alert('Saved', "Today's log was sent to your nutritionist.");
    },
    onError: (err: Error) => Alert.alert('Could not save', err.message),
  });

  if (q.isLoading) {
    return (
      <Screen edges={[]}>
        <View style={styles.centre}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!q.data) {
    return (
      <Screen edges={[]}>
        <KeyboardAwareScroll>
          <AppText variant="title">Daily log</AppText>
          <Card>
            <AppText variant="muted" tone="muted">
              Your nutritionist hasn&apos;t set up a daily log for you yet. When they do, it will appear here.
            </AppText>
          </Card>
        </KeyboardAwareScroll>
      </Screen>
    );
  }

  const answerable = questions.filter((x) => x.type !== 'section');
  const filled = answerable.filter((x) => !isBlank(answers[x.id])).length;
  const pct = answerable.length ? Math.round((filled / answerable.length) * 100) : 0;
  const dirty = edited !== null;

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll>
        <Eyebrow>{today()}</Eyebrow>
        <AppText variant="title">{q.data.form.name}</AppText>
        {q.data.form.description ? (
          <AppText variant="muted" tone="muted">
            {q.data.form.description}
          </AppText>
        ) : null}

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.between}>
            <AppText variant="heading">
              {filled} of {answerable.length} filled
            </AppText>
            {q.data.entry?.submitted_at ? (
              <AppText variant="caption" tone="accent">
                Saved
              </AppText>
            ) : null}
          </View>
          <View style={[styles.track, { backgroundColor: t.colors.surfaceStrong }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: t.colors.accent }]} />
          </View>
          <AppText variant="caption" tone="muted">
            Fill in whatever applies to you — blanks are fine, and you can come back later today to add more.
          </AppText>
        </Card>

        {questions.map((item) =>
          item.type === 'section' ? (
            <AppText key={item.id} variant="heading" style={{ marginTop: spacing.sm }}>
              {item.question}
            </AppText>
          ) : (
            <Card key={item.id} style={{ gap: spacing.sm }}>
              <AppText variant="heading">{item.question}</AppText>
              <QuestionInput
                q={item}
                value={answers[item.id]}
                onChange={(v) => setEdited((prev) => ({ ...(prev ?? saved), [item.id]: v }))}
              />
            </Card>
          ),
        )}

        {answerable.length ? (
          <GradientButton
            label={q.data.entry ? 'Update today’s log' : 'Save today’s log'}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={save.isPending || (!dirty && !!q.data.entry)}
          />
        ) : null}
      </KeyboardAwareScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
