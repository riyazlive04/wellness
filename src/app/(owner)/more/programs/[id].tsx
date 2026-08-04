/**
 * Program template detail — ports the web ProgramDetail page.
 *
 * Three jobs, three tabs: the task builder (add/remove/reorder the tasks a
 * client sees), assignment (pick clients, publish, push edits to people already
 * running it), and the program group chat shared with everyone enrolled.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { programEngineApi, type TemplateTask } from '@/lib/owner/api/programEngine';
import { clockTime, initials, pct, titleCase } from '@/lib/owner/format';
import { font, radius, spacing } from '@/lib/theme';

type Tab = 'tasks' | 'clients' | 'chat';

const CADENCES: TemplateTask['cadence'][] = ['daily', 'weekly', 'once'];

export default function OwnerProgramDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = String(id);
  const [tab, setTab] = useState<Tab>('tasks');

  const tplQ = useQuery({
    queryKey: ['programs', 'template', templateId],
    queryFn: () => programEngineApi.getTemplate(templateId),
    enabled: !!templateId,
  });

  const tpl = tplQ.data;

  if (tplQ.isLoading) {
    return (
      <OwnerPage title="Program" back>
        <Loading />
      </OwnerPage>
    );
  }
  if (tplQ.isError || !tpl) {
    return (
      <OwnerPage title="Program" back>
        <QueryError error={tplQ.error} onRetry={() => void tplQ.refetch()} />
      </OwnerPage>
    );
  }

  return (
    <OwnerPage
      title={tpl.name}
      subtitle={`${titleCase(tpl.category)} · ${tpl.duration_weeks} ${tpl.duration_unit}`}
      back
      contentStyle={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pill
              label={titleCase(tpl.status)}
              tone={tpl.status === 'published' ? 'success' : tpl.status === 'draft' ? 'warning' : 'neutral'}
            />
            <Pill label={titleCase(tpl.difficulty)} />
            {tpl.assigned_count ? <Pill label={`${tpl.assigned_count} enrolled`} tone="accent" /> : null}
          </View>
          {tpl.description ? <AppText variant="body">{tpl.description}</AppText> : null}
          {tpl.avg_progress !== undefined && tpl.assigned_count ? (
            <AppText variant="caption" tone="faint">
              {`Average completion ${pct(tpl.avg_progress)}`}
            </AppText>
          ) : null}
        </Card>
      </View>

      <SegmentedTabs
        options={[
          { key: 'tasks', label: 'Tasks', badge: tpl.tasks?.length },
          { key: 'clients', label: 'Assign' },
          { key: 'chat', label: 'Group chat' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'tasks' ? <TasksTab templateId={templateId} tasks={tpl.tasks ?? []} /> : null}
        {tab === 'clients' ? (
          <AssignTab templateId={templateId} status={tpl.status} />
        ) : null}
        {tab === 'chat' ? <ChatTab templateId={templateId} /> : null}
      </View>
    </OwnerPage>
  );
}

// ──────────────────────────────────────────────────────────────────  tasks ────

function TasksTab({ templateId, tasks }: { templateId: string; tasks: TemplateTask[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cadence, setCadence] = useState<TemplateTask['cadence']>('daily');
  const [week, setWeek] = useState('');

  const refresh = () => void qc.invalidateQueries({ queryKey: ['programs', 'template', templateId] });

  const add = useMutation({
    mutationFn: () =>
      programEngineApi.addTask(templateId, {
        title: title.trim(),
        description: description.trim() || null,
        cadence,
        week_number: week ? Number(week) : null,
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setWeek('');
      setAddOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not add task', e.message),
  });

  const remove = useMutation({
    mutationFn: (taskId: string) => programEngineApi.deleteTask(templateId, taskId),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  // Group by cadence — that's how the client experiences them.
  const grouped = useMemo(() => {
    return tasks.reduce<Record<string, TemplateTask[]>>((acc, task) => {
      (acc[task.cadence] ??= []).push(task);
      return acc;
    }, {});
  }, [tasks]);

  return (
    <>
      <ActionButton label="Add a task" icon="add" onPress={() => setAddOpen(true)} />

      {!tasks.length ? (
        <EmptyState
          icon="list-outline"
          title="No tasks yet"
          body="Tasks are what the client actually ticks off each day. Add at least one before publishing."
        />
      ) : (
        (CADENCES.filter((c) => grouped[c]?.length) as TemplateTask['cadence'][]).map((c) => (
          <View key={c} style={{ gap: spacing.sm }}>
            <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
              {titleCase(c)}
            </AppText>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {grouped[c].map((task) => (
                <ListRow
                  key={task.id}
                  title={task.title}
                  subtitle={
                    [task.description, task.week_number ? `Week ${task.week_number}` : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  icon="ellipse-outline"
                  right={
                    <AppText
                      variant="caption"
                      tone="danger"
                      onPress={() =>
                        Alert.alert('Delete task?', task.title, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(task.id) },
                        ])
                      }>
                      Delete
                    </AppText>
                  }
                />
              ))}
            </Card>
          </View>
        ))
      )}

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="New task">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Log breakfast within an hour of waking" />
        <Field
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 70, textAlignVertical: 'top' }}
        />
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            CADENCE
          </AppText>
          <SegmentedTabs
            options={CADENCES.map((c) => ({ key: c, label: titleCase(c) }))}
            value={cadence}
            onChange={setCadence}
          />
        </View>
        <Field
          label="Week number (optional)"
          value={week}
          onChangeText={setWeek}
          keyboardType="number-pad"
          hint="Leave blank for the whole program"
        />
        <ActionButton
          label="Add task"
          disabled={!title.trim()}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      </Sheet>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────  assign ────

function AssignTab({ templateId, status }: { templateId: string; status: string }) {
  const qc = useQueryClient();
  const t = useTheme();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const clientsQ = useQuery({
    queryKey: ['clients', 'list', '', 'active'],
    queryFn: () => ownerClientsApi.list({ status: 'active', limit: 200 }),
  });
  const assignmentsQ = useQuery({
    queryKey: ['programs', 'assignments'],
    queryFn: () => programEngineApi.listAssignments(),
  });

  const enrolledIds = useMemo(
    () =>
      new Set(
        (assignmentsQ.data ?? [])
          .filter((a) => a.template_id === templateId && a.status === 'active')
          .map((a) => a.client_id),
      ),
    [assignmentsQ.data, templateId],
  );

  const refresh = () => void qc.invalidateQueries({ queryKey: ['programs'] });

  const publish = useMutation({
    mutationFn: () => programEngineApi.updateTemplate(templateId, { status: 'published' }),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not publish', e.message),
  });

  const assign = useMutation({
    mutationFn: () => programEngineApi.assign(templateId, [...selected]),
    onSuccess: (res) => {
      setSelected(new Set());
      refresh();
      Alert.alert('Assigned', `${res.assigned} client${res.assigned === 1 ? '' : 's'} enrolled.`);
    },
    onError: (e: Error) => Alert.alert('Could not assign', e.message),
  });

  const sync = useMutation({
    mutationFn: () => programEngineApi.syncToAssignments(templateId),
    onSuccess: (res) => {
      refresh();
      Alert.alert(
        'Pushed to running programs',
        `${res.assignments} assignment${res.assignments === 1 ? '' : 's'} updated · ${res.added} tasks added, ${res.removed} removed.`,
      );
    },
    onError: (e: Error) => Alert.alert('Could not sync', e.message),
  });

  const toggle = (clientId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });

  return (
    <>
      {status !== 'published' ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Not published</AppText>
          <AppText variant="muted" tone="muted">
            Clients can only be enrolled on a published template.
          </AppText>
          <ActionButton
            label="Publish template"
            icon="cloud-upload-outline"
            loading={publish.isPending}
            onPress={() => publish.mutate()}
          />
        </Card>
      ) : (
        <ActionButton
          label="Push task edits to running programs"
          icon="sync-outline"
          tone="neutral"
          loading={sync.isPending}
          onPress={() =>
            Alert.alert(
              'Push changes?',
              'Everyone currently running this program gets the added tasks and loses the removed ones.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Push', onPress: () => sync.mutate() },
              ],
            )
          }
        />
      )}

      {clientsQ.isLoading ? (
        <Loading />
      ) : !clientsQ.data?.items.length ? (
        <EmptyState icon="people-outline" title="No active clients" />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {clientsQ.data.items.map((c) => {
            const enrolled = enrolledIds.has(c.id);
            const picked = selected.has(c.id);
            return (
              <ListRow
                key={c.id}
                title={c.display_name || c.name}
                subtitle={enrolled ? 'Already enrolled' : c.email}
                avatarText={initials(c.display_name || c.name)}
                tint={enrolled ? t.colors.success : picked ? t.colors.accent : undefined}
                onPress={enrolled ? undefined : () => toggle(c.id)}
                right={
                  enrolled ? (
                    <Pill label="Enrolled" tone="success" />
                  ) : picked ? (
                    <Pill label="Selected" tone="accent" />
                  ) : (
                    <AppText variant="caption" tone="faint">
                      Tap to select
                    </AppText>
                  )
                }
              />
            );
          })}
        </Card>
      )}

      {selected.size ? (
        <ActionButton
          label={`Assign to ${selected.size} client${selected.size === 1 ? '' : 's'}`}
          icon="person-add-outline"
          loading={assign.isPending}
          onPress={() => assign.mutate()}
        />
      ) : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────  chat ────

function ChatTab({ templateId }: { templateId: string }) {
  const qc = useQueryClient();
  const t = useTheme();
  const [draft, setDraft] = useState('');

  const chatQ = useQuery({
    queryKey: ['programs', 'chat', templateId],
    queryFn: () => programEngineApi.chatList(templateId),
    refetchInterval: 15_000,
  });

  const send = useMutation({
    mutationFn: (content: string) => programEngineApi.chatSend(templateId, content),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['programs', 'chat', templateId] });
    },
    onError: (e: Error) => Alert.alert('Not sent', e.message),
  });

  return (
    <>
      <AppText variant="caption" tone="faint">
        Everyone enrolled in this program sees these messages.
      </AppText>

      {chatQ.isLoading ? (
        <Loading />
      ) : !chatQ.data?.length ? (
        <EmptyState icon="chatbubbles-outline" title="No messages" body="Kick off the cohort with a welcome note." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {chatQ.data.map((m) => (
            <Card key={m.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AppText variant="caption" tone="accent" style={{ flex: 1 }}>
                  {m.sender_name} · {titleCase(m.sender_role)}
                </AppText>
                <AppText variant="caption" tone="faint">
                  {clockTime(m.created_at)}
                </AppText>
              </View>
              <AppText variant="body">{m.content}</AppText>
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the cohort"
          placeholderTextColor={t.colors.textFaint}
          multiline
          style={{
            flex: 1,
            maxHeight: 110,
            backgroundColor: t.colors.surfaceStrong,
            borderColor: t.colors.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            color: t.colors.text,
            fontSize: font.size.base,
          }}
        />
        <View style={{ width: 96 }}>
          <ActionButton
            label="Send"
            disabled={!draft.trim()}
            loading={send.isPending}
            onPress={() => send.mutate(draft.trim())}
          />
        </View>
      </View>
    </>
  );
}
