import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Appointment } from '@/lib/clients-api';
import { radius, spacing, type Theme } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Append an alpha byte to a 6-digit hex color (or pass through others unchanged). */
function alpha(hex: string, a: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const clamped = Math.max(0, Math.min(1, a));
  return hex + Math.round(clamped * 255).toString(16).padStart(2, '0');
}

/** Resolve a status to its wellness accent color. */
function statusColor(t: Theme, statusVal: string): string {
  const tone = STATUS_TONE[statusVal] ?? 'muted';
  if (tone === 'success') return t.colors.success;
  if (tone === 'warning') return t.colors.warning;
  if (tone === 'danger') return t.colors.danger;
  return t.colors.textMuted;
}

const MODE_ICON: Record<Appointment['mode'], IoniconName> = {
  video: 'videocam-outline',
  phone: 'call-outline',
  in_person: 'location-outline',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  scheduled: 'success',
  pending: 'warning',
  completed: 'muted',
  cancelled: 'danger',
  declined: 'danger',
  no_show: 'danger',
};

const KINDS: { value: Appointment['kind']; label: string }[] = [
  { value: 'consultation', label: 'Consultation (45 min)' },
  { value: 'follow_up', label: 'Follow-up (30 min)' },
  { value: 'check_in', label: 'Quick check-in (15 min)' },
  { value: 'assessment', label: 'Assessment (60 min)' },
];

const DURATION_FOR: Record<Appointment['kind'], number> = {
  consultation: 45,
  follow_up: 30,
  check_in: 15,
  assessment: 60,
  group_session: 60,
};

const MODES: { value: Appointment['mode']; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' },
];

const JOIN_EARLY_MS = 10 * 60_000;
const GRACE_MS = 15 * 60_000;

function canJoinVideo(a: Appointment, now = Date.now()): boolean {
  if (a.mode !== 'video' || a.status !== 'scheduled' || !a.meeting_url) return false;
  const start = +new Date(a.scheduled_at);
  const end = start + a.duration_minutes * 60_000;
  return now >= start - JOIN_EARLY_MS && now <= end + GRACE_MS;
}

function defaultWhenLocal(): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return { date: toDateInput(d), time: toTimeInput(d) };
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Parse `YYYY-MM-DD` + `HH:mm` as local wall time → ISO. */
function localPartsToIso(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]) - 1;
  const day = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (mo < 0 || mo > 11 || day < 1 || day > 31 || h > 23 || mi > 59) return null;
  const d = new Date(y, mo, day, h, mi, 0, 0);
  return Number.isNaN(+d) ? null : d;
}

