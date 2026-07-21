import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText, Card, Eyebrow, GhostButton, GradientButton, KeyboardAwareScroll, Screen } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useThemeMode, type ThemeMode } from '@/contexts/theme-context';
import { useTheme } from '@/hooks/use-theme';
import { API_BASE_DEFAULT, clearApiBase, resolveApiBase, setApiBase } from '@/lib/api';
import { clientsApi } from '@/lib/clients-api';
import {
  areNotificationsEnabled,
  disableNotifications,
  enableNotifications,
} from '@/lib/notifications-service';
import { radius, spacing } from '@/lib/theme';

export default function Settings() {
  const t = useTheme();
  const { mode, resolved, setMode } = useThemeMode();
  const qc = useQueryClient();
  const { user, signOut } = useAuth();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const baseQ = useQuery({ queryKey: ['api-base'], queryFn: () => resolveApiBase(), staleTime: Infinity });
  const notifQ = useQuery({ queryKey: ['notif-enabled'], queryFn: () => areNotificationsEnabled(), staleTime: Infinity });

  const toggleNotifications = async (next: boolean) => {
    if (next) {
      const ok = await enableNotifications();
      if (!ok) {
        Alert.alert('Permission needed', 'Allow notifications for SIRAH LIFE in your phone settings to get alerts.');
      }
    } else {
      await disableNotifications();
    }
    qc.invalidateQueries({ queryKey: ['notif-enabled'] });
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

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'Name', value: p?.name },
    { label: 'Email', value: p?.email ?? user?.email },
    { label: 'Phone', value: p?.phone },
    { label: 'Age', value: p?.age != null ? String(p.age) : null },
    { label: 'Height', value: p?.height_cm != null ? `${p.height_cm} cm` : null },
    { label: 'Weight', value: p?.weight_kg != null ? `${p.weight_kg} kg` : null },
    { label: 'Daily target', value: p?.target_kcal != null ? `${p.target_kcal} kcal` : null },
    { label: 'Goal', value: p?.goals },
  ].filter((r) => r.value);

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

        {/* ── Server connection ─────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Server connection</Eyebrow>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.statusDot, { backgroundColor: profileQ.isError ? t.colors.danger : t.colors.success }]} />
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
              style={[styles.input, { backgroundColor: t.colors.surfaceStrong, color: t.colors.text, borderColor: t.colors.border }]}
            />
            <GradientButton label={testing ? 'Testing…' : 'Test & save'} onPress={testAndSave} loading={testing} />
            <GhostButton label="Reset to default" onPress={reset} />
            <AppText variant="caption" tone="faint">
              If your screens are empty, the app cannot reach the backend. Paste the current server URL here and tap Test &amp; save — no reinstall needed.
            </AppText>
          </Card>
        </View>

        {rows.length ? (
          <View style={{ gap: spacing.sm }}>
            <Eyebrow>Profile</Eyebrow>
            <Card style={{ padding: 0 }}>
              {rows.map((r, i) => (
                <View key={r.label} style={[styles.row, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                  <AppText variant="body" tone="muted">{r.label}</AppText>
                  <AppText variant="body" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{r.value}</AppText>
                </View>
              ))}
            </Card>
          </View>
        ) : profileQ.isLoading ? (
          <ActivityIndicator color={t.colors.accent} />
        ) : null}

        {/* ── Notifications ─────────────────────────────────────── */}
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Notifications</Eyebrow>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Ionicons name="notifications-outline" size={20} color={t.colors.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="body">Alerts on this phone</AppText>
                <AppText variant="caption" tone="muted">Messages, reminders and updates</AppText>
              </View>
              <Switch
                value={!!notifQ.data}
                onValueChange={(v) => void toggleNotifications(v)}
                trackColor={{ true: t.colors.primary, false: t.colors.surfaceStrong }}
              />
            </View>
            <AppText variant="caption" tone="faint">
              Checked in the background roughly every 15 minutes, and instantly each time you open the app.
            </AppText>
          </Card>
        </View>

        {/* ── Appearance ────────────────────────────────────────── */}
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
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={active ? t.colors.onBrand : t.colors.textMuted}
                    />
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
          <Eyebrow>App</Eyebrow>
          <Card style={{ padding: 0 }}>
            <View style={styles.row}>
              <AppText variant="body" tone="muted">Version</AppText>
              <AppText variant="body">1.0.0</AppText>
            </View>
          </Card>
        </View>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [
            styles.signOut,
            { borderColor: t.colors.border, backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent' },
          ]}>
          <Ionicons name="log-out-outline" size={18} color={t.colors.danger} />
          <AppText variant="heading" tone="danger">Sign out</AppText>
        </Pressable>
      </KeyboardAwareScroll>
    </Screen>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
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
