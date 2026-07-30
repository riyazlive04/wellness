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
import { useTheme } from '@/hooks/use-theme';
import { extractJoinToken } from '@/lib/join-token';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Manual invite entry when the user pastes a join link / token (no deep link). */
export default function JoinEntry() {
  const t = useTheme();
  const router = useRouter();
  const [raw, setRaw] = useState('');
  // Purely cosmetic: drives the teal focus ring on the active field.
  const [focused, setFocused] = useState(false);

  const go = () => {
    const token = extractJoinToken(raw);
    if (!token) {
      Alert.alert('Missing invite', 'Paste your invite link or token.');
      return;
    }
    router.push({ pathname: '/join/[token]', params: { token } } as never);
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
              <Ionicons name="link" size={28} color={t.colors.onBrand} />
            </LinearGradient>

            <View style={{ gap: 6, alignItems: 'center', marginTop: spacing.xl }}>
              <AppText variant="title" style={{ letterSpacing: 0.5 }}>
                Join with invite
              </AppText>
              <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
                Paste the invite link your nutritionist sent, or just the token from the end of the URL.
              </AppText>
            </View>
          </View>

          {/* ── Invite entry ─────────────────────────────────────── */}
          <View style={{ gap: spacing.md, marginTop: spacing['3xl'] }}>
            <Field
              icon="ticket-outline"
              focused={focused}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              value={raw}
              onChangeText={setRaw}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://…/join/… or token"
            />

            <GradientButton label="Continue" onPress={go} style={{ marginTop: spacing.sm }} />
          </View>

          {/* ── Secondary link ───────────────────────────────────── */}
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing['2xl'] }} hitSlop={8}>
            <AppText variant="caption" tone="accent" style={{ textAlign: 'center' }}>
              Back to sign in
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
  style,
  ...inputProps
}: TextInputProps & {
  icon: IoniconName;
  focused: boolean;
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
});
