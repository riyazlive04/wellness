import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { AppText, GradientButton } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  // Purely cosmetic: drives the teal focus ring on the active field.
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  const onForgot = async () => {
    if (!email.trim()) {
      setError('Enter your email above, then tap Forgot password.');
      return;
    }
    setResetBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'sirahlife://reset-password',
    });
    setResetBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    Alert.alert(
      'Check your email',
      'If an account exists for that address, we sent a reset link. Open it on this device to set a new password.',
    );
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
              <Ionicons name="leaf" size={30} color={t.colors.onBrand} />
            </LinearGradient>

            <View style={{ gap: 6, alignItems: 'center', marginTop: spacing.xl }}>
              <AppText variant="title" style={{ letterSpacing: 0.5 }}>
                SIRAH LIFE
              </AppText>
              <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
                Welcome back to your wellness space.
              </AppText>
            </View>
          </View>

          {/* ── Sign-in form ─────────────────────────────────────── */}
          <View style={{ gap: spacing.md, marginTop: spacing['3xl'] }}>
            <Field
              icon="mail-outline"
              focused={focused === 'email'}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused((f) => (f === 'email' ? null : f))}
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />

            <Field
              icon="lock-closed-outline"
              focused={focused === 'password'}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused((f) => (f === 'password' ? null : f))}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
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

            <Pressable
              onPress={() => void onForgot()}
              disabled={resetBusy}
              style={{ alignSelf: 'flex-end' }}
              hitSlop={8}>
              <AppText variant="caption" tone="accent">
                {resetBusy ? 'Sending…' : 'Forgot password?'}
              </AppText>
            </Pressable>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: t.colors.danger + (t.dark ? '1F' : '14') }]}>
                <Ionicons name="alert-circle-outline" size={16} color={t.colors.danger} />
                <AppText variant="muted" tone="danger" style={{ flex: 1 }}>
                  {error}
                </AppText>
              </View>
            )}

            <GradientButton
              label="Sign in"
              onPress={() => void onSubmit()}
              loading={busy}
              style={{ marginTop: spacing.sm }}
            />
          </View>

          {/* ── Secondary links ──────────────────────────────────── */}
          <Pressable
            onPress={() => router.push('/(auth)/join' as never)}
            style={{ marginTop: spacing['2xl'] }}
            hitSlop={8}>
            <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              Have an invite link?{' '}
              <AppText variant="caption" tone="accent">
                Join here
              </AppText>
            </AppText>
          </Pressable>

          <AppText
            variant="caption"
            tone="faint"
            style={{ textAlign: 'center', marginTop: spacing.md }}>
            Use the same login as your SIRAH LIFE web portal.
          </AppText>
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
