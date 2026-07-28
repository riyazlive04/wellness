import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';

import { AppText, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { radius, spacing } from '@/lib/theme';

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

  const inputStyle = [
    styles.input,
    { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border, color: t.colors.text },
  ];

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenScroll contentContainerStyle={styles.wrap}>
          <AppText variant="title">Set a new password</AppText>
          {!ready && !done ? (
            <AppText variant="muted" tone="muted">
              Open the reset link from your email on this device. If you already did, wait a moment…
            </AppText>
          ) : done ? (
            <>
              <AppText variant="muted" tone="muted">
                Password updated. Sign in with your new password.
              </AppText>
              <GradientButton label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
            </>
          ) : (
            <>
              <AppText variant="muted" tone="muted">
                Choose a new password for your SIRAH LIFE account.
              </AppText>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="New password"
                placeholderTextColor={t.colors.textFaint}
                style={inputStyle}
              />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="Confirm password"
                placeholderTextColor={t.colors.textFaint}
                style={inputStyle}
              />
              {error ? (
                <AppText variant="muted" tone="danger">
                  {error}
                </AppText>
              ) : null}
              <GradientButton label="Update password" onPress={() => void onSubmit()} loading={busy} />
            </>
          )}
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <AppText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
              Cancel
            </AppText>
          </Pressable>
        </ScreenScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
  },
});
