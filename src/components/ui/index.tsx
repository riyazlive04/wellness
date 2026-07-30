/**
 * Small set of themed primitives so screens stay concise and consistent.
 * Ported spirit of the web shadcn/ui + design tokens, rebuilt for RN.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { font, radius, spacing } from '@/lib/theme';

/** Full-bleed page background with safe-area padding. */
export function Screen({
  children,
  edges = ['top'],
  style,
  ...rest
}: ViewProps & { children: ReactNode; edges?: Edge[] }) {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: t.colors.canvas }, style]}
      {...rest}>
      {children}
    </SafeAreaView>
  );
}

/** Scrollable page body with comfortable padding + bottom inset for the tab bar. */
export function ScreenScroll({
  children,
  contentContainerStyle,
  ...rest
}: ScrollViewProps & { children: ReactNode }) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        { padding: spacing.lg, paddingBottom: spacing['3xl'] * 2, gap: spacing.lg },
        contentContainerStyle,
      ]}
      {...rest}>
      {children}
    </ScrollView>
  );
}

/**
 * Lifts its children above the on-screen keyboard.
 *
 * `padding` is used on BOTH platforms deliberately: this app builds with
 * edge-to-edge enabled (forced on Android 15+), which breaks the classic
 * `adjustResize` behaviour, so leaving Android without a behavior lets the
 * keyboard cover the focused input.
 */
export function KeyboardAvoider({
  children,
  offset = 0,
  style,
}: {
  children: ReactNode;
  /** Extra space to clear (e.g. a bottom tab bar). */
  offset?: number;
  style?: ViewProps['style'];
}) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior="padding"
      keyboardVerticalOffset={offset}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Scrollable page body that also lifts inputs above the keyboard. Use instead of
 * ScreenScroll on any screen containing a TextInput.
 */
export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  offset = 0,
  ...rest
}: ScrollViewProps & { children: ReactNode; offset?: number }) {
  return (
    <KeyboardAvoider offset={offset}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[
          { padding: spacing.lg, paddingBottom: spacing['3xl'] * 2, gap: spacing.lg },
          contentContainerStyle,
        ]}
        {...rest}>
        {children}
      </ScrollView>
    </KeyboardAvoider>
  );
}

/** Elevated surface card. */
export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderColor: t.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.xl,
          padding: spacing.lg,
          // Soft "wellness" elevation — warm drop shadow (subtle in dark).
          shadowColor: '#0b2b30',
          shadowOpacity: t.dark ? 0.35 : 0.07,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 2,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'muted' | 'caption' | 'label';

const VARIANT: Record<TextVariant, { size: number; weight: '400' | '500' | '600' | '700' }> = {
  display: { size: font.size['4xl'], weight: font.weight.bold },
  title: { size: font.size['2xl'], weight: font.weight.bold },
  heading: { size: font.size.lg, weight: font.weight.semibold },
  body: { size: font.size.base, weight: font.weight.regular },
  muted: { size: font.size.sm, weight: font.weight.regular },
  caption: { size: font.size.xs, weight: font.weight.medium },
  label: { size: font.size.xs, weight: font.weight.semibold },
};

/** Themed text. `tone` picks the color role; `variant` the size/weight. */
export function AppText({
  children,
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: TextProps & {
  children: ReactNode;
  variant?: TextVariant;
  tone?: 'text' | 'muted' | 'faint' | 'accent' | 'onBrand' | 'danger' | 'success' | 'warning';
}) {
  const t = useTheme();
  const v = VARIANT[variant];
  const color = {
    text: t.colors.text,
    muted: t.colors.textMuted,
    faint: t.colors.textFaint,
    accent: t.colors.accent,
    onBrand: t.colors.onBrand,
    danger: t.colors.danger,
    success: t.colors.success,
    warning: t.colors.warning,
  }[tone];
  return (
    <Text
      style={[
        {
          color,
          fontSize: v.size,
          fontWeight: v.weight,
          letterSpacing: variant === 'label' || variant === 'caption' ? 0.4 : 0,
        },
        style,
      ]}
      {...rest}>
      {children}
    </Text>
  );
}

/** Primary CTA with the brand gradient. */
export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  style,
  ...rest
}: PressableProps & { label: string; loading?: boolean }) {
  const t = useTheme();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        { borderRadius: radius.pill, overflow: 'hidden', opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1 },
        style as object,
      ]}
      {...rest}>
      <LinearGradient
        colors={t.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 15, alignItems: 'center', justifyContent: 'center' }}>
        {loading ? (
          <ActivityIndicator color={t.colors.onBrand} />
        ) : (
          <AppText variant="heading" tone="onBrand">
            {label}
          </AppText>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** Subtle outline/ghost button. */
export function GhostButton({
  label,
  onPress,
  style,
  ...rest
}: PressableProps & { label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          borderRadius: radius.pill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.border,
          backgroundColor: pressed ? t.colors.surfaceStrong : 'transparent',
          paddingVertical: 13,
          alignItems: 'center',
        },
        style as object,
      ]}
      {...rest}>
      <AppText variant="heading" tone="muted">
        {label}
      </AppText>
    </Pressable>
  );
}

/** Section label — small uppercase eyebrow used above card groups. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <AppText variant="label" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}>
      {children}
    </AppText>
  );
}
