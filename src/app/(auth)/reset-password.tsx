import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { AppText, GradientButton } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function parseHashParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
  for (const part of [...hash.split('&'), ...query.split('&')]) {
    if (!part) continue;
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return out;
}

async function establishRecoverySession(url: string): Promise<string | null> {
  const params = parseHashParams(url);
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return error?.message ?? null;
  }
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return error?.message ?? null;
  }
  return null;
}

export default function ResetPassword() {
  const t = useTheme();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Purely cosmetic: drives the teal focus ring on the active field.
  const [focused, setFocused] = useState<'password' | 'confirm' | null>(null);

  useEffect(() => {
    let alive = true;
    const boot = async (url: string | null) => {
      if (url) {
        const err = await establishRecoverySession(url);
        if (err && alive) setError(err);
      }
      const { data } = await supabase.auth.getSession();
      if (alive) setReady(!!data.session);
    };

    void Linking.getInitialURL().then((url) => void boot(url));
    const sub = Linking.addEventListener('url', ({ url }) => void boot(url));
    // Also accept an already-active recovery session (e.g. opened from cold start after setSession).
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setReady(true);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const onSubmit = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      {/* Soft branded wash behind the whole screen. */}
      <LinearGradient
        colors={[t.gradient[0] + '2E', t.gradient[2] + '14', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.7 }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* ── Warm branded hero ────────────────────────────────── */}
          <View style={styles.hero}>
            <LinearGradient
              colors={t.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mark}>
              <Ionicons name={done ? 'checkmark-done' : 'lock-closed'} size={28} color={t.colors.onBrand} />
            </LinearGradient>

            <View style={{ gap: 6, alignItems: 'center', marginTop: spacing.xl }}>
              <AppText variant="title" style={{ letterSpacing: 0.5 }}>
                Set a new password
              </AppText>
              <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
                {!ready && !done
                  ? 'Open the reset link from your email on this device. If you already did, wait a moment…'
                  : done
                    ? 'Password updated. Sign in with your new password.'
                    : 'Choose a new password for your SIRAH LIFE account.'}
              </AppText>
            </View>
          </View>

          {/* ── State-driven body ────────────────────────────────── */}
          <View style={{ gap: spacing.md, marginTop: spacing['3xl'] }}>
            {done ? (
              <GradientButton label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
            ) : ready ? (
              <>
                <Field
                  icon="lock-closed-outline"
                  focused={focused === 'password'}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused((f) => (f === 'password' ? null : f))}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New password"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  trailing={
                    <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8}>
                      <AppText variant="caption" tone="accent">
                        {showPw ? 'HIDE' : 'SHOW'}
                      </AppText>
                    </Pressable>
                  }
                />
                <Field
                  icon="shield-checkmark-outline"
                  focused={focused === 'confirm'}
                  onFocus={() => setFocused('confirm')}
                  onBlur={() => setFocused((f) => (f === 'confirm' ? null : f))}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Confirm password"
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                />

                {error && (
                  <View style={[styles.errorBox, { backgroundColor: t.colors.danger + (t.dark ? '1F' : '14') }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={t.colors.danger} />
                    <AppText variant="muted" tone="danger" style={{ flex: 1 }}>
                      {error}
                    </AppText>
                  </View>
                )}

                <GradientButton
                  label="Update password"
                  onPress={() => void onSubmit()}
                  loading={busy}
                  style={{ marginTop: spacing.sm }}
                />
              </>
            ) : error ? (
              <View style={[styles.errorBox, { backgroundColor: t.colors.danger + (t.dark ? '1F' : '14') }]}>
                <Ionicons name="alert-circle-outline" size={16} color={t.colors.danger} />
                <AppText variant="muted" tone="danger" style={{ flex: 1 }}>
                  {error}
                </AppText>
              </View>
            ) : null}
          </View>

          {/* ── Secondary link ───────────────────────────────────── */}
          <Pressable onPress={() => router.replace('/(auth)/login')} style={{ marginTop: spacing['2xl'] }} hitSlop={8}>
            <AppText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
              Cancel
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Rounded pill input on a strong surface, with an icon prefix and teal focus feel. */
function Field({
  icon,
  focused,
  trailing,
  style,
  ...inputProps
}: TextInputProps & {
  icon: IoniconName;
  focused: boolean;
  trailing?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: t.colors.surfaceStrong,
          borderColor: focused ? t.colors.primary : t.colors.border,
        },
      ]}>
      <Ionicons name={icon} size={18} color={focused ? t.colors.primary : t.colors.textFaint} />
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        style={[styles.input, { color: t.colors.text }, style]}
        {...inputProps}
      />
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
  },
  mark: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    // Soft branded glow beneath the mark.
    shadowColor: '#0b2b30',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
});