export default function Appointments() {
  const t = useTheme();
  const qc = useQueryClient();
  const [bookOpen, setBookOpen] = useState(false);

  const q = useQuery({
    queryKey: ['me', 'appointments'],
    queryFn: () => clientsApi.myAppointments(),
    retry: 1,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => clientsApi.cancelAppointment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'appointments'] });
    },
    onError: (err: Error) => Alert.alert('Could not cancel', err.message),
  });

  const { pending, upcoming, past } = useMemo(() => {
    const appts = q.data ?? [];
    const now = +new Date();
    const pendingList = appts
      .filter((a) => a.status === 'pending')
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    const upcomingList = appts
      .filter((a) => a.status === 'scheduled' && +new Date(a.scheduled_at) > now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    const pastList = appts
      .filter(
        (a) =>
          ['completed', 'cancelled', 'no_show', 'declined'].includes(a.status) ||
          (a.status === 'scheduled' && +new Date(a.scheduled_at) <= now),
      )
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
    return { pending: pendingList, upcoming: upcomingList, past: pastList };
  }, [q.data]);

  const empty = !q.isLoading && pending.length === 0 && upcoming.length === 0 && past.length === 0;

  const confirmCancel = (a: Appointment) => {
    const withdraw = a.status === 'pending';
    Alert.alert(
      withdraw ? 'Withdraw request?' : 'Cancel appointment?',
      withdraw
        ? 'Your nutritionist will no longer see this request.'
        : 'This removes the confirmed session from your calendar.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: withdraw ? 'Withdraw' : 'Cancel session',
          style: 'destructive',
          onPress: () => cancelMut.mutate(a.id),
        },
      ],
    );
  };

  return (
    <Screen edges={[]}>
      <ScreenScroll
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={t.colors.accent} />
        }>
        <View style={{ gap: 4, marginTop: spacing.xs }}>
          <Eyebrow>Sessions</Eyebrow>
          <AppText variant="title">Appointments</AppText>
        </View>

        <GradientButton label="＋ Book a session" onPress={() => setBookOpen(true)} />

        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : empty ? (
          <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'], borderRadius: radius['2xl'] }}>
            <View style={[styles.emptyIcon, { backgroundColor: alpha(t.colors.primary, t.dark ? 0.18 : 0.1) }]}>
              <Ionicons name="calendar-outline" size={26} color={t.colors.primary} />
            </View>
            <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
              No appointments yet. Send a request — your nutritionist confirms the time.
            </AppText>
          </Card>
        ) : (
          <>
            {pending.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>Awaiting confirmation</Eyebrow>
                <AppText variant="caption" tone="muted">
                  Your nutritionist will confirm or suggest a new time.
                </AppText>
                {pending.map((a) => (
                  <ApptCard
                    key={a.id}
                    a={a}
                    onCancel={() => confirmCancel(a)}
                    cancelling={cancelMut.isPending && cancelMut.variables === a.id}
                  />
                ))}
              </View>
            ) : null}

            <View style={{ gap: spacing.sm }}>
              <Eyebrow>Upcoming</Eyebrow>
              {upcoming.length === 0 ? (
                <Card>
                  <AppText variant="muted" tone="muted">
                    No confirmed sessions yet.
                  </AppText>
                </Card>
              ) : (
                upcoming.map((a) => (
                  <ApptCard
                    key={a.id}
                    a={a}
                    onCancel={() => confirmCancel(a)}
                    cancelling={cancelMut.isPending && cancelMut.variables === a.id}
                  />
                ))
              )}
            </View>

            {past.length ? (
              <View style={{ gap: spacing.sm }}>
                <Eyebrow>History</Eyebrow>
                {past.slice(0, 10).map((a) => (
                  <ApptCard key={a.id} a={a} past />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScreenScroll>

      <BookingModal
        visible={bookOpen}
        onClose={() => setBookOpen(false)}
        onBooked={() => {
          setBookOpen(false);
          void qc.invalidateQueries({ queryKey: ['me', 'appointments'] });
        }}
      />
    </Screen>
  );
}

function ApptCard({
  a,
  past,
  onCancel,
  cancelling,
}: {
  a: Appointment;
  past?: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const t = useTheme();
  const router = useRouter();
  const d = new Date(a.scheduled_at);
  const join = !past && canJoinVideo(a);
  const withdraw = a.status === 'pending';
  const chipTint = past ? t.colors.textMuted : t.colors.primary;
  const statTint = statusColor(t, a.status);

  return (
    <Card style={{ gap: spacing.sm, opacity: past ? 0.8 : 1, borderRadius: radius['2xl'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={[
            styles.iconChip,
            { backgroundColor: alpha(chipTint, t.dark ? 0.2 : 0.12) },
          ]}>
          <Ionicons name={MODE_ICON[a.mode]} size={20} color={chipTint} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{titleCase(a.kind)}</AppText>
          <AppText variant="muted" tone="muted">
            {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {a.duration_minutes} min
          </AppText>
        </View>
        <View style={[styles.statusChip, { backgroundColor: alpha(statTint, t.dark ? 0.22 : 0.14) }]}>
          <AppText variant="caption" style={{ color: statTint, textTransform: 'uppercase' }}>
            {a.status}
          </AppText>
        </View>
      </View>

      {withdraw ? (
        <AppText variant="caption" tone="warning">
          Waiting for your nutritionist to confirm
        </AppText>
      ) : null}

      {a.status === 'declined' && a.cancel_reason ? (
        <AppText variant="caption" tone="muted">
          Reason: {a.cancel_reason}
        </AppText>
      ) : null}

      {a.rescheduled_at && a.status !== 'cancelled' && a.status !== 'declined' ? (
        <AppText variant="caption" tone="warning">
          Rescheduled by your nutritionist
          {a.previous_scheduled_at
            ? ` · moved from ${new Date(a.previous_scheduled_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : ''}
        </AppText>
      ) : null}

      {a.notes && !past ? (
        <AppText variant="muted" tone="muted">
          {a.notes}
        </AppText>
      ) : null}
      {a.location ? (
        <AppText variant="muted" tone="muted">
          {a.location}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
        {join ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/(tabs)/more/meeting/[id]', params: { id: a.id } } as never)
            }
            style={({ pressed }) => ({ borderRadius: radius.pill, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}>
            <LinearGradient
              colors={t.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.joinBtn}>
              <Ionicons name="videocam" size={16} color={t.colors.onBrand} />
              <AppText variant="caption" tone="onBrand">
                Join video call
              </AppText>
            </LinearGradient>
          </Pressable>
        ) : null}

        {onCancel ? (
          <Pressable onPress={onCancel} disabled={cancelling} style={{ marginLeft: 'auto' }}>
            {cancelling ? (
              <ActivityIndicator size="small" color={t.colors.textMuted} />
            ) : (
              <AppText variant="caption" tone="muted">
                {withdraw ? 'Withdraw' : 'Cancel'}
              </AppText>
            )}
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function BookingModal({
  visible,
  onClose,
  onBooked,
}: {
  visible: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const t = useTheme();
  const [kind, setKind] = useState<Appointment['kind']>('consultation');
  const [mode, setMode] = useState<Appointment['mode']>('video');
  const [date, setDate] = useState(() => defaultWhenLocal().date);
  const [time, setTime] = useState(() => defaultWhenLocal().time);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    // Intentional one-shot reset of the form each time the sheet opens.
    const w = defaultWhenLocal();
    /* eslint-disable react-hooks/set-state-in-effect */
    setKind('consultation');
    setMode('video');
    setDate(w.date);
    setTime(w.time);
    setNotes('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible]);

  const bookMut = useMutation({
    mutationFn: clientsApi.bookAppointment,
    onSuccess: () => {
      Alert.alert('Request sent', 'Your nutritionist will confirm the time.');
      onBooked();
    },
    onError: (err: Error) => Alert.alert('Could not send request', err.message),
  });

  const submit = () => {
    const when = localPartsToIso(date, time);
    if (!when) {
      Alert.alert('Invalid time', 'Use date as YYYY-MM-DD and time as HH:mm.');
      return;
    }
    if (+when <= Date.now()) {
      Alert.alert('Pick a future time', 'Choose a date and time later than now.');
      return;
    }
    bookMut.mutate({
      scheduled_at: when.toISOString(),
      duration_minutes: DURATION_FOR[kind],
      kind,
      mode,
      notes: notes.trim() || undefined,
    });
  };

  const inputStyle = [
    styles.input,
    { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* padding on both platforms — edge-to-edge Android breaks adjustResize,
          so undefined here left the sheet's inputs under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: t.colors.canvas, borderColor: t.colors.border }]}
            onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading">Request appointment</AppText>
            <AppText variant="caption" tone="muted">
              This sends a request — not a confirmed booking.
            </AppText>

            <AppText variant="caption" tone="muted">
              Type
            </AppText>
            <View style={styles.chips}>
              {KINDS.map((k) => {
                const on = kind === k.value;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => setKind(k.value)}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? t.colors.primary : t.colors.border,
                        backgroundColor: on ? alpha(t.colors.primary, t.dark ? 0.2 : 0.12) : 'transparent',
                      },
                    ]}>
                    <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                      {k.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" tone="muted">
              Mode
            </AppText>
            <View style={styles.chips}>
              {MODES.map((m) => {
                const on = mode === m.value;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => setMode(m.value)}
                    style={[
                      styles.chip,
                      {
                        borderColor: on ? t.colors.primary : t.colors.border,
                        backgroundColor: on ? alpha(t.colors.primary, t.dark ? 0.2 : 0.12) : 'transparent',
                      },
                    ]}>
                    <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                      {m.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="caption" tone="muted">
                  Date (YYYY-MM-DD)
                </AppText>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  autoCapitalize="none"
                  placeholder="2026-07-24"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <AppText variant="caption" tone="muted">
                  Time (HH:mm)
                </AppText>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  autoCapitalize="none"
                  placeholder="10:00"
                  placeholderTextColor={t.colors.textFaint}
                  style={inputStyle}
                />
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <AppText variant="caption" tone="muted">
                Notes (optional)
              </AppText>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything your nutritionist should know"
                placeholderTextColor={t.colors.textFaint}
                multiline
                style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <GhostButton label="Close" onPress={onClose} style={{ flex: 1 }} />
              <GradientButton
                label="Send request"
                onPress={submit}
                loading={bookMut.isPending}
                disabled={bookMut.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '90%',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
});
