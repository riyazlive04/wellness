import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput } from 'react-native';

import { AppText, GradientButton, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { extractJoinToken } from '@/lib/join-token';
import { radius, spacing } from '@/lib/theme';

/** Manual invite entry when the user pastes a join link / token (no deep link). */
export default function JoinEntry() {
  const t = useTheme();
  const router = useRouter();
  const [raw, setRaw] = useState('');

  const go = () => {
    const token = extractJoinToken(raw);
    if (!token) {
      Alert.alert('Missing invite', 'Paste your invite link or token.');
      return;
    }
    router.push({ pathname: '/join/[token]', params: { token } } as never);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenScroll contentContainerStyle={styles.wrap}>
          <AppText variant="title">Join with invite</AppText>
          <AppText variant="muted" tone="muted">
            Paste the invite link your nutritionist sent, or just the token from the end of the URL.
          </AppText>
          <TextInput
            value={raw}
            onChangeText={setRaw}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…/join/… or token"
            placeholderTextColor={t.colors.textFaint}
            style={[
              styles.input,
              { borderColor: t.colors.border, color: t.colors.text, backgroundColor: t.colors.surfaceStrong },
            ]}
          />
          <GradientButton label="Continue" onPress={go} />
          <Pressable onPress={() => router.back()}>
            <AppText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
              Back to sign in
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
    fontSize: 15,
  },
});
