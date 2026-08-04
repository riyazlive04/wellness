/**
 * Client detail — the nutritionist's full view of one client.
 *
 * Ports the web ClientDetail page (pages/sirah/owner/ClientDetail.tsx). The web
 * version lays six panels side by side; a phone can't, so the same six become
 * segmented sections: Overview · Nutrition · Wellness · Assessments · Notes ·
 * Files. Every panel reads the same endpoint the web one does.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import {
  ActionButton,
  Can,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerHeader,
  Pill,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { TrendChart } from '@/components/trend-chart';
import { AppText, Card, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { programEngineApi } from '@/lib/owner/api/programEngine';
import { dateTime, dayLabel, fileSize, initials, pct, relativeTime, shortDate, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type TabKey = 'overview' | 'nutrition' | 'wellness' | 'assessments' | 'notes' | 'files';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
];

export default function OwnerClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = String(id);
  const router = useRouter();
  const t = useTheme();
  const [tab, setTab] = useState<TabKey>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const profileQ = useQuery({
    queryKey: ['client', clientId, 'profile'],
    queryFn: () => ownerClientsApi.clientWorkspaceProfile(clientId),
    enabled: !!clientId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await profileQ.refetch();
    setRefreshing(false);
  };

  const p = profileQ.data;
  const name = p?.name ?? 'Client';

  return (
    <Screen>
      <OwnerHeader
        title={name}
        subtitle={p?.email ?? undefined}
        back
        actions={
          <Can permission="messaging.use">
            <IconButton
              icon="chatbubble-ellipses-outline"
              tone="accent"
              accessibilityLabel="Message client"
              onPress={() => router.push(`/(owner)/messaging/${clientId}`)}
            />
          </Can>
        }
      />

      <View style={{ paddingVertical: spacing.sm }}>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
      </View>

      {profileQ.isLoading ? (
        <Loading label="Loading client" />
      ) : profileQ.isError ? (
        <View style={{ padding: spacing.lg }}>
          <QueryError error={profileQ.error} onRetry={() => void profileQ.refetch()} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] * 2, gap: spacing.lg }}>
          {tab === 'overview' ? <OverviewTab clientId={clientId} /> : null}
          {tab === 'nutrition' ? <NutritionTab clientId={clientId} /> : null}
          {tab === 'wellness' ? <WellnessTab clientId={clientId} /> : null}
          {tab === 'assessments' ? <AssessmentsTab clientId={clientId} /> : null}
          {tab === 'notes' ? <NotesTab clientId={clientId} /> : null}
          {tab === 'files' ? <FilesTab clientId={clientId} clientName={name} /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────────  overview ────

function OverviewTab({ clientId }: { clientId: string }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [coachOpen, setCoachOpen] = useState(false);

  const profileQ = useQuery({
    queryKey: ['client', clientId, 'profile'],
    queryFn: () => ownerClientsApi.clientWorkspaceProfile(clientId),
  });
  // The roster row carries what the wellness profile doesn't: status, target
  // kcal, program type and the assigned coach. Fetched by email (the only
  // filter the list endpoint takes) and matched back on id.
  const rosterQ = useQuery({
    queryKey: ['client', clientId, 'roster-row', profileQ.data?.email],
    queryFn: () => ownerClientsApi.list({ q: profileQ.data?.email ?? undefined, limit: 10 }),
    enabled: !!profileQ.data?.email,
    select: (res) => res.items.find((c) => c.id === clientId) ?? null,
  });
  const assignmentsQ = useQuery({
    queryKey: ['programs', 'assignments'],
    queryFn: () => programEngineApi.listAssignments(),
  });
  const coachesQ = useQuery({ queryKey: ['clients', 'coaches'], queryFn: ownerClientsApi.listCoaches });
  const habitsQ = useQuery({
    queryKey: ['client', clientId, 'habits', 30],
    queryFn: () => ownerClientsApi.clientWorkspaceHabits(clientId, 30),
  });

  const assignCoach = useMutation({
    mutationFn: (coachUserId: string | null) => ownerClientsApi.assignCoach(clientId, coachUserId),
    onSuccess: () => {
      setCoachOpen(false);
      void qc.invalidateQueries({ queryKey: ['client', clientId] });
      void qc.invalidateQueries({ queryKey: ['clients', 'list'] });
    },
    onError: (e: Error) => Alert.alert('Could not assign', e.message),
  });

  const p = profileQ.data;
  const roster = rosterQ.data ?? null;
  const weights = (habitsQ.data ?? [])
    .filter((h) => h.weight_kg !== null)
    .map((h) => h.weight_kg as number);
  const latestWeight = weights.length ? weights[weights.length - 1] : null;

  const assignment = useMemo(
    () => (assignmentsQ.data ?? []).find((a) => a.client_id === clientId),
    [assignmentsQ.data, clientId],
  );

  if (!p) return <Loading />;

  return (
    <>
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 999,
              backgroundColor: t.colors.surfaceStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText variant="heading" tone="accent">
              {initials(p.name)}
            </AppText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="heading" numberOfLines={1}>
              {p.name ?? 'Client'}
            </AppText>
            <AppText variant="muted" tone="muted" numberOfLines={1}>
              {[p.age ? `${p.age}y` : null, p.gender ? titleCase(p.gender) : null, p.phone]
                .filter(Boolean)
                .join(' · ') || p.email}
            </AppText>
          </View>
          {roster?.status ? (
            <Pill label={titleCase(roster.status)} tone={roster.status === 'active' ? 'success' : 'neutral'} />
          ) : null}
        </View>
        {roster?.last_active_at ? (
          <AppText variant="caption" tone="faint">
            {`Last active ${relativeTime(roster.last_active_at)}`}
          </AppText>
        ) : null}
      </Card>

      <TileRow>
        <StatTile label="Height" value={p.height_cm ? `${p.height_cm} cm` : '—'} icon="resize-outline" />
        <StatTile label="Weight" value={latestWeight !== null ? `${latestWeight} kg` : '—'} icon="barbell-outline" />
        <StatTile label="Target kcal" value={roster?.target_kcal ?? '—'} icon="flame-outline" />
      </TileRow>

      {weights.length >= 2 ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Weight trend</AppText>
          <TrendChart values={weights} />
          <AppText variant="caption" tone="faint">
            Last {weights.length} logged weights
          </AppText>
        </Card>
      ) : null}

      {/* Clinical context — the fields that change what you prescribe. */}
      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">Clinical notes from intake</AppText>
        <DetailRow label="Goals" value={p.goals} />
        <DetailRow label="Activity level" value={p.activity_level ? titleCase(p.activity_level) : null} />
        <DetailRow label="Allergies" value={p.allergies} tone="danger" />
        <DetailRow label="Medical conditions" value={p.medical_conditions} tone="danger" />
        <DetailRow label="Food preferences" value={p.food_preferences} />
        <DetailRow label="Service" value={p.service_type ? titleCase(p.service_type) : null} />
      </Card>

      {/* Active program */}
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Program</AppText>
        {assignment ? (
          <>
            <AppText variant="body">{assignment.name}</AppText>
            <AppText variant="muted" tone="muted">
              {`Started ${shortDate(assignment.start_date)} · ${titleCase(assignment.status)} · ${pct(Number(assignment.progress_pct))}`}
            </AppText>
          </>
        ) : (
          <AppText variant="muted" tone="muted">
            No program assigned yet.
          </AppText>
        )}
      </Card>

      {/* Coach assignment */}
      <Can permission="clients.read">
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Assigned coach</AppText>
          <AppText variant="muted" tone="muted">
            {coachesQ.data?.find((c) => c.user_id === roster?.assigned_coach_user_id)?.name ?? 'Unassigned'}
          </AppText>
          <ActionButton
            label="Change coach"
            icon="people-circle-outline"
            tone="neutral"
            onPress={() => setCoachOpen(true)}
          />
        </Card>
      </Can>

      <Sheet visible={coachOpen} onClose={() => setCoachOpen(false)} title="Assign a coach">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow
            title="Unassigned"
            icon="close-circle-outline"
            onPress={() => assignCoach.mutate(null)}
          />
          {(coachesQ.data ?? []).map((c) => (
            <ListRow
              key={c.user_id}
              title={c.name}
              subtitle={[c.email, titleCase(c.role)].filter(Boolean).join(' · ')}
              avatarText={initials(c.name)}
              onPress={() => assignCoach.mutate(c.user_id)}
            />
          ))}
        </Card>
      </Sheet>
    </>
  );
}

