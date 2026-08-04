/**
 * Assessment form builder — ports the web AssessmentFormBuilder.
 *
 * The web builder is drag-and-drop across a 12-column grid; that doesn't
 * survive a phone screen, so this is an ordered list with explicit
 * move-up/move-down controls. Everything else is the same: all eight question
 * types, options for choice/multi, rows+columns for tables, required flags,
 * and draft/published status. The saved shape is identical, so a form built
 * here opens and edits cleanly on the web.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useEditable } from '@/hooks/use-editable';
import { useTheme } from '@/hooks/use-theme';
import {
  ownerClientsApi,
  type AssessmentFormQuestion,
  type AssessmentQuestionType,
} from '@/lib/owner/api/clients';
import { titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

const TYPES: AssessmentQuestionType[] = ['section', 'text', 'scale', 'number', 'yesno', 'choice', 'multi', 'table'];

const TYPE_ICON: Record<AssessmentQuestionType, Parameters<typeof ListRow>[0]['icon']> = {
  section: 'bookmark-outline',
  text: 'text-outline',
  scale: 'options-outline',
  number: 'calculator-outline',
  yesno: 'checkmark-circle-outline',
  choice: 'radio-button-on-outline',
  multi: 'checkbox-outline',
  table: 'grid-outline',
};

function newId() {
  // Stable enough for form field ids; the backend keys answers off these.
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export default function OwnerAssessmentBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const formId = String(id);
  const qc = useQueryClient();
  const t = useTheme();

  const [editing, setEditing] = useState<AssessmentFormQuestion | null>(null);
  const [isNew, setIsNew] = useState(false);

  const formQ = useQuery({
    queryKey: ['assessment-forms'],
    queryFn: ownerClientsApi.listAssessmentForms,
    select: (forms) => forms.find((f) => f.id === formId) ?? null,
  });

  // The editor's draft sits over the saved form rather than being copied into
  // state by an effect — see hooks/use-editable for why.
  const server = useMemo(
    () => ({
      name: formQ.data?.name ?? '',
      description: formQ.data?.description ?? '',
      status: (formQ.data?.status ?? 'draft') as 'draft' | 'published',
      questions: formQ.data?.questions ?? [],
    }),
    [formQ.data],
  );
  const { value: draft, dirty, set, patch, reset } = useEditable(server);
  const { name, description, status, questions } = draft;

  const save = useMutation({
    mutationFn: () =>
      ownerClientsApi.updateAssessmentForm(formId, {
        name: name.trim(),
        description: description.trim() || undefined,
        questions,
        status,
      }),
    onSuccess: () => {
      reset();
      void qc.invalidateQueries({ queryKey: ['assessment-forms'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const mutate = (fn: (qs: AssessmentFormQuestion[]) => AssessmentFormQuestion[]) =>
    patch({ questions: fn(questions) });

  const move = (index: number, delta: number) =>
    mutate((qs) => {
      const next = [...qs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return qs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  if (formQ.isLoading) {
    return (
      <OwnerPage title="Form" back>
        <Loading />
      </OwnerPage>
    );
  }
  if (formQ.isError || !formQ.data) {
    return (
      <OwnerPage title="Form" back>
        <QueryError error={formQ.error} onRetry={() => void formQ.refetch()} />
      </OwnerPage>
    );
  }

  return (
    <OwnerPage
      title={name || 'Form'}
      subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'}${dirty ? ' · unsaved' : ''}`}
      back
      actions={
        <IconButton
          icon="save-outline"
          tone={dirty ? 'accent' : 'default'}
          accessibilityLabel="Save form"
          onPress={() => save.mutate()}
        />
      }>
      <Card style={{ gap: spacing.md }}>
        <Field label="Form name" value={name} onChangeText={(v) => set('name', v)} />
        <Field
          label="Description"
          value={description}
          onChangeText={(v) => set('description', v)}
          multiline
          style={{ minHeight: 64, textAlignVertical: 'top' }}
        />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            STATUS
          </AppText>
          <SegmentedTabs
            options={[
              { key: 'draft', label: 'Draft' },
              { key: 'published', label: 'Published' },
            ]}
            value={status}
            onChange={(s) => set('status', s)}
          />
          <AppText variant="caption" tone="faint">
            Only published forms can be assigned to a client.
          </AppText>
        </View>
      </Card>

      <ActionButton
        label="Add a question"
        icon="add"
        onPress={() => {
          setIsNew(true);
          setEditing({ id: newId(), question: '', type: 'text', required: false, w: 12 });
        }}
      />

      {!questions.length ? (
        <EmptyState
          icon="list-outline"
          title="No questions yet"
          body="Add sections and questions in the order the client should answer them."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {questions.map((q, i) => (
            <ListRow
              key={q.id}
              title={q.question || '(untitled)'}
              subtitle={[
                titleCase(q.type),
                q.required ? 'Required' : null,
                q.options?.length ? `${q.options.length} options` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              icon={TYPE_ICON[q.type]}
              tint={q.type === 'section' ? t.colors.accent : undefined}
              onPress={() => {
                setIsNew(false);
                setEditing(q);
              }}
              right={
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <IconButton icon="chevron-up" accessibilityLabel="Move up" onPress={() => move(i, -1)} />
                  <IconButton icon="chevron-down" accessibilityLabel="Move down" onPress={() => move(i, 1)} />
                </View>
              }
            />
          ))}
        </Card>
      )}

      {dirty ? (
        <ActionButton label="Save form" icon="save-outline" loading={save.isPending} onPress={() => save.mutate()} />
      ) : null}

      <QuestionSheet
        question={editing}
        isNew={isNew}
        onClose={() => setEditing(null)}
        onSave={(q) => {
          mutate((qs) => (isNew ? [...qs, q] : qs.map((x) => (x.id === q.id ? q : x))));
          setEditing(null);
        }}
        onDelete={(qid) => {
          mutate((qs) => qs.filter((x) => x.id !== qid));
          setEditing(null);
        }}
      />
    </OwnerPage>
  );
}

function QuestionSheet({
  question,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  question: AssessmentFormQuestion | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (q: AssessmentFormQuestion) => void;
  onDelete: (id: string) => void;
}) {
  // Edits are tagged with the question they belong to, so opening a different
  // question falls back to that question's own values without an effect.
  const [edits, setEdits] = useState<AssessmentFormQuestion | null>(null);
  const draft = edits && question && edits.id === question.id ? edits : question;

  if (!draft) {
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  }

  const set = <K extends keyof AssessmentFormQuestion>(key: K, value: AssessmentFormQuestion[K]) =>
    setEdits({ ...draft, [key]: value });

  const needsOptions = draft.type === 'choice' || draft.type === 'multi';
  const needsTable = draft.type === 'table';

  return (
    <Sheet visible={!!question} onClose={onClose} title={isNew ? 'New question' : 'Edit question'}>
      <Field
        label={draft.type === 'section' ? 'Section heading' : 'Question'}
        value={draft.question}
        onChangeText={(v) => set('question', v)}
        multiline
        style={{ minHeight: 60, textAlignVertical: 'top' }}
      />

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          TYPE
        </AppText>
        <SegmentedTabs
          options={TYPES.map((ty) => ({ key: ty, label: titleCase(ty) }))}
          value={draft.type}
          onChange={(ty) => set('type', ty)}
        />
      </View>

      {draft.type === 'scale' ? (
        <Field
          label="Maximum value"
          value={String(draft.max ?? 10)}
          onChangeText={(v) => set('max', Number(v) || 10)}
          keyboardType="number-pad"
        />
      ) : null}

      {needsOptions ? (
        <Field
          label="Options"
          value={(draft.options ?? []).join('\n')}
          onChangeText={(v) => set('options', v.split('\n').filter((s) => s.trim()))}
          multiline
          placeholder={'One option per line'}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          hint={`${(draft.options ?? []).length} options`}
        />
      ) : null}

      {needsTable ? (
        <>
          <Field
            label="Row labels"
            value={(draft.rows ?? []).join('\n')}
            onChangeText={(v) => set('rows', v.split('\n').filter((s) => s.trim()))}
            multiline
            placeholder={'One row label per line'}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          <Field
            label="Column headers"
            value={(draft.columns ?? []).join('\n')}
            onChangeText={(v) => set('columns', v.split('\n').filter((s) => s.trim()))}
            multiline
            placeholder={'One column header per line'}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </>
      ) : null}

      {draft.type !== 'section' ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            REQUIRED
          </AppText>
          <SegmentedTabs
            options={[
              { key: 'no', label: 'Optional' },
              { key: 'yes', label: 'Required' },
            ]}
            value={draft.required ? 'yes' : 'no'}
            onChange={(v) => set('required', v === 'yes')}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          WIDTH ON WEB
        </AppText>
        <SegmentedTabs
          options={[
            { key: '12', label: 'Full' },
            { key: '6', label: 'Half' },
            { key: '4', label: 'Third' },
          ]}
          value={String(draft.w ?? 12)}
          onChange={(v) => set('w', Number(v))}
        />
        <AppText variant="caption" tone="faint">
          Mobile always shows one field per row; this controls the web layout.
        </AppText>
      </View>

      <ActionButton
        label={isNew ? 'Add question' : 'Save question'}
        disabled={!draft.question.trim()}
        onPress={() => onSave(draft)}
      />
      {!isNew ? (
        <ActionButton
          label="Delete question"
          icon="trash-outline"
          tone="danger"
          onPress={() => onDelete(draft.id)}
        />
      ) : null}
      {isNew ? null : <Pill label={draft.id} />}
    </Sheet>
  );
}
