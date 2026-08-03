/**
 * Automation — no-code rules that react to workspace events.
 *
 * Ports the web Automation page (pages/sirah/owner/Automation.tsx): a rule
 * library (trigger → action) with enable toggles, a run/activity history, and
 * create/edit via a bottom sheet. Consumes the existing automationApi.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, Switch, View } from 'react-native';

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
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  automationApi,
  TRIGGER_EVENTS,
  type ActionType,
  type AutomationAction,
  type AutomationRule,
  type CreateRuleInput,
} from '@/lib/owner/api/automation';
import { spacing } from '@/lib/theme';

type Tab = 'rules' | 'activity';

const ACTION_TYPES: { key: ActionType; label: string }[] = [
  { key: 'notify.message', label: 'Notify staff' },
  { key: 'message.send', label: 'Message client' },
  { key: 'push.send', label: 'Push' },
  { key: 'ai.summarize', label: 'AI summary' },
  { key: 'webhook.post', label: 'Webhook' },
];
const ACTION_LABEL: Record<ActionType, string> = {
  'notify.message': 'Notify staff',
  'message.send': 'Message client',
  'push.send': 'Push',
  'ai.summarize': 'AI summary',
  'webhook.post': 'Webhook',
};
const triggerLabel = (v: string) => TRIGGER_EVENTS.find((x) => x.value === v)?.label ?? v;
const actionSummary = (actions: AutomationAction[]) => {
  if (!actions.length) return 'no action';
  const first = ACTION_LABEL[actions[0].type] ?? actions[0].type;
  return actions.length > 1 ? `${first} +${actions.length - 1}` : first;
};
const when = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function OwnerAutomation() {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('rules');
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [creating, setCreating] = useState(false);

  const rulesQ = useQuery({ queryKey: ['automation', 'rules'], queryFn: automationApi.listRules });
  const runsQ = useQuery({ queryKey: ['automation', 'runs'], queryFn: () => automationApi.listRuns({ limit: 40 }) });
  const statsQ = useQuery({ queryKey: ['automation', 'analytics'], queryFn: automationApi.analytics });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_enabled: boolean }) => automationApi.updateRule(v.id, { is_enabled: v.is_enabled }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['automation', 'rules'] });
      const prev = qc.getQueryData<AutomationRule[]>(['automation', 'rules']);
      qc.setQueryData<AutomationRule[]>(['automation', 'rules'], (old) =>
        (old ?? []).map((r) => (r.id === v.id ? { ...r, is_enabled: v.is_enabled } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['automation', 'rules'], ctx.prev);
      Alert.alert('Could not update', 'The rule could not be toggled. Try again.');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['automation'] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([rulesQ.refetch(), runsQ.refetch(), statsQ.refetch()]);
    setRefreshing(false);
  };

  const s = statsQ.data;

  return (
    <OwnerPage
      title="Automation"
      subtitle="Rules react to workspace events"
      back
      actions={<IconButton icon="add" tone="accent" accessibilityLabel="New rule" onPress={() => setCreating(true)} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />}
      contentStyle={{ paddingHorizontal: 0 }}>
      {s ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <TileRow>
            <StatTile label="Rules" value={s.total_rules} icon="flash-outline" />
            <StatTile label="Enabled" value={s.enabled_rules} icon="power-outline" />
            <StatTile label="Runs · 7d" value={s.runs_7d} icon="pulse-outline" />
          </TileRow>
          <TileRow>
            <StatTile label="Total fires" value={s.total_fires} icon="rocket-outline" />
            <StatTile label="Success" value={`${Math.round(s.success_rate)}%`} icon="checkmark-done-outline" />
          </TileRow>
        </View>
      ) : null}

      <SegmentedTabs
        options={[
          { key: 'rules', label: 'Rules', badge: rulesQ.data?.length },
          { key: 'activity', label: 'Activity', badge: runsQ.data?.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'rules' ? (
        rulesQ.isLoading ? (
          <Loading />
        ) : rulesQ.isError ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <QueryError error={rulesQ.error} onRetry={() => void rulesQ.refetch()} />
          </View>
        ) : !rulesQ.data?.length ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              icon="flash-outline"
              title="No rules yet"
              body="Automate the busywork — e.g. message a client the moment they book, or ping staff when someone new signs up."
              action={
                <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                  <ActionButton label="Create a rule" icon="add" onPress={() => setCreating(true)} />
                </View>
              }
            />
          </View>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden', marginHorizontal: spacing.lg }}>
            {rulesQ.data.map((r) => (
              <ListRow
                key={r.id}
                title={r.name}
                subtitle={`${triggerLabel(r.trigger_event)} → ${actionSummary(r.actions)}${r.fire_count ? ` · fired ${r.fire_count}×` : ''}`}
                icon="flash-outline"
                tint={r.is_enabled ? t.colors.success : t.colors.textFaint}
                onPress={() => setEditing(r)}
                right={
                  <Switch
                    value={r.is_enabled}
                    onValueChange={(v) => toggle.mutate({ id: r.id, is_enabled: v })}
                    trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }}
                    thumbColor={t.colors.onBrand}
                  />
                }
              />
            ))}
          </Card>
        )
      ) : runsQ.isLoading ? (
        <Loading />
      ) : !runsQ.data?.length ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState icon="pulse-outline" title="No activity yet" body="Runs appear here each time a rule fires." />
        </View>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden', marginHorizontal: spacing.lg }}>
          {runsQ.data.map((run) => (
            <ListRow
              key={run.id}
              title={run.rule_name ?? triggerLabel(run.trigger_event)}
              subtitle={`${triggerLabel(run.trigger_event)} · ${when(run.started_at)}`}
              icon={run.status === 'success' ? 'checkmark-circle-outline' : run.status === 'failed' ? 'alert-circle-outline' : 'remove-circle-outline'}
              tint={run.status === 'success' ? t.colors.success : run.status === 'failed' ? t.colors.danger : t.colors.warning}
              right={
                <Pill
                  label={run.status}
                  tone={run.status === 'success' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}
                />
              }
            />
          ))}
        </Card>
      )}

      <RuleSheet
        visible={creating || !!editing}
        rule={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </OwnerPage>
  );
}

function RuleSheet({ visible, rule, onClose }: { visible: boolean; rule: AutomationRule | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editingId = rule?.id ?? null;

  // Prefill from the rule (or blank for create). Keyed remount via `visible`
  // resets these when a different rule opens.
  const first = rule?.actions?.[0];
  const [name, setName] = useState(rule?.name ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [enabled, setEnabled] = useState(rule?.is_enabled ?? true);
  const [trigger, setTrigger] = useState(rule?.trigger_event ?? TRIGGER_EVENTS[0].value);
  const [actionType, setActionType] = useState<ActionType>(first?.type ?? 'notify.message');
  const [title, setTitle] = useState((first as any)?.title ?? '');
  const [body, setBody] = useState((first as any)?.body ?? '');
  const [content, setContent] = useState((first as any)?.content ?? '');
  const [url, setUrl] = useState((first as any)?.url ?? '');
  const [prompt, setPrompt] = useState((first as any)?.prompt ?? '');

  const buildAction = (): AutomationAction => {
    switch (actionType) {
      case 'notify.message':
        return { type: 'notify.message', title: title.trim(), body: body.trim(), recipient_scope: 'workspace' };
      case 'message.send':
        return { type: 'message.send', recipient: 'trigger_client', content: content.trim() };
      case 'push.send':
        return { type: 'push.send', recipient: 'trigger_client', title: title.trim(), body: body.trim(), url: url.trim() || undefined };
      case 'ai.summarize':
        return { type: 'ai.summarize', prompt: prompt.trim() };
      case 'webhook.post':
        return { type: 'webhook.post', url: url.trim() };
    }
  };

  const actionValid = () => {
    switch (actionType) {
      case 'notify.message':
      case 'push.send':
        return !!title.trim() && !!body.trim();
      case 'message.send':
        return !!content.trim();
      case 'ai.summarize':
        return !!prompt.trim();
      case 'webhook.post':
        return /^https?:\/\//i.test(url.trim());
    }
  };
  const valid = !!name.trim() && actionValid();

  const save = useMutation({
    mutationFn: () => {
      const body: CreateRuleInput = {
        name: name.trim(),
        description: description.trim() || null,
        is_enabled: enabled,
        trigger_event: trigger,
        conditions: rule?.conditions ?? [],
        actions: [buildAction()],
      };
      return editingId ? automationApi.updateRule(editingId, body) : automationApi.createRule(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['automation'] });
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  const remove = useMutation({
    mutationFn: () => automationApi.removeRule(editingId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['automation'] });
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const confirmDelete = () =>
    Alert.alert('Delete rule?', `"${rule?.name}" will stop running. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <Sheet key={editingId ?? 'new'} visible={visible} onClose={onClose} title={editingId ? 'Edit rule' : 'New rule'}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Welcome new clients" />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What this rule does (optional)"
        multiline
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />

      <FieldGroup label="WHEN THIS HAPPENS">
        <SegmentedTabs
          options={TRIGGER_EVENTS.map((e) => ({ key: e.value, label: e.label }))}
          value={trigger}
          onChange={setTrigger}
        />
      </FieldGroup>

      <FieldGroup label="DO THIS">
        <SegmentedTabs options={ACTION_TYPES} value={actionType} onChange={setActionType} />
      </FieldGroup>

      {actionType === 'notify.message' || actionType === 'push.send' ? (
        <>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="New sign-up 🎉" />
          <Field label="Message" value={body} onChangeText={setBody} multiline placeholder="Say hi and get them onboarded." style={{ minHeight: 64, textAlignVertical: 'top' }} />
          {actionType === 'push.send' ? (
            <Field label="Deep link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="/clients" />
          ) : null}
        </>
      ) : actionType === 'message.send' ? (
        <Field label="Message to the client" value={content} onChangeText={setContent} multiline placeholder="Welcome aboard! Here's how to get started…" style={{ minHeight: 80, textAlignVertical: 'top' }} />
      ) : actionType === 'ai.summarize' ? (
        <Field label="AI prompt" value={prompt} onChangeText={setPrompt} multiline placeholder="Summarise this event for the coach." style={{ minHeight: 80, textAlignVertical: 'top' }} />
      ) : (
        <Field label="Webhook URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://hooks.example.com/…" />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs }}>
        <View style={{ flex: 1 }}>
          <AppText variant="body">Enabled</AppText>
          <AppText variant="caption" tone="muted">Rule runs as soon as it's saved</AppText>
        </View>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>

      <ActionButton
        label={editingId ? 'Save changes' : 'Create rule'}
        icon={editingId ? 'checkmark' : 'add'}
        disabled={!valid}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
      {editingId ? (
        <ActionButton label="Delete rule" icon="trash-outline" tone="danger" loading={remove.isPending} onPress={confirmDelete} />
      ) : null}
    </Sheet>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}
