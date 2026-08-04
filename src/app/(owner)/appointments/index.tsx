/**
 * Schedule — the practice calendar.
 *
 * Ports the web Appointments page (pages/sirah/owner/Appointments.tsx):
 * pending client requests to approve or decline, upcoming sessions grouped by
 * day, past sessions, and booking a new one. Video sessions open the embedded
 * meeting room, the same one the client joins.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import {
  ownerClientsApi,
  type Appointment,
  type WorkspaceAppointment,
} from '@/lib/owner/api/clients';
import { clockTime, dayLabel, initials, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Range = 'upcoming' | 'pending' | 'past';

const KINDS: Appointment['kind'][] = ['consultation', 'follow_up', 'check_in', 'assessment', 'group_session'];
const MODES: Appointment['mode'][] = ['video', 'phone', 'in_person'];

export default function OwnerAppointments() {
  return (
    <RouteGate permission="appointments.manage" feature="appointments" featureLabel="Appointments">
      <AppointmentsInner />
    </RouteGate>
  );
}

function AppointmentsInner() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  /**
   * The instant "upcoming vs past" is measured against. Read once at mount and
   * again on pull-to-refresh: reading the clock during render (including inside
   * a useMemo body) is impure, and the split doesn't need to tick second by
   * second — a session doesn't move from upcoming to past while you watch.
   */
  const [now, setNow] = useState(() => Date.now());

  const listQ = useQuery({
    queryKey: ['appointments', 'workspace'],
    queryFn: () => ownerClientsApi.listWorkspaceAppointments(),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['appointments'] });
    void qc.invalidateQueries({ queryKey: ['owner', 'sidebar-badges'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => ownerClientsApi.approveWorkspaceAppointment(id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not approve', e.message),
  });
  const decline = useMutation({
    mutationFn: (id: string) => ownerClientsApi.declineWorkspaceAppointment(id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not decline', e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => ownerClientsApi.cancelWorkspaceAppointment(id),
    onSuccess: refresh,
    onError: (e: Error) => Alert.alert('Could not cancel', e.message),
  });

  const all = listQ.data ?? [];

  const { pending, upcoming, past } = useMemo(() => {
    const p: WorkspaceAppointment[] = [];
    const u: WorkspaceAppointment[] = [];
    const pa: WorkspaceAppointment[] = [];
    for (const a of all) {
      if (a.status === 'pending') p.push(a);
      else if (new Date(a.scheduled_at).getTime() >= now && a.status === 'scheduled') u.push(a);
      else pa.push(a);
    }
    const byTime = (x: WorkspaceAppointment, y: WorkspaceAppointment) =>
      new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime();
    return { pending: p.sort(byTime), upcoming: u.sort(byTime), past: pa.sort(byTime).reverse() };
  }, [all, now]);

  const rows = range === 'pending' ? pending : range === 'past' ? past : upcoming;

  // Upcoming reads best grouped by day; past and pending are flat lists.
  const grouped = useMemo(() => {
    if (range !== 'upcoming') return null;
    return rows.reduce<Record<string, WorkspaceAppointment[]>>((acc, a) => {
      (acc[dayLabel(a.scheduled_at)] ??= []).push(a);
      return acc;
    }, {});
  }, [rows, range]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNow(Date.now());
    await listQ.refetch();
    setRefreshing(false);
  };

  return (
    <OwnerPage
      title="Schedule"
      subtitle={upcoming.length ? `${upcoming.length} upcoming` : 'Nothing booked'}
      actions={
        <IconButton
          icon="add"
          tone="accent"
          accessibilityLabel="Book appointment"
          onPress={() => setBookOpen(true)}
        />
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      <View>
        <SegmentedTabs
          options={[
            { key: 'upcoming', label: 'Upcoming', badge: upcoming.length || undefined },
            { key: 'pending', label: 'Requests', badge: pending.length || undefined },
            { key: 'past', label: 'Past' },
          ]}
          value={range}
          onChange={setRange}
        />
      </View>

      {listQ.isLoading ? (
        <Loading label="Loading your schedule" />
      ) : listQ.isError ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} lockedFeature="Appointments" />
        </View>
      ) : !rows.length ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            icon="calendar-outline"
            title={
              range === 'pending'
                ? 'No requests waiting'
                : range === 'past'
                  ? 'No past sessions'
                  : 'Nothing booked'
            }
            body={
              range === 'upcoming'
                ? 'Book a session, or let clients request one from their app.'
                : undefined
            }
            action={
              range === 'upcoming' ? (
                <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                  <ActionButton label="Book a session" icon="add" onPress={() => setBookOpen(true)} />
                </View>
              ) : undefined
            }
          />
        </View>
      ) : range === 'pending' ? (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {rows.map((a) => (
            <Card key={a.id} style={{ gap: spacing.md }}>
              <ListRow
                title={a.client_name}
                subtitle={`${titleCase(a.kind)} · ${titleCase(a.mode)}`}
                avatarText={initials(a.client_name)}
                meta={`${dayLabel(a.scheduled_at)} ${clockTime(a.scheduled_at)}`}
              />
              {a.notes ? (
                <AppText variant="muted" tone="muted">
                  “{a.notes}”
                </AppText>
              ) : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <ActionButton label="Approve" icon="checkmark" onPress={() => approve.mutate(a.id)} />
                </View>
                <View style={{ flex: 1 }}>
                  <ActionButton
                    label="Decline"
                    icon="close"
                    tone="neutral"
                    onPress={() =>
                      Alert.alert('Decline request?', `${a.client_name} will be told the slot isn't available.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Decline', style: 'destructive', onPress: () => decline.mutate(a.id) },
                      ])
                    }
                  />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : grouped ? (
        Object.entries(grouped).map(([day, items]) => (
          <View key={day} style={{ gap: spacing.sm }}>
            <AppText
              variant="label"
              tone="faint"
              style={{ textTransform: 'uppercase', letterSpacing: 1.4, paddingHorizontal: spacing.lg }}>
              {day}
            </AppText>
            {items.map((a) => (
              <AppointmentRow
                key={a.id}
                appointment={a}
                onOpen={() => router.push(`/(owner)/appointments/${a.id}`)}
                onCancel={() =>
                  Alert.alert('Cancel session?', `${a.client_name} will be notified.`, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Cancel session', style: 'destructive', onPress: () => cancel.mutate(a.id) },
                  ])
                }
              />
            ))}
          </View>
        ))
      ) : (
        rows.map((a) => (
          <AppointmentRow
            key={a.id}
            appointment={a}
            onOpen={() => router.push(`/(owner)/appointments/${a.id}`)}
          />
        ))
      )}

      <BookSheet visible={bookOpen} onClose={() => setBookOpen(false)} onBooked={refresh} />
    </OwnerPage>
  );
}

function AppointmentRow({
  appointment: a,
  onOpen,
  onCancel,
}: {
  appointment: WorkspaceAppointment;
  onOpen: () => void;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const tone =
    a.status === 'completed'
      ? t.colors.success
      : a.status === 'cancelled' || a.status === 'no_show' || a.status === 'declined'
        ? t.colors.danger
        : undefined;
  return (
    <ListRow
      title={a.client_name}
      subtitle={`${titleCase(a.kind)} · ${titleCase(a.mode)} · ${a.duration_minutes} min`}
      avatarText={initials(a.client_name)}
      tint={tone}
      meta={clockTime(a.scheduled_at)}
      onPress={onOpen}
      right={
        onCancel ? (
          <AppText variant="caption" tone="danger" onPress={onCancel}>
            Cancel
          </AppText>
        ) : (
          <Pill
            label={titleCase(a.status)}
            tone={a.status === 'completed' ? 'success' : a.status === 'scheduled' ? 'accent' : 'neutral'}
          />
        )
      }
    />
  );
}

/**
 * Booking sheet. Date/time entry is a plain ISO-ish field rather than a native
 * picker — no date-picker dependency is in the bundle, and adding one for a
 * single form isn't worth the native rebuild it would force on every tester.
 */
function BookSheet({
  visible,
  onClose,
  onBooked,
}: {
  visible: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<Appointment['kind']>('consultation');
  const [mode, setMode] = useState<Appointment['mode']>('video');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [picking, setPicking] = useState(false);

  const clientsQ = useQuery({
    queryKey: ['clients', 'list', '', 'active'],
    queryFn: () => ownerClientsApi.list({ status: 'active', limit: 100 }),
    enabled: visible,
  });

  const book = useMutation({
    mutationFn: () => {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      return ownerClientsApi.createWorkspaceAppointment({
        client_id: clientId!,
        scheduled_at: iso,
        duration_minutes: Number(duration) || 30,
        kind,
        mode,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      onBooked();
      reset();
      onClose();
    },
    onError: (e: Error) => Alert.alert('Could not book', e.message),
  });

  const reset = () => {
    setClientId(null);
    setClientName('');
    setDate('');
    setTime('');
    setNotes('');
  };

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const validTime = /^\d{2}:\d{2}$/.test(time);
  const ready = !!clientId && validDate && validTime;

  return (
    <Sheet visible={visible} onClose={onClose} title="Book a session">
      <ListRow
        title={clientName || 'Choose a client'}
        icon="person-outline"
        onPress={() => setPicking((p) => !p)}
      />
      {picking ? (
        <Card style={{ padding: 0, overflow: 'hidden', maxHeight: 260 }}>
          {(clientsQ.data?.items ?? []).map((c) => (
            <ListRow
              key={c.id}
              title={c.display_name || c.name}
              subtitle={c.email}
              avatarText={initials(c.display_name || c.name)}
              onPress={() => {
                setClientId(c.id);
                setClientName(c.display_name || c.name);
                setPicking(false);
              }}
            />
          ))}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="2026-08-14"
            keyboardType="numbers-and-punctuation"
            hint={date && !validDate ? 'Use YYYY-MM-DD' : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Time"
            value={time}
            onChangeText={setTime}
            placeholder="15:30"
            keyboardType="numbers-and-punctuation"
            hint={time && !validTime ? 'Use HH:MM (24h)' : undefined}
          />
        </View>
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          KIND
        </AppText>
        <SegmentedTabs
          options={KINDS.map((k) => ({ key: k, label: titleCase(k) }))}
          value={kind}
          onChange={setKind}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          MODE
        </AppText>
        <SegmentedTabs
          options={MODES.map((m) => ({ key: m, label: titleCase(m) }))}
          value={mode}
          onChange={setMode}
        />
      </View>

      <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
      <Field
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      <ActionButton
        label="Book session"
        icon="calendar-outline"
        disabled={!ready}
        loading={book.isPending}
        onPress={() => book.mutate()}
      />
    </Sheet>
  );
}
