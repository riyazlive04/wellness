/**
 * Assessments — the workspace's questionnaire library.
 *
 * Ports the web AssessmentForms page: custom forms with their status, the
 * ready-made starter forms that can be copied in, and the recently-submitted
 * feed. Building/editing a form's questions lives on the builder screen.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'forms' | 'starters' | 'submitted';

export default function OwnerAssessments() {
  return (
    <RouteGate permission="assessments.manage">
      <AssessmentsInner />
    </RouteGate>
  );
}

function AssessmentsInner() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('forms');
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const formsQ = useQuery({ queryKey: ['assessment-forms'], queryFn: ownerClientsApi.listAssessmentForms });
  const startersQ = useQuery({
    queryKey: ['assessment-forms', 'starters'],
    queryFn: ownerClientsApi.listStarterForms,
    enabled: tab === 'starters',
  });
  const recentQ = useQuery({
    queryKey: ['assessments', 'recent', 25],
    queryFn: () => ownerClientsApi.recentAssessments(25),
    enabled: tab === 'submitted',
  });

  const install = useMutation({
    mutationFn: (key: string) => ownerClientsApi.installStarterForm(key),
    onSuccess: (form) => {
      void qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      setTab('forms');
      router.push(`/(owner)/more/assessments/${form.id}`);
    },
    onError: (e: Error) => Alert.alert('Could not install', e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ownerClientsApi.deleteAssessmentForm(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assessment-forms'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([formsQ.refetch(), startersQ.refetch(), recentQ.refetch()]);
    setRefreshing(false);
  };

  return (
    <OwnerPage
      title="Assessments"
      subtitle="Forms and responses"
      back
      actions={<IconButton icon="add" tone="accent" accessibilityLabel="New form" onPress={() => setNewOpen(true)} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs
        options={[
          { key: 'forms', label: 'My forms', badge: formsQ.data?.length },
          { key: 'starters', label: 'Starter forms' },
          { key: 'submitted', label: 'Submitted' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'forms' ? (
          formsQ.isLoading ? (
            <Loading />
          ) : formsQ.isError ? (
            <QueryError error={formsQ.error} onRetry={() => void formsQ.refetch()} />
          ) : !formsQ.data?.length ? (
            <EmptyState
              icon="document-text-outline"
              title="No forms yet"
              body="Build your own intake questionnaire, or copy in one of the ready-made clinical forms."
              action={
                <View style={{ alignSelf: 'stretch', marginTop: spacing.sm, gap: spacing.sm }}>
                  <ActionButton label="Create a form" icon="add" onPress={() => setNewOpen(true)} />
                  <ActionButton
                    label="Browse starter forms"
                    icon="library-outline"
                    tone="neutral"
                    onPress={() => setTab('starters')}
                  />
                </View>
              }
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {formsQ.data.map((f) => (
                <ListRow
                  key={f.id}
                  title={f.name}
                  subtitle={f.description ?? `${f.questions.length} questions`}
                  icon="document-text-outline"
                  tint={f.status === 'published' ? t.colors.success : undefined}
                  onPress={() => router.push(`/(owner)/more/assessments/${f.id}`)}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Pill label={titleCase(f.status)} tone={f.status === 'published' ? 'success' : 'warning'} />
                      <AppText
                        variant="caption"
                        tone="danger"
                        onPress={() =>
                          Alert.alert('Delete form?', `${f.name} will be removed.`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(f.id) },
                          ])
                        }>
                        Delete
                      </AppText>
                    </View>
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'starters' ? (
          startersQ.isLoading ? (
            <Loading />
          ) : !startersQ.data?.length ? (
            <EmptyState icon="library-outline" title="No starter forms available" />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {startersQ.data.map((s) => (
                <ListRow
                  key={s.key}
                  title={s.name}
                  subtitle={`${s.description} · ${s.fieldCount} fields`}
                  icon="library-outline"
                  right={
                    <AppText variant="caption" tone="accent" onPress={() => install.mutate(s.key)}>
                      Copy in
                    </AppText>
                  }
                />
              ))}
            </Card>
          )
        ) : null}

        {tab === 'submitted' ? (
          recentQ.isLoading ? (
            <Loading />
          ) : !recentQ.data?.length ? (
            <EmptyState
              icon="checkbox-outline"
              title="Nothing submitted yet"
              body="Assign a form from a client's Assessments tab."
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {recentQ.data.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.client_name}
                  subtitle={r.title ?? titleCase(r.card_type)}
                  icon="checkbox-outline"
                  meta={r.band ?? (r.score !== null ? String(r.score) : relativeTime(r.submitted_at))}
                  onPress={() => router.push(`/(owner)/clients/${r.client_id}`)}
                />
              ))}
            </Card>
          )
        ) : null}
      </View>

      <NewFormSheet visible={newOpen} onClose={() => setNewOpen(false)} />
    </OwnerPage>
  );
}

function NewFormSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      ownerClientsApi.createAssessmentForm({
        name: name.trim(),
        description: description.trim() || undefined,
        questions: [],
        status: 'draft',
      }),
    onSuccess: (form) => {
      void qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      setName('');
      setDescription('');
      onClose();
      router.push(`/(owner)/more/assessments/${form.id}`);
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="New assessment form">
      <Field label="Name" value={name} onChangeText={setName} placeholder="Initial intake" />
      <Field
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
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
