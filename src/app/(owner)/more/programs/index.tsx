/**
 * Programs — reusable templates and the clients running them.
 *
 * Ports the web Programs page (pages/sirah/owner/Programs.tsx): the template
 * library with status/task/enrolment counts, the live assignment list, and
 * creating a template. Editing a template's tasks and assigning it live on the
 * detail screen.
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
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { programEngineApi, type ProgramTemplateInput } from '@/lib/owner/api/programEngine';
import { initials, pct, shortDate, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'templates' | 'assignments';

export default function OwnerPrograms() {
  return (
    <RouteGate permission="programs.read">
      <ProgramsInner />
    </RouteGate>
  );
}

function ProgramsInner() {
  const t = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('templates');
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const templatesQ = useQuery({ queryKey: ['programs', 'templates'], queryFn: programEngineApi.listTemplates });
  const assignmentsQ = useQuery({
    queryKey: ['programs', 'assignments'],
    queryFn: () => programEngineApi.listAssignments(),
  });
  const statsQ = useQuery({ queryKey: ['programs', 'analytics'], queryFn: programEngineApi.analytics });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([templatesQ.refetch(), assignmentsQ.refetch(), statsQ.refetch()]);
    setRefreshing(false);
  };

  const s = statsQ.data;

  return (
    <OwnerPage
      title="Programs"
      subtitle="Templates and assignments"
      back
      actions={
        <IconButton icon="add" tone="accent" accessibilityLabel="New template" onPress={() => setNewOpen(true)} />
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      {s ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <TileRow>
            <StatTile label="Published" value={s.published_templates} icon="clipboard-outline" />
            <StatTile label="Active" value={s.active_programs} icon="play-circle-outline" />
            <StatTile label="Completed" value={s.completed_programs} icon="checkmark-done-outline" />
          </TileRow>
          <TileRow>
            <StatTile label="Clients enrolled" value={s.clients_enrolled} icon="people-outline" />
            <StatTile label="Avg progress" value={pct(s.avg_progress)} icon="trending-up-outline" />
          </TileRow>
        </View>
      ) : null}

      <SegmentedTabs
        options={[
          { key: 'templates', label: 'Templates', badge: templatesQ.data?.length },
          { key: 'assignments', label: 'Assignments', badge: assignmentsQ.data?.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'templates' ? (
        templatesQ.isLoading ? (
          <Loading />
        ) : templatesQ.isError ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <QueryError error={templatesQ.error} onRetry={() => void templatesQ.refetch()} />
          </View>
        ) : !templatesQ.data?.length ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              icon="clipboard-outline"
              title="No templates yet"
              body="Build a program once, then assign it to as many clients as you like."
              action={
                <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                  <ActionButton label="Create a template" icon="add" onPress={() => setNewOpen(true)} />
                </View>
              }
            />
          </View>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden', marginHorizontal: spacing.lg }}>
            {templatesQ.data.map((tpl) => (
              <ListRow
                key={tpl.id}
                title={tpl.name}
                subtitle={[
                  titleCase(tpl.category),
                  `${tpl.duration_weeks} ${tpl.duration_unit}`,
                  tpl.task_count !== undefined ? `${tpl.task_count} tasks` : null,
                  tpl.assigned_count ? `${tpl.assigned_count} enrolled` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon="clipboard-outline"
                tint={tpl.status === 'published' ? t.colors.success : undefined}
                right={
                  <Pill
                    label={titleCase(tpl.status)}
                    tone={tpl.status === 'published' ? 'success' : tpl.status === 'draft' ? 'warning' : 'neutral'}
                  />
                }
                onPress={() => router.push(`/(owner)/more/programs/${tpl.id}`)}
              />
            ))}
          </Card>
        )
      ) : assignmentsQ.isLoading ? (
        <Loading />
      ) : !assignmentsQ.data?.length ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            icon="people-outline"
            title="Nobody enrolled yet"
            body="Open a published template and assign it to clients."
          />
        </View>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden', marginHorizontal: spacing.lg }}>
          {assignmentsQ.data.map((a) => (
            <ListRow
              key={a.id}
              title={a.client_name ?? 'Client'}
              subtitle={`${a.name} · started ${shortDate(a.start_date)}`}
              avatarText={initials(a.client_name ?? 'C')}
              tint={a.status === 'active' ? t.colors.success : undefined}
              meta={pct(Number(a.progress_pct))}
              onPress={() => router.push(`/(owner)/clients/${a.client_id}`)}
            />
          ))}
        </Card>
      )}

      <NewTemplateSheet visible={newOpen} onClose={() => setNewOpen(false)} />
    </OwnerPage>
  );
}

function NewTemplateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('weight_loss');
  const [weeks, setWeeks] = useState('8');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  const create = useMutation({
    mutationFn: () => {
      const body: ProgramTemplateInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        durationWeeks: Number(weeks) || 8,
        difficulty,
        status: 'draft',
      };
      return programEngineApi.createTemplate(body);
    },
    onSuccess: (tpl) => {
      void qc.invalidateQueries({ queryKey: ['programs'] });
      setName('');
      setDescription('');
      onClose();
      router.push(`/(owner)/more/programs/${tpl.id}`);
    },
    onError: (e: Error) => Alert.alert('Could not create', e.message),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="New program template">
      <Field label="Name" value={name} onChangeText={setName} placeholder="12-week metabolic reset" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="What the client gets out of it"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Category" value={category} onChangeText={setCategory} autoCapitalize="none" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Duration (weeks)" value={weeks} onChangeText={setWeeks} keyboardType="number-pad" />
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          DIFFICULTY
        </AppText>
        <SegmentedTabs
          options={(['beginner', 'intermediate', 'advanced'] as const).map((d) => ({
            key: d,
            label: titleCase(d),
          }))}
          value={difficulty}
          onChange={setDifficulty}
        />
      </View>
      <ActionButton
        label="Create draft"
        icon="add"
        disabled={!name.trim()}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}
