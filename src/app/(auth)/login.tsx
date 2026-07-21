import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, GradientButton } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { radius, spacing } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    // On success the root auth gate redirects into the tabs.
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: t.colors.surfaceStrong,
      borderColor: t.colors.border,
      color: t.colors.text,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      <LinearGradient
        colors={[t.gradient[0] + '30', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.6 }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Brand mark */}
          <LinearGradient
            colors={t.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mark}>
            <AppText variant="title" tone="onBrand">
              S
            </AppText>
          </LinearGradient>

          <View style={{ gap: spacing.xs, marginTop: spacing.xl }}>
            <AppText variant="title">Welcome back</AppText>
            <AppText variant="body" tone="muted">
              Sign in to your SIRAH LIFE wellness space.
            </AppText>
          </View>

          <View style={{ gap: spacing.md, marginTop: spacing['2xl'] }}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="muted">
                EMAIL
              </AppText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={t.colors.textFaint}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={inputStyle}
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="muted">
                PASSWORD
              </AppText>
              <View style={{ justifyContent: 'center' }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={t.colors.textFaint}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  style={inputStyle}
                />
                <Pressable
                  onPress={() => setShowPw((s) => !s)}
                  style={styles.showBtn}
                  hitSlop={8}>
                  <AppText variant="caption" tone="accent">
                    {showPw ? 'HIDE' : 'SHOW'}
                  </AppText>
                </Pressable>
              </View>
            </View>

            {error && (
              <AppText variant="muted" tone="danger">
                {error}
              </AppText>
            )}

            <GradientButton
              label="Sign in"
              onPress={onSubmit}
              loading={busy}
              style={{ marginTop: spacing.sm }}
            />
          </View>

          <AppText variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: spacing['2xl'] }}>
            Use the same login as your SIRAH LIFE web portal.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
  },
  showBtn: {
    position: 'absolute',
    right: spacing.lg,
  },
});
