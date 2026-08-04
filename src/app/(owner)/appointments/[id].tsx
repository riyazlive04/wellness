/**
 * Appointment detail — ports the web AppointmentDetail page. Shows the session,
 * lets the nutritionist reschedule, change status, cancel, and join the video
 * room (the same embedded room the client joins).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  ActionButton,
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
import { ownerClientsApi, type Appointment } from '@/lib/owner/api/clients';
import { clockTime, dateTime, initials, shortDate, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

const STATUSES: Appointment['status'][] = ['scheduled', 'completed', 'no_show', 'cancelled'];

export default function OwnerAppointmentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const apptId = String(id);
  const router = useRouter();
  const qc = useQueryClient();
  const [openedAt] = useState(() => Date.now());
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const apptQ = useQuery({
    queryKey: ['appointments', apptId],
    queryFn: () => ownerClientsApi.getWorkspaceAppointment(apptId),
    enabled: !!apptId,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['appointments'] });
  };

  const update = useMutation({
    mutationFn: (body: Parameters<typeof ownerClientsApi.updateWorkspaceAppointment>[1]) =>
      ownerClientsApi.updateWorkspaceAppointment(apptId, body),
    onSuccess: () => {
      setRescheduleOpen(false);
      refresh();
    },
    onError: (e: Error) => Alert.alert('Could not update', e.message),
  });

  const cancel = useMutation({
    mutationFn: (reason?: string) => ownerClientsApi.cancelWorkspaceAppointment(apptId, reason),
    onSuccess: () => {
      refresh();
      router.back();
    },
    onError: (e: Error) => Alert.alert('Could not cancel', e.message),
  });

  const a = apptQ.data;

  if (apptQ.isLoading) {
    return (
      <OwnerPage title="Session" back>
        <Loading />
      </OwnerPage>
    );
  }
  if (apptQ.isError || !a) {
    return (
      <OwnerPage title="Session" back>
        <QueryError error={apptQ.error} onRetry={() => void apptQ.refetch()} />
      </OwnerPage>
    );
  }

  // Compared against the screen-open time rather than a fresh clock read:
  // reading the clock in the render body is impure, and "is this session still
  // ahead of us" doesn't need to tick while the screen is open.
  const isUpcoming = new Date(a.scheduled_at).getTime() > openedAt;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const validTime = /^\d{2}:\d{2}$/.test(time);

  return (
    <OwnerPage title={titleCase(a.kind)} subtitle={a.client_name} back>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <AppText variant="title" style={{ flex: 1 }}>
            {clockTime(a.scheduled_at)}
          </AppText>
          <Pill
            label={titleCase(a.status)}
            tone={
              a.status === 'completed'
                ? 'success'
                : a.status === 'scheduled' || a.status === 'pending'
                  ? 'accent'
                  : 'danger'
            }
          />
        </View>
        <AppText variant="muted" tone="muted">
          {`${shortDate(a.scheduled_at)} · ${a.duration_minutes} min · ${titleCase(a.mode)}`}
        </AppText>
        {a.previous_scheduled_at ? (
          <AppText variant="caption" tone="warning">
            {`Moved from ${dateTime(a.previous_scheduled_at)}`}
          </AppText>
        ) : null}
        {a.location ? (
          <AppText variant="muted" tone="muted">
            📍 {a.location}
          </AppText>
        ) : null}
        {a.notes ? <AppText variant="body">{a.notes}</AppText> : null}
        {a.cancel_reason ? (
          <AppText variant="muted" tone="danger">
            {`Cancelled: ${a.cancel_reason}`}
          </AppText>
        ) : null}
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow
          title={a.client_name}
          subtitle="Open client record"
          avatarText={initials(a.client_name)}
          onPress={() => router.push(`/(owner)/clients/${a.client_id}`)}
        />
        <ListRow
          title="Message"
          icon="chatbubble-ellipses-outline"
          onPress={() => router.push(`/(owner)/messaging/${a.client_id}`)}
        />
      </Card>

      {a.mode === 'video' && a.status === 'scheduled' ? (
        <ActionButton
          label="Join video room"
          icon="videocam-outline"
          onPress={() => router.push(`/(owner)/appointments/meeting/${a.id}`)}
        />
      ) : null}

      {isUpcoming && a.status === 'scheduled' ? (
        <ActionButton
          label="Reschedule"
          icon="time-outline"
          tone="neutral"
          onPress={() => {
            const d = new Date(a.scheduled_at);
            setDate(
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            );
            setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
            setRescheduleOpen(true);
          }}
        />
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label" tone="muted">
          MARK AS
        </AppText>
        <SegmentedTabs
          options={STATUSES.map((s) => ({ key: s, label: titleCase(s) }))}
          value={a.status === 'pending' ? 'scheduled' : (a.status as (typeof STATUSES)[number])}
          onChange={(s) => update.mutate({ status: s })}
        />
      </View>

      {a.status !== 'cancelled' ? (
        <ActionButton
          label="Cancel session"
          icon="close-circle-outline"
          tone="danger"
          loading={cancel.isPending}
          onPress={() =>
            Alert.alert('Cancel session?', `${a.client_name} will be notified.`, [
              { text: 'Keep', style: 'cancel' },
              { text: 'Cancel session', style: 'destructive', onPress: () => cancel.mutate(undefined) },
            ])
          }
        />
      ) : null}

      <Sheet visible={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule">
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Date"
              value={date}
              onChangeText={setDate}
              placeholder="2026-08-14"
              hint={date && !validDate ? 'Use YYYY-MM-DD' : undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Time"
              value={time}
              onChangeText={setTime}
              placeholder="15:30"
              hint={time && !validTime ? 'Use HH:MM (24h)' : undefined}
            />
          </View>
        </View>
        <ActionButton
          label="Move session"
          disabled={!validDate || !validTime}
          loading={update.isPending}
          onPress={() =>
            update.mutate({ scheduled_at: new Date(`${date}T${time}:00`).toISOString() })
          }
        />
      </Sheet>
    </OwnerPage>
  );
}
