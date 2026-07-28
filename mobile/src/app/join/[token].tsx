import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';

import { AppText, Card, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { extractJoinToken } from '@/lib/join-token';
import { supabase } from '@/lib/supabase';
import { radius, spacing } from '@/lib/theme';

export default function JoinByInvite() {
  const t = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { token: paramToken } = useLocalSearchParams<{ token: string }>();
  const token = extractJoinToken(paramToken ?? '');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const previewQ = useQuery({
    queryKey: ['join', 'preview', token],
    queryFn: () => clientsApi.previewJoin(token),
    enabled: !!token,
    retry: 1,
  });

  useEffect(() => {
    // Prefill the name field from the signed-in identity.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (session?.user?.user_metadata?.full_name) {
      setName(String(session.user.user_metadata.full_name));
    } else if (session?.user?.email) {
      setName(session.user.email.split('@')[0] ?? '');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session]);

  const requestMut = useMutation({
    mutationFn: (displayName?: string) => clientsApi.requestJoin(token, displayName),
    onSuccess: (res) => {
      if (res.status === 'active') router.replace('/onboarding');
      else router.replace('/pending');
    },
    onError: (err: Error) => Alert.alert('Could not join', err.message),
  });

  const requestNow = () => requestMut.mutate(name.trim() || undefined);

  const signUpAndRequest = async () => {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (!email.trim() || !name.trim()) {
      Alert.alert('Missing details', 'Enter your name and email.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), role: 'client' } },
      });
      if (error) throw error;
      await clientsApi.requestJoin(token, name.trim());
      router.replace('/pending');
    } catch (e) {
      Alert.alert('Could not sign up', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
  ];

  if (!token) {
    return (
      <Screen>
        <ScreenScroll>
          <Card>
            <AppText variant="muted" tone="muted">
              Missing invite token.
            </AppText>
          </Card>
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenScroll>
          {previewQ.isLoading ? (
            <ActivityIndicator color={t.colors.accent} />
          ) : previewQ.isError ? (
            <Card style={{ gap: spacing.sm }}>
              <AppText variant="title">Invite not valid</AppText>
              <AppText variant="muted" tone="muted">
                {(previewQ.error as Error).message || 'This join link is expired or incorrect.'}
              </AppText>
              <Pressable onPress={() => router.replace('/(auth)/login')}>
                <AppText variant="caption" tone="accent">
                  Back to sign in
                </AppText>
              </Pressable>
            </Card>
          ) : (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="caption" tone="muted">
                {"You're joining"}
              </AppText>
              <AppText variant="title">{previewQ.data?.workspace_name}</AppText>
              <AppText variant="muted" tone="muted">
                After you request access, your nutritionist confirms before you enter the portal.
              </AppText>

              {session ? (
                <>
                  <AppText variant="caption" tone="muted">
                    Signed in as {session.user.email}
                  </AppText>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                  <GradientButton
                    label="Request to join"
                    onPress={requestNow}
                    loading={requestMut.isPending}
                    disabled={requestMut.isPending}
                  />
                </>
              ) : (
                <>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Password (min 8)"
                    placeholderTextColor={t.colors.textFaint}
                    style={inputStyle}
                  />
                  <GradientButton
                    label="Create account & request"
                    onPress={() => void signUpAndRequest()}
                    loading={busy}
                    disabled={busy}
                  />
                  <Pressable onPress={() => router.push('/(auth)/login')}>
                    <AppText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
                      Already have an account? Sign in, then reopen this invite.
                    </AppText>
                  </Pressable>
                </>
              )}
            </Card>
          )}
        </ScreenScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
  },
});