function DetailRow({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string | null | undefined;
  tone?: 'muted' | 'danger';
}) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="label" tone="faint">
        {label.toUpperCase()}
      </AppText>
      <AppText variant="body" tone={value && tone === 'danger' ? 'danger' : 'text'}>
        {value?.trim() || 'Not provided'}
      </AppText>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────  nutrition ────

function NutritionTab({ clientId }: { clientId: string }) {
  const trendsQ = useQuery({
    queryKey: ['client', clientId, 'nutrition-trends'],
    queryFn: () => ownerClientsApi.clientWorkspaceNutritionTrends(clientId, 14),
  });
  const mealsQ = useQuery({
    queryKey: ['client', clientId, 'meals'],
    queryFn: () => ownerClientsApi.clientWorkspaceMeals(clientId, 14),
  });

  if (trendsQ.isLoading || mealsQ.isLoading) return <Loading />;
  if (trendsQ.isError) return <QueryError error={trendsQ.error} onRetry={() => void trendsQ.refetch()} />;

  const trends = trendsQ.data ?? [];
  const meals = mealsQ.data ?? [];
  const avgKcal = trends.length
    ? Math.round(trends.reduce((s, d) => s + d.total_kcal, 0) / trends.length)
    : 0;
  const avgProtein = trends.length
    ? Math.round(trends.reduce((s, d) => s + d.total_protein_g, 0) / trends.length)
    : 0;

  // Group the log by day so a fortnight reads as a diary, not a wall of rows.
  const byDay = meals.reduce<Record<string, typeof meals>>((acc, m) => {
    const key = dayLabel(m.logged_at);
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <TileRow>
        <StatTile label="Avg kcal / day" value={avgKcal || '—'} icon="flame-outline" />
        <StatTile label="Avg protein" value={avgProtein ? `${avgProtein}g` : '—'} icon="egg-outline" />
        <StatTile label="Meals logged" value={meals.length} icon="restaurant-outline" />
      </TileRow>

      {trends.length >= 2 ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Daily calories</AppText>
          <TrendChart values={trends.map((d) => d.total_kcal)} />
          <AppText variant="caption" tone="faint">
            Last {trends.length} days
          </AppText>
        </Card>
      ) : null}

      {!meals.length ? (
        <EmptyState
          icon="restaurant-outline"
          title="No meals logged"
          body="Nothing in the last 14 days. A nudge in the inbox usually helps."
        />
      ) : (
        Object.entries(byDay).map(([day, rows]) => (
          <View key={day} style={{ gap: spacing.sm }}>
            <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
              {day}
            </AppText>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {rows.map((m) => (
                <ListRow
                  key={m.id}
                  title={m.meal_name || m.detected_name || titleCase(m.meal_type)}
                  subtitle={[
                    titleCase(m.meal_type),
                    m.cooking_method ? titleCase(m.cooking_method) : null,
                    m.ai_confidence !== null ? `AI ${pct(m.ai_confidence, 1)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon="restaurant-outline"
                  meta={m.kcal ? `${m.kcal} kcal` : undefined}
                />
              ))}
            </Card>
          </View>
        ))
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────  wellness ────

function WellnessTab({ clientId }: { clientId: string }) {
  const habitsQ = useQuery({
    queryKey: ['client', clientId, 'habits', 30],
    queryFn: () => ownerClientsApi.clientWorkspaceHabits(clientId, 30),
  });
  const measurementsQ = useQuery({
    queryKey: ['client', clientId, 'measurements'],
    queryFn: () => ownerClientsApi.clientWorkspaceMeasurements(clientId),
  });

  if (habitsQ.isLoading) return <Loading />;
  if (habitsQ.isError) return <QueryError error={habitsQ.error} onRetry={() => void habitsQ.refetch()} />;

  const habits = habitsQ.data ?? [];
  const measurements = measurementsQ.data ?? [];
  const recent = habits.slice(0, 14);

  const avg = (pick: (h: (typeof habits)[number]) => number | null) => {
    const vals = habits.map(pick).filter((v): v is number => v !== null && !Number.isNaN(v));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  const avgWater = avg((h) => h.water_ml);
  const avgSleep = avg((h) => h.sleep_hours);
  const avgExercise = avg((h) => h.exercise_minutes);

  return (
    <>
      <TileRow>
        <StatTile label="Avg water" value={avgWater ? `${Math.round(avgWater)} ml` : '—'} icon="water-outline" />
        <StatTile label="Avg sleep" value={avgSleep ? `${avgSleep} h` : '—'} icon="moon-outline" />
        <StatTile label="Avg exercise" value={avgExercise ? `${Math.round(avgExercise)} min` : '—'} icon="walk-outline" />
      </TileRow>

      {habits.filter((h) => h.weight_kg !== null).length >= 2 ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Weight</AppText>
          <TrendChart values={habits.filter((h) => h.weight_kg !== null).map((h) => h.weight_kg as number)} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
          Daily log
        </AppText>
        {!recent.length ? (
          <EmptyState icon="pulse-outline" title="No habit logs" body="This client hasn't logged habits yet." />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {recent.map((h) => (
              <ListRow
                key={h.date}
                title={dayLabel(h.date)}
                subtitle={[
                  `${h.water_ml} ml`,
                  h.sleep_hours !== null ? `${h.sleep_hours} h sleep` : null,
                  h.exercise_minutes ? `${h.exercise_minutes} min` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon="calendar-outline"
                meta={h.weight_kg !== null ? `${h.weight_kg} kg` : undefined}
              />
            ))}
          </Card>
        )}
      </View>

      {measurements.length ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
            Measurements
          </AppText>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {measurements.slice(0, 10).map((m) => (
              <ListRow
                key={m.id}
                title={shortDate(m.recorded_at)}
                subtitle={[
                  m.waist_inches ? `Waist ${m.waist_inches}"` : null,
                  m.hip_inches ? `Hip ${m.hip_inches}"` : null,
                  m.chest_inches ? `Chest ${m.chest_inches}"` : null,
                  m.arm_inches ? `Arm ${m.arm_inches}"` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon="resize-outline"
              />
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────  assessments ────

function AssessmentsTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const listQ = useQuery({
    queryKey: ['client', clientId, 'assessments'],
    queryFn: () => ownerClientsApi.clientAssessments(clientId),
  });
  const formsQ = useQuery({
    queryKey: ['assessment-forms'],
    queryFn: ownerClientsApi.listAssessmentForms,
    enabled: assignOpen,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['client', clientId, 'assessments'] });

  const assignStandard = useMutation({
    mutationFn: (type: 'health' | 'stress' | 'sleep') => ownerClientsApi.assignAssessment(clientId, type),
    onSuccess: () => {
      setAssignOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not assign', e.message),
  });

  const assignForm = useMutation({
    mutationFn: (templateId: string) => ownerClientsApi.assignAssessmentForm(clientId, templateId),
    onSuccess: () => {
      setAssignOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not assign', e.message),
  });

  const review = useMutation({
    mutationFn: ({ cardId, text }: { cardId: string; text: string }) =>
      ownerClientsApi.reviewAssessment(clientId, cardId, text || undefined),
    onSuccess: () => {
      setReviewing(null);
      setNote('');
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not save review', e.message),
  });

  if (listQ.isLoading) return <Loading />;
  if (listQ.isError) return <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} />;

  const cards = listQ.data ?? [];

  return (
    <>
      <ActionButton label="Assign an assessment" icon="add-circle-outline" onPress={() => setAssignOpen(true)} />

      {!cards.length ? (
        <EmptyState
          icon="checkbox-outline"
          title="No assessments yet"
          body="Assign a health, stress or sleep questionnaire — or one of your own forms."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {cards.map((c) => (
            <ListRow
              key={c.id}
              title={titleCase(c.card_type)}
              subtitle={
                c.has_responses
                  ? c.reviewed_at
                    ? `Reviewed ${shortDate(c.reviewed_at)}`
                    : 'Submitted — awaiting your review'
                  : c.sent_at
                    ? `Sent ${shortDate(c.sent_at)} — not answered yet`
                    : 'Draft'
              }
              icon="checkbox-outline"
              right={
                c.has_responses && !c.reviewed_at ? (
                  <AppText variant="caption" tone="accent" onPress={() => setReviewing(c.id)}>
                    Review
                  </AppText>
                ) : undefined
              }
            />
          ))}
        </Card>
      )}

      <Sheet visible={assignOpen} onClose={() => setAssignOpen(false)} title="Assign an assessment">
        <AppText variant="label" tone="muted">
          STANDARD
        </AppText>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(['health', 'stress', 'sleep'] as const).map((k) => (
            <ListRow
              key={k}
              title={`${titleCase(k)} assessment`}
              icon="clipboard-outline"
              onPress={() => assignStandard.mutate(k)}
            />
          ))}
        </Card>

        <AppText variant="label" tone="muted" style={{ marginTop: spacing.md }}>
          YOUR FORMS
        </AppText>
        {formsQ.isLoading ? (
          <Loading />
        ) : !formsQ.data?.filter((f) => f.status === 'published').length ? (
          <AppText variant="muted" tone="faint">
            No published forms yet. Build one under More → Assessments.
          </AppText>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {formsQ.data
              .filter((f) => f.status === 'published')
              .map((f) => (
                <ListRow
                  key={f.id}
                  title={f.name}
                  subtitle={f.description ?? `${f.questions.length} questions`}
                  icon="document-text-outline"
                  onPress={() => assignForm.mutate(f.id)}
                />
              ))}
          </Card>
        )}
      </Sheet>

      <Sheet visible={!!reviewing} onClose={() => setReviewing(null)} title="Mark reviewed">
        <Field
          label="Note for the client (optional)"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="What you noticed and what they should do next"
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Save review"
          loading={review.isPending}
          onPress={() => reviewing && review.mutate({ cardId: reviewing, text: note })}
        />
      </Sheet>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────  notes ────

function NotesTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  const notesQ = useQuery({
    queryKey: ['client', clientId, 'notes'],
    queryFn: () => ownerClientsApi.clientNotes(clientId),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['client', clientId, 'notes'] });

  const add = useMutation({
    mutationFn: (content: string) => ownerClientsApi.addClientNote(clientId, content),
    onSuccess: () => {
      setDraft('');
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not save note', e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      ownerClientsApi.updateClientNote(clientId, id, content),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not update note', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => ownerClientsApi.deleteClientNote(clientId, id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not delete note', e.message),
  });

  return (
    <>
      <Card style={{ gap: spacing.sm }}>
        <Field
          label="New private note"
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Only your team sees this — the client never does."
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Add note"
          icon="add"
          disabled={!draft.trim()}
          loading={add.isPending}
          onPress={() => add.mutate(draft.trim())}
        />
      </Card>

      {notesQ.isLoading ? (
        <Loading />
      ) : notesQ.isError ? (
        <QueryError error={notesQ.error} onRetry={() => void notesQ.refetch()} />
      ) : !notesQ.data?.length ? (
        <EmptyState icon="create-outline" title="No notes yet" body="Jot down what you want to remember before the next session." />
      ) : (
        notesQ.data.map((n) => (
          <Card key={n.id} style={{ gap: spacing.sm }}>
            <AppText variant="body">{n.content}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <AppText variant="caption" tone="faint" style={{ flex: 1 }}>
                {relativeTime(n.created_at)}
              </AppText>
              <AppText
                variant="caption"
                tone="accent"
                onPress={() => setEditing({ id: n.id, content: n.content })}>
                Edit
              </AppText>
              <AppText
                variant="caption"
                tone="danger"
                onPress={() =>
                  Alert.alert('Delete note?', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(n.id) },
                  ])
                }>
                Delete
              </AppText>
            </View>
          </Card>
        ))
      )}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Edit note">
        <Field
          label="Note"
          value={editing?.content ?? ''}
          onChangeText={(v) => setEditing((e) => (e ? { ...e, content: v } : e))}
          multiline
          style={{ minHeight: 130, textAlignVertical: 'top' }}
        />
        <ActionButton
          label="Save"
          loading={update.isPending}
          onPress={() => editing && update.mutate({ id: editing.id, content: editing.content })}
        />
      </Sheet>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────  files ────

function FilesTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const filesQ = useQuery({
    queryKey: ['client', clientId, 'files'],
    queryFn: () => ownerClientsApi.clientWorkspaceFiles(clientId),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['client', clientId, 'files'] });

  const remove = useMutation({
    mutationFn: (fileId: string) => ownerClientsApi.deleteClientFile(clientId, fileId),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  /**
   * Signed-URL upload, same three steps as the web vault:
   *   ticket → PUT the bytes straight to storage → register the row.
   * The bytes never pass through the API, so a large PDF doesn't tie up a
   * request slot.
   */
  const pickAndShare = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    setUploading(true);
    try {
      const ticket = await ownerClientsApi.clientFileUploadTicket(clientId, file.name);
      const blob = await (await fetch(file.uri)).blob();
      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: file.mimeType ? { 'Content-Type': file.mimeType } : undefined,
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await ownerClientsApi.shareClientFile(clientId, {
        storage_key: ticket.storageKey,
        file_name: file.name,
        file_type: file.mimeType ?? undefined,
        file_size: file.size ?? undefined,
      });
      refresh();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const open = async (fileId: string) => {
    try {
      const { url } = await ownerClientsApi.signClientFile(clientId, fileId);
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert('Could not open file', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <>
      <ActionButton
        label={`Share a file with ${clientName.split(' ')[0]}`}
        icon="cloud-upload-outline"
        loading={uploading}
        onPress={() => void pickAndShare()}
      />

      {filesQ.isLoading ? (
        <Loading />
      ) : filesQ.isError ? (
        <QueryError error={filesQ.error} onRetry={() => void filesQ.refetch()} />
      ) : !filesQ.data?.length ? (
        <EmptyState
          icon="folder-open-outline"
          title="No files"
          body="Reports, meal plans and anything the client uploads will show up here."
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {filesQ.data.map((f) => (
            <ListRow
              key={f.id}
              title={f.file_name}
              subtitle={`${fileSize(f.file_size)} · ${dateTime(f.created_at)}`}
              icon="document-outline"
              onPress={() => void open(f.id)}
              right={
                <AppText
                  variant="caption"
                  tone="danger"
                  onPress={() =>
                    Alert.alert('Delete file?', f.file_name, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(f.id) },
                    ])
                  }>
                  Delete
                </AppText>
              }
            />
          ))}
        </Card>
      )}
    </>
  );
}
