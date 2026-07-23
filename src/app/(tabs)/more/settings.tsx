import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useThemeMode, type ThemeMode } from '@/contexts/theme-context';
import { useAppUpdate } from '@/hooks/use-app-update';
import { useTheme } from '@/hooks/use-theme';
import { API_BASE_DEFAULT, clearApiBase, resolveApiBase, setApiBase } from '@/lib/api';
import { clientsApi } from '@/lib/clients-api';
import {
  areNotificationsEnabled,
  disableNotifications,
  enableNotifications,
} from '@/lib/notifications-service';
import { radius, spacing } from '@/lib/theme';

const GENDERS = ['female', 'male', 'non-binary', 'prefer not to say'];
const ACTIVITY = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

export default function Settings() {
  const t = useTheme();
  const { mode, resolved, setMode } = useThemeMode();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const baseQ = useQuery({ queryKey: ['api-base'], queryFn: () => resolveApiBase(), staleTime: Infinity });
  const notifQ = useQuery({ queryKey: ['notif-enabled'], queryFn: () => areNotificationsEnabled(), staleTime: Infinity });

  const [form, setForm] = useState({
    name: '',
    phone: '',
    age: '',
    gender: '',
    heightCm: '',
    weightKg: '',
    goals: '',
    activity: 'moderate',
    allergies: '',
    medical: '',
    preferences: '',
  });

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    // Prefill the editable form once the profile arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      name: p.name ?? '',
      phone: p.phone ?? '',
      age: p.age != null ? String(p.age) : '',
      gender: p.gender ?? '',
      heightCm: p.height_cm != null ? String(p.height_cm) : '',
      weightKg: p.weight_kg != null ? String(p.weight_kg) : '',
      goals: p.goals ?? '',
      activity: p.activity_level ?? 'moderate',
      allergies: p.allergies ?? '',
      medical: p.medical_conditions ?? '',
      preferences: p.food_preferences ?? '',
    });
  }, [profileQ.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const age = parseInt(form.age, 10);
      const height = parseFloat(form.heightCm);
      const weight = parseFloat(form.weightKg);
      return clientsApi.updateMyProfile({
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        age: Number.isFinite(age) ? age : undefined,
        gender: form.gender || undefined,
        height_cm: Number.isFinite(height) ? height : undefined,
        weight_kg: Number.isFinite(weight) ? weight : undefined,
        goals: form.goals.trim() || undefined,
        activity_level: form.activity || undefined,
        allergies: form.allergies.trim() || undefined,
        medical_conditions: form.medical.trim() || undefined,
        food_preferences: form.preferences.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me', 'profile'] });
      Alert.alert('Saved', 'Your profile was updated.');
    },
    onError: (err: Error) => Alert.alert('Could not save', err.message),
  });

  const toggleNotifications = async (next: boolean) => {
    if (next) {
      const ok = await enableNotifications();
      if (!ok) {
        Alert.alert('Permission needed', 'Allow notifications for SIRAH LIFE in your phone settings to get alerts.');
      }
    } else {
      await disableNotifications();
    }
    void qc.invalidateQueries({ queryKey: ['notif-enabled'] });
  };

  const current = baseQ.data ?? API_BASE_DEFAULT;
  const [draft, setDraft] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const shown = draft ?? current;
  const p = profileQ.data;

  const confirmSignOut = () =>
    Alert.alert('Sign out?', "You'll need to sign in again to return.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  const testAndSave = async () => {
    const url = shown.trim().replace(/\/+$/, '');
    if (!url) return;
    setTesting(true);
    try {
      const res = await fetch(`${url}/api/v1/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`Server replied ${res.status}`);
      await setApiBase(url);
      setDraft(null);
      await qc.invalidateQueries();
      Alert.alert('Connected', 'Server reachable. Your data will now load.');
    } catch (e) {
      Alert.alert('Could not reach server', (e as Error).message || 'Check the URL and your connection.');
    } finally {
      setTesting(false);
    }
  };

  const reset = async () => {
    await clearApiBase();
    setDraft(null);
    await qc.invalidateQueries();
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const inputStyle = [
    styles.input,
    { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border },
  ];

  return (
    <Screen edges={[]}>
      <KeyboardAwareScroll>
        {p?.workspace_name ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={[styles.icon, { backgroundColor: t.colors.surfaceStrong }]}>
              <Ionicons name="leaf-outline" size={18} color={t.colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Eyebrow>Your practice</Eyebrow>
              <AppText variant="heading">{p.workspace_name}</AppText>
            </View>
          </Card>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Profile</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            {profileQ.isLoading ? (
              <ActivityIndicator color={t.colors.accent} />
            ) : (
              <>
                <Field label="Name">
                  <TextInput
                    value={form.name}
                    onChangeText={(v) => set('name', v)}
                    placeholder="Your name"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Email (read-only)">
                  <AppText variant="body">{p?.email ?? user?.email ?? '—'}</AppText>
                </Field>
                <Field label="Phone">
                  <TextInput
                    value={form.phone}
                    onChangeText={(v) => set('phone', v)}
                    keyboardType="phone-pad"
                    placeholder="Optional"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Age">
                  <TextInput
                    value={form.age}
                    onChangeText={(v) => set('age', v.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="e.g. 32"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Gender">
                  <View style={styles.chips}>
                    {GENDERS.map((g) => {
                      const on = form.gender === g;
                      return (
                        <Pressable
                          key={g}
                          onPress={() => set('gender', g)}
                          style={[
                            styles.chip,
                            {
                              borderColor: t.colors.border,
                              backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                            },
                          ]}>
                          <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                            {g}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field label="Height (cm)">
                      <TextInput
                        value={form.heightCm}
                        onChangeText={(v) => set('heightCm', v.replace(/[^\d.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholderTextColor={t.colors.textFaint}
                        style={inputStyle}
                      />
                    </Field>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Weight (kg)">
                      <TextInput
                        value={form.weightKg}
                        onChangeText={(v) => set('weightKg', v.replace(/[^\d.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholderTextColor={t.colors.textFaint}
                        style={inputStyle}
                      />
                    </Field>
                  </View>
                </View>
                <Field label="Goals">
                  <TextInput
                    value={form.goals}
                    onChangeText={(v) => set('goals', v)}
                    placeholder="e.g. Weight loss"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Activity">
                  <View style={styles.chips}>
                    {ACTIVITY.map((a) => {
                      const on = form.activity === a.value;
                      return (
                        <Pressable
                          key={a.value}
                          onPress={() => set('activity', a.value)}
                          style={[
                            styles.chip,
                            {
                              borderColor: t.colors.border,
                              backgroundColor: on ? t.colors.surfaceStrong : 'transparent',
                            },
                          ]}>
                          <AppText variant="caption" tone={on ? 'accent' : 'muted'}>
                            {a.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
                <Field label="Allergies">
                  <TextInput
                    value={form.allergies}
                    onChangeText={(v) => set('allergies', v)}
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Medical conditions">
                  <TextInput
                    value={form.medical}
                    onChangeText={(v) => set('medical', v)}
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Food preferences">
                  <TextInput
                    value={form.preferences}
                    onChangeText={(v) => set('preferences', v)}
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                </Field>
                <GradientButton
                  label="Save profile"
                  onPress={() => saveMut.mutate()}
                  loading={saveMut.isPending}
                  disabled={saveMut.isPending}
                />
              </>
            )}
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Server connection</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                style={[styles.statusDot, { backgroundColor: profileQ.isError ? t.colors.danger : t.colors.success }]}
              />
              <AppText variant="muted" tone={profileQ.isError ? 'danger' : 'success'}>
                {profileQ.isError ? 'Not reaching the server' : 'Connected'}
              </AppText>
            </View>
            <TextInput
              value={shown}
              onChangeText={setDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-backend-url"
              placeholderTextColor={t.colors.textFaint}
              style={inputStyle}
            />
            <GradientButton label={testing ? 'Testing…' : 'Test & save'} onPress={() => void testAndSave()} loading={testing} />
            <GhostButton label="Reset to default" onPress={() => void reset()} />
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Notifications</Eyebrow>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Ionicons name="notifications-outline" size={20} color={t.colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="body">Alerts on this phone</AppText>
                <AppText variant="caption" tone="muted">
                  Messages, reminders and updates
                </AppText>
              </View>
              <Switch
                value={!!notifQ.data}
                onValueChange={(v) => void toggleNotifications(v)}
                trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }}
              />
            </View>
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Appearance</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.segment}>
              {(
                [
                  { key: 'light', label: 'Light', icon: 'sunny-outline' },
                  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
                  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
                ] as { key: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[]
              ).map((opt) => {
                const active = mode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setMode(opt.key)}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: active ? t.colors.primary : t.colors.surfaceStrong,
                        borderColor: active ? 'transparent' : t.colors.border,
                      },
                    ]}>
                    <Ionicons name={opt.icon} size={18} color={active ? t.colors.onBrand : t.colors.textMuted} />
                    <AppText variant="caption" tone={active ? 'onBrand' : 'muted'}>
                      {opt.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <AppText variant="caption" tone="faint">
              {mode === 'system'
                ? `Following your phone (currently ${resolved}).`
                : `Always ${mode}. Tap System to follow your phone.`}
            </AppText>
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Eyebrow>About</Eyebrow>
          <AppUpdateCard />
        </View>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [
            styles.signOut,
            { borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
          ]}>
          <Ionicons name="log-out-outline" size={18} color={t.colors.danger} />
          <AppText variant="heading" tone="danger">
            Sign out
          </AppText>
        </Pressable>
      </KeyboardAwareScroll>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

/**
 * Installed version + a manual update check.
 *
 * The launch prompt can be dismissed with "Later", so this is the way back to
 * an update the user postponed — without it, a postponed update is unreachable
 * until the next app start.
 */
function AppUpdateCard() {
  const t = useTheme();
  const { current, latest, manifest, available, isChecking, isError, check } = useAppUpdate();

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ionicons
          name={available ? 'cloud-download-outline' : 'checkmark-circle-outline'}
          size={20}
          color={available ? t.colors.accent : t.colors.success}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="body">{current ? `SIRAH LIFE v${current}` : 'SIRAH LIFE'}</AppText>
          <AppText variant="caption" tone="muted">
            {isChecking
              ? 'Checking for updates…'
              : available
                ? `Version ${latest} is available`
                : isError
                  ? "Couldn't check for updates"
                  : current
                    ? "You're on the latest version"
                    : `Latest published version is ${latest ?? 'unknown'}`}
          </AppText>
        </View>
        {!available ? (
          <Pressable onPress={check} hitSlop={8} disabled={isChecking}>
            {isChecking ? (
              <ActivityIndicator color={t.colors.accent} />
            ) : (
              <Ionicons name="refresh" size={18} color={t.colors.accent} />
            )}
          </Pressable>
        ) : null}
      </View>

      {available && manifest ? (
        <GradientButton
          label={`Download v${manifest.version}`}
          onPress={() => void Linking.openURL(manifest.url).catch(() => {})}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9999,
    paddingVertical: 14,
    marginTop: spacing.sm,
  },
});
