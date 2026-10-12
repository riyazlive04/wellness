/**
 * Assessments — ports the web Assessment forms page.
 *
 * Three parts, in the order a nutritionist uses them: the Client answers inbox
 * (forms clients sent back, forms not answered yet, forms already reviewed),
 * the ready-made templates that can be copied in, and the practice's own
 * forms, which are published and sent from here. Building a form's questions
 * lives on the builder screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

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
  SearchField,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  ownerClientsApi,
  type AssessmentForm,
  type AssessmentInbox,
  type AssessmentInboxItem,
  type StarterForm,
} from '@/lib/owner/api/clients';
import { initials, relativeTime, titleCase } from '@/lib/owner/format';
import { radius, spacing } from '@/lib/theme';

type Tab = 'answers' | 'templates' | 'forms';
type Bucket = 'toReview' | 'waiting' | 'reviewed';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'toReview', label: 'To review' },
  { key: 'waiting', label: 'Not answered yet' },
  { key: 'reviewed', label: 'Reviewed' },
];

const QUESTION_TYPE: Record<string, string> = {
  section: 'Section',
  text: 'Short text',
  number: 'Number',
  scale: 'Rating scale',
  yesno: 'Yes / No',
  choice: 'Multiple choice',
  multi: 'Checkboxes',
  table: 'Table',
};

export default function OwnerAssessments() {
  return (
    <RouteGate permission="assessments.manage">
      <AssessmentsInner />
    </RouteGate>
  );
}

function AssessmentsInner() {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('answers');
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const inboxQ = useQuery({ queryKey: ['assessment-inbox'], queryFn: ownerClientsApi.assessmentInbox, staleTime: 15_000 });
  const formsQ = useQuery({ queryKey: ['assessment-forms'], queryFn: ownerClientsApi.listAssessmentForms });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([inboxQ.refetch(), formsQ.refetch(), qc.invalidateQueries({ queryKey: ['assessment-forms', 'starters'] })]);
    setRefreshing(false);
  };

  return (
    <OwnerPage
      title="Assessments"
      subtitle="Client answers, templates and forms"
      back
      actions={<IconButton icon="add" tone="accent" accessibilityLabel="New form" onPress={() => setNewOpen(true)} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />}
      contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs
        options={[
          { key: 'answers', label: 'Client answers', badge: inboxQ.data?.toReview.length || undefined },
          { key: 'templates', label: 'Templates' },
          { key: 'forms', label: 'My forms', badge: formsQ.data?.length || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'answers' ? <AnswersTab q={inboxQ} onTemplates={() => setTab('templates')} /> : null}
        {tab === 'templates' ? <TemplatesTab forms={formsQ.data ?? []} onAdded={() => setTab('forms')} /> : null}
        {tab === 'forms' ? (
          <FormsTab q={formsQ} onNew={() => setNewOpen(true)} onTemplates={() => setTab('templates')} />
        ) : null}
      </View>
      <NewFormSheet visible={newOpen} onClose={() => setNewOpen(false)} />
    </OwnerPage>
  );
}

// ─────────────────────────────────────────────────────────── client answers ────

function AnswersTab({
  q,
  onTemplates,
}: {
  q: UseQueryResult<AssessmentInbox>;
  onTemplates: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const [bucket, setBucket] = useState<Bucket>('toReview');

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;

  const inbox = q.data;
  const total = inbox.toReview.length + inbox.waiting.length + inbox.reviewed.length;
  if (!total) {
    return (
      <EmptyState
        icon="mail-unread-outline"
        title="No answers yet"
        body="When a client fills in a form you sent, it shows up here for you to review."
        action={<ActionButton label="Browse templates" icon="library-outline" tone="neutral" onPress={onTemplates} />}
      />
    );
  }

  const rows = inbox[bucket];
  const open = (r: AssessmentInboxItem) =>
    bucket === 'waiting'
      ? router.push(`/(owner)/messaging/${r.client_id}`)
      : router.push(`/(owner)/clients/${r.client_id}?tab=assessments`);

  return (
    <>
      <View style={styles.chips}>
        {BUCKETS.map((b) => {
          const on = b.key === bucket;
          const n = inbox[b.key].length;
          return (
            <Pressable
              key={b.key}
              onPress={() => setBucket(b.key)}
              style={[styles.chip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? `${t.colors.primary}14` : t.colors.surface }]}>
              <AppText variant="caption" style={{ color: on ? t.colors.primary : t.colors.textMuted, fontWeight: on ? '700' : '500' }}>
                {b.label} · {n}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {!rows.length ? (
        <EmptyState
          icon={bucket === 'toReview' ? 'checkmark-done-outline' : 'file-tray-outline'}
          title={bucket === 'toReview' ? 'All caught up' : bucket === 'waiting' ? 'Everyone has answered' : 'Nothing reviewed yet'}
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((r) => (
            <ListRow
              key={r.id}
              title={r.client_name}
              subtitle={`${r.title ?? titleCase(r.card_type)} · ${bucket === 'waiting' ? `sent ${relativeTime(r.sent_at)}` : relativeTime(r.updated_at)}`}
              avatarText={initials(r.client_name)}
              onPress={() => open(r)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {bucket !== 'waiting' && r.score !== null ? (
                    <AppText variant="caption" tone="muted">
                      {r.score}/100{r.band ? ` · ${r.band}` : ''}
                    </AppText>
                  ) : null}
                  <Pill
                    label={bucket === 'toReview' ? 'Review' : bucket === 'waiting' ? 'Remind' : 'View'}
                    tone={bucket === 'toReview' ? 'accent' : 'neutral'}
                  />
                </View>
              }
            />
          ))}
        </Card>
      )}
      {bucket === 'waiting' && rows.length ? (
        <AppText variant="caption" tone="faint">
          Tap a client to send them a reminder in chat.
        </AppText>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── templates ────

function TemplatesTab({ forms, onAdded }: { forms: AssessmentForm[]; onAdded: () => void }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<StarterForm | null>(null);
  const startersQ = useQuery({ queryKey: ['assessment-forms', 'starters'], queryFn: ownerClientsApi.listStarterForms });
  const owned = useMemo(() => new Set(forms.map((f) => f.name.trim().toLowerCase())), [forms]);

  const install = useMutation({
    mutationFn: (key: string) => ownerClientsApi.installStarterForm(key),
    onSuccess: (form) => {
      void qc.invalidateQueries({ queryKey: ['assessment-forms'] });
      setPreview(null);
      Alert.alert('Template added', `"${form.name}" is in My forms as a draft. Check it, then publish it to send it to clients.`);
      onAdded();
    },
    onError: (e: Error) => Alert.alert('Could not add the template', e.message),
  });

  const use = (s: StarterForm) => {
    if (!owned.has(s.name.trim().toLowerCase())) return install.mutate(s.key);
    Alert.alert('Add another copy?', `You already have "${s.name}".`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add again', onPress: () => install.mutate(s.key) },
    ]);
  };

  if (startersQ.isLoading) return <Loading />;
  if (startersQ.isError) return <QueryError error={startersQ.error} onRetry={() => void startersQ.refetch()} />;
  if (!startersQ.data?.length) return <EmptyState icon="library-outline" title="No templates available" />;

  return (
    <>
      <AppText variant="muted" tone="muted">
        Ready-made forms you can copy and use straight away. A copy is added to My forms as a draft.
      </AppText>
      {startersQ.data.map((s) => (
        <TemplateCard
          key={s.key}
          starter={s}
          added={owned.has(s.name.trim().toLowerCase())}
          busy={install.isPending && install.variables === s.key}
          onPreview={() => setPreview(s)}
          onUse={() => use(s)}
        />
      ))}

      <Sheet visible={!!preview} onClose={() => setPreview(null)} title={preview?.name}>
        {preview ? (
          <>
            <AppText variant="muted" tone="muted">
              {preview.description}
            </AppText>
            <View style={{ gap: spacing.sm }}>
              {(preview.questions ?? []).map((qn, i) =>
                qn.type === 'section' ? (
                  <AppText key={i} variant="label" tone="accent" style={{ marginTop: spacing.sm }}>
                    {qn.question.toUpperCase()}
                  </AppText>
                ) : (
                  <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <AppText variant="muted" style={{ flex: 1 }}>
                      {qn.question}
                    </AppText>
                    <AppText variant="caption" tone="faint">
                      {QUESTION_TYPE[qn.type] ?? titleCase(qn.type)}
                    </AppText>
                  </View>
                ),
              )}
              {!preview.questions?.length ? (
                <AppText variant="muted" tone="faint">
                  {preview.fieldCount} questions.
                </AppText>
              ) : null}
            </View>
            <ActionButton
              label={owned.has(preview.name.trim().toLowerCase()) ? 'Add another copy' : 'Use template'}
              icon="add"
              loading={install.isPending}
              onPress={() => use(preview)}
            />
          </>
        ) : null}
      </Sheet>
    </>
  );
}

function TemplateCard({
  starter: s,
  added,
  busy,
  onPreview,
  onUse,
}: {
  starter: StarterForm;
  added: boolean;
  busy: boolean;
  onPreview: () => void;
  onUse: () => void;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={[styles.templateIcon, { backgroundColor: `${t.colors.primary}1a` }]}>
          <Ionicons name="clipboard-outline" size={20} color={t.colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <AppText variant="body" style={{ fontWeight: '700' }}>
              {s.name}
            </AppText>
            {added ? <Pill label="Added" tone="success" /> : null}
          </View>
          <AppText variant="muted" tone="muted" numberOfLines={3}>
            {s.description}
          </AppText>
          <AppText variant="caption" tone="faint">
            {s.fieldCount} questions
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <ActionButton label="Preview" icon="eye-outline" tone="neutral" onPress={onPreview} />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton label={added ? 'Add again' : 'Use template'} icon="add" loading={busy} onPress={onUse} />
        </View>
      </View>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────── my forms ────

function FormsTab({
  q,
  onNew,
  onTemplates,
}: {
  q: UseQueryResult<AssessmentForm[]>;
  onNew: () => void;
  onTemplates: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [sending, setSending] = useState<AssessmentForm | null>(null);

  const publish = useMutation({
    mutationFn: (f: AssessmentForm) =>
      ownerClientsApi.updateAssessmentForm(f.id, {
        name: f.name,
        description: f.description ?? undefined,
        questions: f.questions,
        status: 'published',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assessment-forms'] }),
    onError: (e: Error) => Alert.alert('Could not publish', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => ownerClientsApi.deleteAssessmentForm(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assessment-forms'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <QueryError error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data?.length) {
    return (
      <EmptyState
        icon="document-text-outline"
        title="No forms yet"
        body="Build your own questionnaire, or copy in one of the ready-made templates."
        action={
          <View style={{ alignSelf: 'stretch', marginTop: spacing.sm, gap: spacing.sm }}>
            <ActionButton label="Create a form" icon="add" onPress={onNew} />
            <ActionButton label="Browse templates" icon="library-outline" tone="neutral" onPress={onTemplates} />
          </View>
        }
      />
    );
  }

  return (
    <>
      {q.data.map((f) => {
        const published = f.status === 'published';
        return (
          <Card key={f.id} style={{ gap: spacing.sm }}>
            <Pressable onPress={() => router.push(`/(owner)/more/assessments/${f.id}`)} style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={[styles.templateIcon, { backgroundColor: published ? `${t.colors.success}1f` : `${t.colors.warning}1f` }]}>
                <Ionicons name="document-text-outline" size={20} color={published ? t.colors.success : t.colors.warning} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="body" style={{ fontWeight: '700' }}>
                  {f.name}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {f.questions.length} questions · edited {relativeTime(f.updated_at)}
                </AppText>
              </View>
              <Pill label={published ? 'Published' : 'Draft'} tone={published ? 'success' : 'warning'} />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                {published ? (
                  <ActionButton label="Send" icon="paper-plane-outline" onPress={() => setSending(f)} />
                ) : (
                  <ActionButton
                    label="Publish"
                    icon="checkmark-circle-outline"
                    loading={publish.isPending && publish.variables?.id === f.id}
                    disabled={!f.questions.length}
                    onPress={() => publish.mutate(f)}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Edit" icon="create-outline" tone="neutral" onPress={() => router.push(`/(owner)/more/assessments/${f.id}`)} />
              </View>
              <IconButton
                icon="trash-outline"
                tone="danger"
                accessibilityLabel={`Delete ${f.name}`}
                onPress={() =>
                  Alert.alert('Delete form?', `${f.name} will be removed. Clients already sent it keep their copy.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(f.id) },
                  ])
                }
              />
            </View>
          </Card>
        );
      })}
      <AppText variant="caption" tone="faint">
        Drafts can&apos;t be sent. Publish a form when it&apos;s ready.
      </AppText>
      <SendFormSheet form={sending} onClose={() => setSending(null)} />
    </>
  );
}

function SendFormSheet({ form, onClose }: { form: AssessmentForm | null; onClose: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const clientsQ = useQuery({
    queryKey: ['clients', 'for-assessment-send'],
    queryFn: () => ownerClientsApi.list({ limit: 200 }),
    enabled: !!form,
  });

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = clientsQ.data?.items ?? [];
    return needle ? all.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(needle)) : all;
  }, [clientsQ.data, search]);

  const close = () => {
    setPicked(new Set());
    setSearch('');
    onClose();
  };

  const send = useMutation({
    mutationFn: async () => {
      const ids = [...picked];
      const results = await Promise.allSettled(ids.map((id) => ownerClientsApi.assignAssessmentForm(id, form!.id)));
      return { sent: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length };
    },
    onSuccess: ({ sent, failed }) => {
      void qc.invalidateQueries({ queryKey: ['assessment-inbox'] });
      Alert.alert(
        sent ? `Sent to ${sent} client${sent === 1 ? '' : 's'}` : 'Not sent',
        failed ? `${failed} could not be sent - they may already have this form.` : undefined,
      );
      close();
    },
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.has(c.id));

  return (
    <Sheet visible={!!form} onClose={close} title={form ? `Send "${form.name}"` : undefined}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or email" />
      {clientsQ.isLoading ? (
        <Loading />
      ) : (
        <>
          <Pressable
            onPress={() =>
              setPicked((prev) => {
                const next = new Set(prev);
                shown.forEach((c) => (allShownPicked ? next.delete(c.id) : next.add(c.id)));
                return next;
              })
            }>
            <AppText variant="caption" tone="accent">
              {allShownPicked ? 'Clear selection' : `Select all ${shown.length}`}
            </AppText>
          </Pressable>
          <View>
            {shown.slice(0, 100).map((c) => {
              const on = picked.has(c.id);
              return (
                <Pressable key={c.id} onPress={() => toggle(c.id)} style={styles.pickRow}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? t.colors.primary : t.colors.textFaint} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{c.display_name || c.name}</AppText>
                    <AppText variant="caption" tone="faint">
                      {c.email}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
            {!shown.length ? (
              <AppText variant="muted" tone="faint">
                No clients match.
              </AppText>
            ) : null}
          </View>
        </>
      )}
      <ActionButton
        label={picked.size ? `Send to ${picked.size}` : 'Choose clients'}
        icon="paper-plane-outline"
        disabled={!picked.size}
        loading={send.isPending}
        onPress={() => send.mutate()}
      />
    </Sheet>
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
        label="Intro for the client (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      <ActionButton label="Create draft" disabled={!name.trim()} loading={create.isPending} onPress={() => create.mutate()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  templateIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
